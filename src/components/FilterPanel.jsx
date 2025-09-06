// src/components/FilterPanel.jsx
// A side panel for selecting filters (subreddits, authors, flairs, media types, domains).
import { useEffect, useMemo, useRef, useState } from "react";

const raw = import.meta.env.BASE_URL || "/";
const BASE = raw.endsWith('/') ? raw : raw + '/';

const GROUPS = [
    { key: 'subs', title: 'Subreddits', field: 'subreddits' },
    { key: 'authors', title: 'Authors', field: 'authors' },
    { key: 'flairs', title: 'Flairs', field: 'flairs' },
    { key: 'media', title: 'Media Types', field: 'mediaTypes' },
    { key: 'domains', title: 'Domains', field: 'domains' },
];

function parseLists(sp) {
    const o = {};
    for (const g of GROUPS) {
        const v = sp.get(g.key) || '';
        o[g.key] = v ? v.split(',').map(decodeURIComponent).filter(Boolean) : [];
    }
    return o;
}
function serializeLists(obj) {
    const sp = new URLSearchParams(window.location.search);
    for (const g of GROUPS) {
        const arr = obj[g.key] || [];
        if (arr.length) sp.set(g.key, arr.map(encodeURIComponent).join(','));
        else sp.delete(g.key);
    }
    return sp;
}

export default function FilterPanel() {
    const [open, setOpen] = useState(false);
    const [facets, setFacets] = useState(null);
    const [pending, setPending] = useState({ subs: [], authors: [], flairs: [], media: [], domains: [] });
    const [query, setQuery] = useState('');
    const panelRef = useRef(null);
    const [collapsed, setCollapsed] = useState(() =>
        Object.fromEntries(GROUPS.map(g => [g.key, true])) // collapsed by default
    );

    // Load facets once
    useEffect(() => {
        fetch(`${BASE}data/indexes/facets.json`).then(r => r.json()).then(setFacets).catch(() => setFacets(null));
    }, []);

    // Open/close events
    useEffect(() => {
        const onOpen = () => {
            // hydrate from URL
            const sp = new URLSearchParams(window.location.search);
            setPending(parseLists(sp));
            setOpen(true);
            setQuery('');
            setTimeout(() => panelRef.current?.focus(), 0);
        };
        const onClose = () => setOpen(false);
        window.addEventListener('filters:open', onOpen);
        window.addEventListener('filters:close', onClose);
        const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onEsc);

        // Swipe from left edge to open (mobile)
        let touchStartX = null, touching = false;
        const onTS = (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            if (t.clientX <= 24 && !open) { touching = true; touchStartX = t.clientX; }
        };
        const onTM = (e) => {
            if (!touching) return;
            const t = e.touches?.[0]; if (!t) return;
            if (t.clientX - touchStartX > 30) { touching = false; window.dispatchEvent(new CustomEvent('filters:open')); }
        };
        const onTE = () => { touching = false; };
        window.addEventListener('touchstart', onTS, { passive: true });
        window.addEventListener('touchmove', onTM, { passive: true });
        window.addEventListener('touchend', onTE, { passive: true });

        return () => {
            window.removeEventListener('filters:open', onOpen);
            window.removeEventListener('filters:close', onClose);
            window.removeEventListener('keydown', onEsc);
            window.removeEventListener('touchstart', onTS);
            window.removeEventListener('touchmove', onTM);
            window.removeEventListener('touchend', onTE);
        };
    }, [open]);

    // Focus trap when drawer is open
    useEffect(() => {
        if (!open) return;
        const root = panelRef.current;
        if (!root) return;

        // Collect focusable elements
        const selectors = [
            'a[href]', 'button:not([disabled])', 'input:not([disabled])',
            'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
        ];
        const getFocusables = () => Array.from(root.querySelectorAll(selectors.join(',')));

        // Ensure panel itself is focusable
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus();

        const onKey = (e) => {
            if (e.key !== 'Tab') return;
            const els = getFocusables();
            if (!els.length) return;
            const first = els[0], last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        root.addEventListener('keydown', onKey);
        return () => root.removeEventListener('keydown', onKey);
    }, [open]);

    // Filtered facets based on search query
    const filteredFacets = useMemo(() => {
        if (!facets) return null;
        const q = query.trim().toLowerCase();
        if (!q) return facets;
        const pick = (arr) => arr.filter(x => String(x).toLowerCase().includes(q));
        return {
            subreddits: pick(facets.subreddits),
            authors: pick(facets.authors),
            flairs: pick(facets.flairs),
            mediaTypes: pick(facets.mediaTypes),
            domains: pick(facets.domains),
        };
    }, [facets, query]);

    function toggleVal(groupKey, val) {
        setPending(prev => {
            const set = new Set(prev[groupKey]);
            if (set.has(val)) set.delete(val); else set.add(val);
            return { ...prev, [groupKey]: Array.from(set) };
        });
    }

    function apply() {
        const sp = serializeLists(pending);
        const url = new URL(window.location.href);
        url.search = sp.toString();
        history.pushState({}, '', url);
        window.dispatchEvent(new Event('urlchange'));
        setOpen(false);
    }
    function clearAll() {
        setPending({ subs: [], authors: [], flairs: [], media: [], domains: [] });
    }
    function closeWithoutApply() { setOpen(false); }

    return (
        <>
            <div className={`backdrop ${open ? 'open' : ''}`} onClick={closeWithoutApply} />
            <aside
                className={`drawer ${open ? 'open' : ''}`}
                role="dialog" aria-modal="true" aria-label="Filters"
                tabIndex={-1} ref={panelRef}
            >
                <header>
                    <span style={{ flex: 1 }}>Filters</span>
                    <button className="button" onClick={closeWithoutApply} aria-label="Close">✕</button>
                </header>

                <div className="content">
                    <input className="input searchbox" placeholder="Search filters…" value={query} onChange={e => setQuery(e.target.value)} />
                    {!filteredFacets && <div className="meta">Loading…</div>}

                    {filteredFacets && GROUPS.map(g => (
                        <div className="group" key={g.key}>
                            <h4>
                                <button
                                    type="button"
                                    className="button"
                                    style={{ padding: '4px 8px' }}
                                    onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                                    aria-expanded={!collapsed[g.key]}
                                    aria-controls={`facet-${g.key}`}
                                >
                                    {collapsed[g.key] ? '▸' : '▾'} {g.title}
                                </button>
                            </h4>
                            {!collapsed[g.key] && (
                                <div id={`facet-${g.key}`} className="facetlist">
                                    {(filteredFacets[g.field] || []).map(v => {
                                        const checked = pending[g.key]?.includes(v);
                                        return (
                                            <label key={v} className="facetitem">
                                                <input type="checkbox" checked={!!checked} onChange={() => toggleVal(g.key, v)} />
                                                <span>
                                                    {g.key === 'subs' ? `r/${v}` : g.key === 'authors' ? `u/${v}` : String(v)}
                                                </span>
                                                <span className="meta" style={{ marginLeft: 'auto' }}>
                                                    {/* optional: count if you expose it later */}
                                                </span>
                                            </label>
                                        );
                                    })}
                                    {(!filteredFacets[g.field] || filteredFacets[g.field].length === 0) && (
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
