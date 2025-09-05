// src/components/Feed.jsx
// Main feed component: handles loading, filtering, sorting, infinite scroll
import { useEffect, useMemo, useRef, useState } from "react";
import PostCard from "./PostCard.jsx";
import { makeComparator } from "../utils/sorting.js";
import { loadFavs } from "../utils/storage.js";

const raw = import.meta.env.BASE_URL || "/";
const BASE = raw.endsWith('/') ? raw : raw + '/';

function useQueryState() {
    const isClient = typeof window !== "undefined";
    const getSearch = () => (isClient ? window.location.search : "");
    const [q, setQ] = useState(() => new URLSearchParams(getSearch()));

    useEffect(() => {
        if (!isClient) return;
        const onPop = () => setQ(new URLSearchParams(window.location.search));
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [isClient]);

    const update = (nextParams) => {
        if (!isClient) return; // no-ops during SSR
        const url = new URL(window.location.href);
        nextParams.forEach((v, k) => url.searchParams.set(k, v));
        // remove empties
        Array.from(url.searchParams.keys()).forEach((k) => {
            if (!url.searchParams.get(k)) url.searchParams.delete(k);
        });
        window.history.pushState({}, "", url);
        setQ(new URLSearchParams(url.search));
    };

    return [q, update];
}

export default function Feed({ favoritesOnly = false }) {
    const [manifest, setManifest] = useState(null);
    const [qParams, setQParams] = useQueryState();
    const [visible, setVisible] = useState(30);
    const sentinelRef = useRef();
    const [favs, setFavs] = useState(new Set());   // SSR-safe initial
    useEffect(() => { setFavs(loadFavs()); }, []); // hydrate on client

    // Controls (search + sort) wiring
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const searchEl = document.getElementById("searchInput");
        const sortEl = document.getElementById("sortSelect");
        if (!searchEl || !sortEl) return;
        // Hydrate from URL (defaults: saved|asc)
        const sort = qParams.get('sort') || 'saved';
        const dir = qParams.get('dir') || (sort === 'created' ? 'desc' : 'asc');
        sortEl.value = `${sort}|${dir}`;
        searchEl.value = qParams.get('q') || '';

        const onSearch = (e) => {
            const v = e.target.value;
            setQParams(new URLSearchParams({ ...Object.fromEntries(qParams), q: v }));
        };
        const onSort = (e) => {
            const [s, d] = e.target.value.split('|');
            setQParams(new URLSearchParams({ ...Object.fromEntries(qParams), sort: s, dir: d }));
        };
        searchEl.addEventListener('input', onSearch);
        sortEl.addEventListener('change', onSort);
        return () => {
            searchEl.removeEventListener('input', onSearch);
            sortEl.removeEventListener('change', onSort);
        };
    }, [qParams, setQParams]);

    // Load manifest once
    useEffect(() => {
        fetch(`${BASE}data/indexes/posts-manifest.json`).then(r => r.json()).then(setManifest);
    }, []);

    // Infinite scroll sentinel
    useEffect(() => {
        if (!sentinelRef.current) return;
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) setVisible(v => v + 30);
        }, { rootMargin: '200px' });
        io.observe(sentinelRef.current);
        return () => io.disconnect();
    }, []);

    const filteredSorted = useMemo(() => {
        if (!manifest) return [];
        let arr = manifest;
        // favorites filter
        if (favoritesOnly) arr = arr.filter(p => favs.has(p.id));
        // search
        const q = (qParams.get('q') || '').toLowerCase().trim();
        if (q) {
            arr = arr.filter(p =>
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.selftext_preview && p.selftext_preview.toLowerCase().includes(q))
            );
        }
        // TODO: apply facet filters from URL in next phase
        const sort = qParams.get('sort') || 'saved';
        const dir = qParams.get('dir') || (sort === 'created' ? 'desc' : 'asc');
        const cmp = makeComparator(sort, dir);
        const out = [...arr].sort(cmp);
        return out;
    }, [manifest, qParams, favoritesOnly, favs]);

    return (
        <div className="container">
            <div className="grid">
                {/* 12 columns: simple full-width list for now */}
                <div className="col" style={{ gridColumn: 'span 12' }}>
                    {filteredSorted.slice(0, visible).map(p => (
                        <PostCard key={p.id} post={p} favs={favs} setFavs={setFavs} base={BASE} />
                    ))}
                    <div ref={sentinelRef} className="sentinel" />
                </div>
            </div>
        </div>
    );
}
