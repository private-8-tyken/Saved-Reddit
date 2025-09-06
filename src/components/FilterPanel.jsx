// src/components/FilterPanel.jsx
// A slide-in panel for selecting filters (subreddits, authors, flairs, media types, domains).
import { useEffect, useMemo, useRef, useState } from "react";
import { countBy } from "../utils/counts.js";

const raw = import.meta.env.BASE_URL || "/";
const BASE = raw.endsWith("/") ? raw : raw + "/";

const GROUPS = [
    { key: "subs", title: "Subreddits", field: "subreddits", pick: (p) => p.subreddit },
    { key: "authors", title: "Authors", field: "authors", pick: (p) => p.author },
    { key: "flairs", title: "Flairs", field: "flairs", pick: (p) => p.flair },
    { key: "media", title: "Media Types", field: "mediaTypes", pick: (p) => p.media_type },
    { key: "domains", title: "Domains", field: "domains", pick: (p) => p.link_domain },
];

function parseLists(sp) {
    const o = {};
    for (const g of GROUPS) {
        const v = sp.get(g.key) || "";
        o[g.key] = v ? v.split(",").map(decodeURIComponent).filter(Boolean) : [];
    }
    return o;
}
function serializeLists(obj) {
    const sp = new URLSearchParams(window.location.search);
    for (const g of GROUPS) {
        const arr = obj[g.key] || [];
        if (arr.length) sp.set(g.key, arr.map(encodeURIComponent).join(","));
        else sp.delete(g.key);
    }
    return sp;
}
const label = (gKey, v) => (gKey === "subs" ? `r/${v}` : gKey === "authors" ? `u/${v}` : String(v));

