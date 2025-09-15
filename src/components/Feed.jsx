// src/components/Feed.jsx
// The main feed of posts, with search, filtering, sorting, infinite scroll
// Relies on a prebuilt posts-manifest.json file (see scripts/ folder)
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PostCard from "./PostCard.jsx";
import { SkeletonCard } from "./Skeleton.jsx";
import { makeComparator } from "../utils/sorting.js";
import { loadFavs, getViewedSet } from "../utils/storage.js";

const BASE = import.meta.env.BASE_URL || "/";

function getSearchSafe() {
    if (typeof window === "undefined") return "";
    return window.location.search || "";
}

/** URL state hook that reacts to popstate + custom urlchange, and helps push updates */
function useQueryState() {
    const [q, setQ] = useState(() => new URLSearchParams(getSearchSafe()));

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onChange = () => setQ(new URLSearchParams(window.location.search));
        window.addEventListener("popstate", onChange);
        window.addEventListener("urlchange", onChange);
        return () => {
            window.removeEventListener("popstate", onChange);
            window.removeEventListener("urlchange", onChange);
        };
    }, []);

    const setQParams = useCallback((sp) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.search = sp.toString();
        window.history.pushState({}, "", url);
        window.dispatchEvent(new Event("urlchange"));
        setQ(new URLSearchParams(url.search));
    }, []);

    return [q, setQParams];
}

