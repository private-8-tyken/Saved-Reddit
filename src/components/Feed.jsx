// src/components/Feed.jsx
// Main feed component: handles loading, filtering, sorting, infinite scroll
import { useEffect, useMemo, useRef, useState } from "react";
import PostCard from "./PostCard.jsx";
import { SkeletonCard } from "./Skeleton.jsx";
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
        const onChange = () => setQ(new URLSearchParams(window.location.search));
        window.addEventListener("popstate", onChange);
        window.addEventListener("urlchange", onChange);   // ← listen to our app event
        return () => {
            window.removeEventListener("popstate", onChange);
            window.removeEventListener("urlchange", onChange);
        };
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

    // restore scroll position for this query state
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const key = 'feed:scroll:' + window.location.search;
        const y = Number(sessionStorage.getItem(key) || 0);
        if (y > 0) {
            // wait a tick to ensure initial items render
            requestAnimationFrame(() => window.scrollTo(0, y));
        }
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

        // facet filters from URL
        const listParam = (k) => (qParams.get(k) || '')
            .split(',').filter(Boolean).map(decodeURIComponent);
        const subs = new Set(listParam('subs'));
        const authors = new Set(listParam('authors'));
        const flairs = new Set(listParam('flairs'));
        const media = new Set(listParam('media'));
        const domains = new Set(listParam('domains'));
        const anySelected = subs.size || authors.size || flairs.size || media.size || domains.size;
        if (anySelected) {
            arr = arr.filter(p => {
                const s = subs.size && p.subreddit && subs.has(String(p.subreddit));
                const a = authors.size && p.author && authors.has(String(p.author));
                const f = flairs.size && p.flair && flairs.has(String(p.flair));
                const m = media.size && p.media_type && media.has(String(p.media_type));
                const d = domains.size && p.link_domain && domains.has(String(p.link_domain));
                return !!(s || a || f || m || d); // OR across groups
            });
        }

        // TODO: apply facet filters from URL in next phase
        const sort = qParams.get('sort') || 'saved';
        const dir = qParams.get('dir') || (sort === 'created' ? 'desc' : 'asc');
        const cmp = makeComparator(sort, dir);
        const favFirst = qParams.get('favfirst') === '1';
        let out = [...arr].sort(cmp);
        if (favFirst) {
            const starred = out.filter(p => favs.has(p.id));
            const rest = out.filter(p => !favs.has(p.id));
            out = [...starred, ...rest];
        }
        return out;
    }, [manifest, qParams, favoritesOnly, favs]);

    // If the manifest hasn't loaded yet, show placeholders
    if (!manifest) {
        return (
            <div className="container" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
        );
    }

    return (
        <div className="container">
            <div className="grid">
                {/* 12 columns: simple full-width list for now */}
                <div className="col" style={{ gridColumn: 'span 12' }}>
                    {filteredSorted.slice(0, visible).map(p => (
                        <PostCard
                            key={p.id}
                            post={p}
                            favs={favs}
                            setFavs={setFavs}
                            base={BASE}
                            searchTerm={(qParams.get('q') || '').trim()}
                        />
                    ))}
                    <div ref={sentinelRef} className="sentinel" />
                </div>
            </div>
        </div>
    );
}