export default function FilterPanel() {
    const [open, setOpen] = useState(false);
    const [facets, setFacets] = useState(null);     // from facets.json
    const [manifest, setManifest] = useState(null); // from posts-manifest.json (for counts)
    const [counts, setCounts] = useState(null);     // { subs:Map, authors:Map, ... }
    const [pending, setPending] = useState({ subs: [], authors: [], flairs: [], media: [], domains: [] });
    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState(() => Object.fromEntries(GROUPS.map((g) => [g.key, true])));
    const panelRef = useRef(null);

    // Load facets + manifest once (for counts)
    useEffect(() => {
        let alive = true;
        Promise.all([
            fetch(`${BASE}data/indexes/facets.json`).then((r) => r.json()),
            fetch(`${BASE}data/indexes/posts-manifest.json`).then((r) => r.json()),
        ])
            .then(([fac, man]) => {
                if (!alive) return;
                setFacets(fac);
                setManifest(man);
                // Build count maps for each group
                const maps = {};
                for (const g of GROUPS) {
                    maps[g.key] = countBy(man, g.pick);
                }
                setCounts(maps);
            })
            .catch(() => {
                setFacets(null);
                setManifest(null);
                setCounts(null);
            });
        return () => { alive = false; };
    }, []);

    // Open/close plumbing + swipe + Esc
    useEffect(() => {
        const onOpen = () => {
            const sp = new URLSearchParams(window.location.search);
            setPending(parseLists(sp));
            setOpen(true);
            setQuery("");
            setTimeout(() => panelRef.current?.focus(), 0);
        };
        const onClose = () => setOpen(false);
        window.addEventListener("filters:open", onOpen);
        window.addEventListener("filters:close", onClose);
        const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("keydown", onEsc);

        // swipe from left edge to open (mobile)
        let touchStartX = null, touching = false;
        const onTS = (e) => {
            const t = e.touches?.[0]; if (!t) return;
            if (t.clientX <= 24 && !open) { touching = true; touchStartX = t.clientX; }
        };
        const onTM = (e) => {
            if (!touching) return;
            const t = e.touches?.[0]; if (!t) return;
            if (t.clientX - touchStartX > 30) { touching = false; window.dispatchEvent(new CustomEvent("filters:open")); }
        };
        const onTE = () => { touching = false; };
        window.addEventListener("touchstart", onTS, { passive: true });
        window.addEventListener("touchmove", onTM, { passive: true });
        window.addEventListener("touchend", onTE, { passive: true });

        return () => {
            window.removeEventListener("filters:open", onOpen);
            window.removeEventListener("filters:close", onClose);
            window.removeEventListener("keydown", onEsc);
            window.removeEventListener("touchstart", onTS);
            window.removeEventListener("touchmove", onTM);
            window.removeEventListener("touchend", onTE);
        };
    }, [open]);

    // Focus trap when drawer is open
    useEffect(() => {
        if (!open) return;
        const root = panelRef.current;
        if (!root) return;

        const selectors = [
            'a[href]', 'button:not([disabled])', 'input:not([disabled])',
            'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
        ];
        const getFocusables = () => Array.from(root.querySelectorAll(selectors.join(",")));
        if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
        root.focus();

        const onKey = (e) => {
            if (e.key !== "Tab") return;
            const els = getFocusables();
            if (!els.length) return;
            const first = els[0], last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        root.addEventListener("keydown", onKey);
        return () => root.removeEventListener("keydown", onKey);
    }, [open]);

    // Build display lists with counts; filter by query; sort by count desc then A→Z
    const lists = useMemo(() => {
        if (!facets) return null;
        const q = query.trim().toLowerCase();
        const pick = (arr) => (q ? arr.filter((x) => String(x).toLowerCase().includes(q)) : arr);

        // Helper to map value -> {value, count}
        const withCounts = (values, map) =>
            values.map((v) => ({ value: v, count: (map?.get(String(v)) || 0) }));

        const byCountThenAlpha = (a, b) =>
            (b.count - a.count) || String(a.value).localeCompare(String(b.value));

        return {
            subs: withCounts(pick(facets.subreddits || []), counts?.subs).sort(byCountThenAlpha),
            authors: withCounts(pick(facets.authors || []), counts?.authors).sort(byCountThenAlpha),
            flairs: withCounts(pick(facets.flairs || []), counts?.flairs).sort(byCountThenAlpha),
            media: withCounts(pick(facets.mediaTypes || []), counts?.media).sort(byCountThenAlpha),
            domains: withCounts(pick(facets.domains || []), counts?.domains).sort(byCountThenAlpha),
        };
    }, [facets, counts, query]);

    function toggleVal(groupKey, val) {
        setPending((prev) => {
            const set = new Set(prev[groupKey]);
            if (set.has(val)) set.delete(val); else set.add(val);
            return { ...prev, [groupKey]: Array.from(set) };
        });
    }
    function apply() {
        const sp = serializeLists(pending);
        const url = new URL(window.location.href);
        url.search = sp.toString();
        history.pushState({}, "", url);
        window.dispatchEvent(new Event("urlchange"));
        setOpen(false);
    }
    function clearAll() { setPending({ subs: [], authors: [], flairs: [], media: [], domains: [] }); }
    function closeWithoutApply() { setOpen(false); }

    return (
        <>
            <div className={`backdrop ${open ? "open" : ""}`} onClick={closeWithoutApply} />
            <aside
                className={`drawer ${open ? "open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Filters"
                tabIndex={-1}
                ref={panelRef}
            >
                <header>
                    <span style={{ flex: 1 }}>Filters</span>
                    <button className="button" onClick={closeWithoutApply} aria-label="Close">✕</button>
                </header>

                <div className="content">
                    <input
                        className="input searchbox"
                        placeholder="Search filters…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {!lists && <div className="meta">Loading…</div>}

                    {lists && GROUPS.map((g) => (
                        <div className="group" key={g.key}>
                            <h4>
                                <button
                                    type="button"
                                    className="button"
                                    style={{ padding: "4px 8px" }}
                                    onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                                    aria-expanded={!collapsed[g.key]}
                                    aria-controls={`facet-${g.key}`}
                                >
                                    {collapsed[g.key] ? "▸" : "▾"} {g.title}
                                </button>
                            </h4>

                            {!collapsed[g.key] && (
                                <div id={`facet-${g.key}`} className="facetlist">
                                    {(lists[g.key] || []).map(({ value, count }) => {
                                        const checked = pending[g.key]?.includes(value);
                                        return (
                                            <label key={`${g.key}:${value}`} className="facetitem">
                                                <input
                                                    type="checkbox"
                                                    checked={!!checked}
                                                    onChange={() => toggleVal(g.key, value)}
                                                />
                                                <span>{label(g.key, value)}</span>
                                                <span className="meta" style={{ marginLeft: "auto" }}>{count}</span>
                                            </label>
                                        );
                                    })}
                                    {(!lists[g.key] || lists[g.key].length === 0) && (
                                        <div className="meta">No matches.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="actions">
                    <button className="button" onClick={clearAll}>Clear all</button>
                    <button className="button primary" onClick={apply}>Apply</button>
                </div>
            </aside>
        </>
    );
}