export default function Feed({ favoritesOnly = false }) {
    const [manifest, setManifest] = useState(null);
    const [error, setError] = useState(null);
    const [favs, setFavs] = useState(new Set());
    const [visible, setVisible] = useState(30); // number of items to render
    const [qParams, setQParams] = useQueryState();
    const viewed = useMemo(() => getViewedSet({ ttlDays: 14 }), [qParams.toString()]);

    // Load favorites (local) + refresh when storage changes
    useEffect(() => {
        const update = () => setFavs(loadFavs());
        update(); // initial
        if (typeof window !== "undefined") {
            window.addEventListener("favorites:changed", update);
            return () => window.removeEventListener("favorites:changed", update);
        }
    }, []);

    // Fetch posts manifest (feed index)
    useEffect(() => {
        let alive = true;
        setError(null);
        fetch(`${BASE}data/indexes/posts-manifest.json`)
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((data) => { if (alive) setManifest(data); })
            .catch((e) => { if (alive) setError(e.message || "Failed to load"); });
        return () => { alive = false; };
    }, []);

    // Wire up search + sort controls in the header (they exist in the DOM outside this component)
    useEffect(() => {
        if (typeof document === "undefined") return;
        const searchEl = document.getElementById("searchInput");
        const sortEl = document.getElementById("sortSelect");
        if (!searchEl || !sortEl) return;

        // sync current URL state to controls
        const sort = qParams.get("sort") || "saved";
        const dir = qParams.get("dir") || (sort === "created" ? "desc" : "asc");
        sortEl.value = sort;
        searchEl.value = qParams.get("q") || "";

        // small helpers to update URL without re-mounting this effect
        const replaceUrlParams = (sp) => {
            const url = new URL(window.location.href);
            url.search = sp.toString();
            history.replaceState({}, "", url);
            window.dispatchEvent(new Event("urlchange"));
        };
        const pushUrlParams = (sp) => {
            const url = new URL(window.location.href);
            url.search = sp.toString();
            history.pushState({}, "", url);
            window.dispatchEvent(new Event("urlchange"));
        };

        // debounce (200ms) and IME composition guard
        let compose = false;
        let t = null;
        const DEBOUNCE_MS = 200;

        const debouncedReplace = (val) => {
            clearTimeout(t);
            t = setTimeout(() => {
                const next = new URLSearchParams({ ...Object.fromEntries(qParams), q: val });
                // while typing: keep history clean
                replaceUrlParams(next);
            }, DEBOUNCE_MS);
        };

        const commitPush = (val) => {
            clearTimeout(t);
            const next = new URLSearchParams({ ...Object.fromEntries(qParams), q: val });
            // on commit: create a proper history entry
            pushUrlParams(next);
        };

        const onInput = (e) => {
            if (compose) return;            // ignore while composing (IME)
            debouncedReplace(e.target.value);
        };
        const onCompositionStart = () => { compose = true; };
        const onCompositionEnd = (e) => {
            compose = false;
            // apply final composed text immediately
            commitPush(e.target.value);
        };

        // Enter commits immediately
        const onKeyDown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commitPush(searchEl.value);
            }
        };

        // Blur commits whatever is there
        const onBlur = () => commitPush(searchEl.value);

        // type="search" fires 'search' on clear (×) → commit immediately
        const onSearchEvt = (e) => commitPush(e.target.value);

        // Sort change keeps your existing behavior
        const onSort = (e) => {
            const s = e.target.value;
            const next = new URLSearchParams({ ...Object.fromEntries(qParams), sort: s });
            if (!next.get("dir")) next.set("dir", s === "created" ? "desc" : "asc");
            pushUrlParams(next);
        };

        searchEl.addEventListener("input", onInput);
        searchEl.addEventListener("compositionstart", onCompositionStart);
        searchEl.addEventListener("compositionend", onCompositionEnd);
        searchEl.addEventListener("keydown", onKeyDown);
        searchEl.addEventListener("blur", onBlur);
        searchEl.addEventListener("search", onSearchEvt); // native clear
        sortEl.addEventListener("change", onSort);

        return () => {
            clearTimeout(t);
            searchEl.removeEventListener("input", onInput);
            searchEl.removeEventListener("compositionstart", onCompositionStart);
            searchEl.removeEventListener("compositionend", onCompositionEnd);
            searchEl.removeEventListener("keydown", onKeyDown);
            searchEl.removeEventListener("blur", onBlur);
            searchEl.removeEventListener("search", onSearchEvt);
            sortEl.removeEventListener("change", onSort);
        };
    }, [qParams]);

    // OPTIONAL NICETY: when query params change significantly, start with the first page again
    useEffect(() => {
        setVisible(30);
        // If you prefer to also jump to top on a new view, uncomment:
        // if (typeof window !== "undefined") window.scrollTo(0, 0);
    }, [qParams.toString()]);

    // Build the filtered + sorted list from manifest
    const filteredSorted = useMemo(() => {
        if (!manifest) return [];

        let arr = manifest;

        // favorites-only route
        if (favoritesOnly) arr = arr.filter((p) => favs.has(p.id));

        // search filter
        const q = (qParams.get("q") || "").toLowerCase().trim();
        if (q) {
            arr = arr.filter(
                (p) =>
                    (p.title && p.title.toLowerCase().includes(q)) ||
                    (p.selftext_preview && p.selftext_preview.toLowerCase().includes(q))
            );
        }

        // facet filters (OR across groups, AND not required)
        const listParam = (k) =>
            (qParams.get(k) || "")
                .split(",")
                .map((s) => s && decodeURIComponent(s))
                .filter(Boolean);

        const subs = new Set(listParam("subs"));
        const authors = new Set(listParam("authors"));
        const flairs = new Set(listParam("flairs"));
        const media = new Set(listParam("media"));
        const domains = new Set(listParam("domains"));
        const anySelected =
            subs.size || authors.size || flairs.size || media.size || domains.size;

        if (anySelected) {
            const mode = (qParams.get("mode") || "or").toLowerCase();
            arr = arr.filter((p) => {
                const s = subs.size && p.subreddit && subs.has(String(p.subreddit));
                const a = authors.size && p.author && authors.has(String(p.author));
                const f = flairs.size && p.flair && flairs.has(String(p.flair));
                // BEFORE: const m = media.size && p.media_type && media.has(String(p.media_type));
                const pKindsArr = Array.isArray(p.media_types) ? p.media_types : (p.media_type ? [p.media_type] : []);
                const m = media.size && pKindsArr.some(k => media.has(String(k)));
                const d = domains.size && p.link_domain && domains.has(String(p.link_domain));

                const hasAny = !!(s || a || f || m || d);
                const hasAll = [
                    subs.size ? s : true,
                    authors.size ? a : true,
                    flairs.size ? f : true,
                    media.size ? m : true,
                    domains.size ? d : true
                ].every(Boolean);
                return mode === "and" ? hasAll : hasAny;
            });
        }

        // Tri-state view filter: view=all|viewed|unviewed  (back-compat: ?hide_viewed=1 → unviewed)
        let mode = (qParams.get("view") || "").toLowerCase();
        if (!mode && (qParams.get("hide_viewed") || "") === "1") mode = "unviewed";

        if (mode === "unviewed") {
            arr = arr.filter((p) => !viewed.has(p.id));
        } else if (mode === "viewed") {
            arr = arr.filter((p) => viewed.has(p.id));
        }

        // sort by field + direction (URL-driven)
        const sort = qParams.get("sort") || "saved";
        const dir = qParams.get("dir") || (sort === "created" ? "desc" : "asc");
        let out = [...arr].sort(makeComparator(sort, dir));

        // optional bucket: favorites first (keeps chosen sort inside buckets)
        const favFirst = qParams.get("favfirst") === "1";
        if (favFirst) {
            const starred = out.filter((p) => favs.has(p.id));
            const rest = out.filter((p) => !favs.has(p.id));
            out = [...starred, ...rest];
        }

        return out;
    }, [manifest, qParams, favoritesOnly, favs, viewed]);

    // Robust infinite scroll: observer + callback ref so we attach exactly when the sentinel mounts
    const ioRef = useRef(null);
    const sentinelElRef = useRef(null);

    const setSentinel = useCallback((el) => {
        // detach from old element
        if (sentinelElRef.current && ioRef.current) {
            try { ioRef.current.unobserve(sentinelElRef.current); } catch { }
        }
        sentinelElRef.current = el;
        // observe new element if IO is ready
        if (el && ioRef.current) {
            try { ioRef.current.observe(el); } catch { }
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        // create the observer once
        ioRef.current = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible((v) => v + 30); // load next chunk
                }
            },
            {
                root: null,
                // generous margins so we load before hitting bottom; resilient to fixed header
                rootMargin: "600px 0px 600px 0px",
                threshold: 0.01,
            }
        );
        // if the sentinel is already mounted, observe it
        if (sentinelElRef.current) {
            try { ioRef.current.observe(sentinelElRef.current); } catch { }
        }
        return () => {
            try { ioRef.current && ioRef.current.disconnect(); } catch { }
            ioRef.current = null;
        };
    }, []);

    // Loading / error states
    if (error) {
        return (
            <div className="container">
                <div className="card">
                    <h3>Couldn’t load posts</h3>
                    <div className="meta">{error}</div>
                </div>
            </div>
        );
    }
    if (!manifest) {
        return (
            <div className="container" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
        );
    }

    const items = filteredSorted.slice(0, visible);
    const hasMore = visible < filteredSorted.length;

    return (
        <div className="container">
            {items.length === 0 && (
                <div className="card">
                    <h3>No results</h3>
                    <div className="meta">Try clearing filters or changing your search.</div>
                </div>
            )}

            {items.map((p) => (
                <PostCard
                    key={p.id}
                    post={p}
                    favs={favs}
                    setFavs={setFavs}
                    base={BASE}
                    searchTerm={(qParams.get("q") || "").trim()}
                    isViewed={viewed.has(p.id)}
                />
            ))}

            {/* sentinel for infinite scroll */}
            {hasMore && <div ref={setSentinel} className="sentinel" />}
        </div>
    );
}
