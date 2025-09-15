// src/components/PostPage.jsx
// Post page component: displays a single post with media and comments
import { useEffect, useState, useRef, useMemo } from "react";
import CommentThread from "./CommentThread.jsx";
import { PostSkeleton } from "./Skeleton.jsx";
import { loadFavs, saveFavs } from "../utils/storage.js";

const BASE = import.meta.env.BASE_URL || "/";

/* ---------- tiny local utils for efficient media (additive) ---------- */
function useInView({ rootMargin = "300px", threshold = 0.01 } = {}) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const obs = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { rootMargin, threshold }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [rootMargin, threshold]);
    return [ref, inView];
}

function ImgSmart({ src, alt = "", srcSet, sizes, posterLike }) {
    const [hostRef, inView] = useInView();
    const [loaded, setLoaded] = useState(false);
    const realSrc = inView ? src : undefined;
    const displaySrc = realSrc || posterLike || src;
    return (
        <div ref={hostRef} style={{ borderRadius: 10, overflow: "hidden" }}>
            <img
                src={displaySrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                srcSet={inView ? srcSet : undefined}
                sizes={sizes || "(max-width: 768px) 100vw, 900px"}
                onLoad={() => setLoaded(true)}
                style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    filter: loaded ? "none" : "blur(12px)",
                    transition: "filter 180ms ease"
                }}
            />
        </div>
    );
}

function VideoSmart({ src, poster, mutedByType }) {
    const [hostRef, inView] = useInView();
    const [url, setUrl] = useState(null);
    const vRef = useRef(null);

    // Lazy-enable src only when in view
    useEffect(() => { if (inView && !url) setUrl(src); }, [inView, url, src]);

    // Pause/reset when out of view
    useEffect(() => {
        const v = vRef.current;
        if (!v) return;
        if (!inView) {
            try { v.pause(); v.currentTime = 0; } catch { }
        } else {
            v.play().catch(() => { });
        }
    }, [inView]);

    // Ensure pause on unmount
    useEffect(() => () => { try { vRef.current && vRef.current.pause(); } catch { } }, []);

    return (
        <div ref={hostRef} style={{ borderRadius: 10, overflow: "hidden" }}>
            <video
                ref={vRef}
                autoPlay
                playsInline
                preload="auto"
                poster={poster || ""}
                style={{ width: "100%", height: "auto", display: "block" }}
                src={url || undefined}
                muted={!!mutedByType}
                controls={!mutedByType}
                loop
            />
        </div>
    );
}

/* ---------- Unified shape helpers (new manifest + legacy fallback) ---------- */
function shapeFromNewManifest(man) {
    if (!man) return null;
    const items = Array.isArray(man.media_items) ? man.media_items : [];
    if (!items.length) return null;
    if (items.length > 1) {
        return {
            type: "gallery",
            items: items.map(it => ({ kind: it.kind, url: it.url, poster: it.poster || null }))
        };
    }
    const only = items[0];
    if (only.kind === "video" || only.kind === "redgiphy") {
        return { type: "video", src: only.url, poster: only.poster || man.media_preview || "", mutedByType: false };
    }
    if (only.kind === "gif") {
        // Render as <img> on PostPage (gifs as images)
        return { type: "image", src: only.url };
    }
    return { type: "image", src: only.url };
}

function shapeFromLegacy(man, post) {
    if (!man) return null;
    const urls = Array.isArray(man.media_urls)
        ? man.media_urls.filter(Boolean)
        : (Array.isArray(man.media_url_compact) ? man.media_url_compact : (man.media_url_compact ? [man.media_url_compact] : []));
    if (!urls.length) return null;
    const kind = (man.media_type || "").toLowerCase();
    const isVideoUrl = (u) => /\.mp4($|\?)/i.test(u) || /\.webm($|\?)/i.test(u);

    if (kind === "gallery" || urls.length > 1) {
        return { type: "gallery", items: urls.map(u => ({ kind: isVideoUrl(u) ? "video" : /\.gif(\?|#|$)/i.test(u) ? "gif" : "image", url: u })) };
    }
    const first = urls[0];
    if (kind === "video" || isVideoUrl(first)) return { type: "video", src: first, poster: man.media_preview || "", mutedByType: false };
    if (kind === "gif" || /\.gif(\?|#|$)/i.test(first)) return { type: "image", src: first };
    return { type: "image", src: first };
}

/* ---------- Gallery with controls & safe video playback ---------- */
function GalleryViewer({ items = [], title = "" }) {
    const [idx, setIdx] = useState(0);
    const total = items.length;
    const curr = items[idx];

    const go = (d) => setIdx((i) => (i + d + total) % total);
    const prev = () => go(-1);
    const next = () => go(+1);

    // Arrow-key navigation
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
            else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [total]);

    // Prefetch next image for snappier nav
    useEffect(() => {
        const nxt = items[(idx + 1) % total];
        if (nxt && nxt.kind === "image") {
            const img = new Image();
            img.src = nxt.url;
        }
    }, [idx, total, items]);

    return (
        <div>
            {total > 1 && (
                <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 8 }}>
                    <button className="button" onClick={prev} aria-label="Previous (←)">‹ Prev</button>
                    <div className="meta">{idx + 1}/{total}</div>
                    <button className="button" onClick={next} aria-label="Next (→)">Next ›</button>
                </div>
            )}

            {curr.kind === "video" || curr.kind === "redgiphy" ? (
                <VideoSmart src={curr.url} poster={curr.poster || ""} mutedByType={false} />
            ) : curr.kind === "gif" ? (
                <ImgSmart src={curr.url} alt={title} />
            ) : (
                <ImgSmart src={curr.url} alt={title} />
            )}
        </div>
    );
}

export default function PostPage({ id }) {
    const [post, setPost] = useState(null);  // original per-post JSON
    const [man, setMan] = useState(null);    // manifest entry
    const [error, setError] = useState(null);
    const [favs, setFavs] = useState(new Set());

    const isFav = favs.has(id);
    const toggleFav = () => {
        const next = new Set(favs);
        if (isFav) next.delete(id); else next.add(id);
        setFavs(next); saveFavs(next);
    };

    // Fetch the single post JSON
    useEffect(() => {
        let active = true;
        const ac = new AbortController();
        setError(null);
        setPost(null);
        fetch(`${BASE}data/posts/${id}.json`, { signal: ac.signal })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(data => { if (active) setPost(data); })
            .catch(e => { if (active && e.name !== "AbortError") setError(e.message || "Failed to load"); });
        return () => { active = false; ac.abort(); };
    }, [id]);

    // Fetch manifest, pick matching entry
    useEffect(() => {
        let active = true;
        const ac = new AbortController();
        setMan(null);
        fetch(`${BASE}data/indexes/posts-manifest.json`, { signal: ac.signal })
            .then(r => r.json())
            .then(list => {
                if (!active) return;
                const match = Array.isArray(list) ? list.find(x => x.id === id) : null;
                setMan(match || null);
            })
            .catch(() => { if (active) setMan(null); });
        return () => { active = false; ac.abort(); };
    }, [id]);

    useEffect(() => { setFavs(loadFavs()); }, []);

    if (error) {
        return (
            <div className="container">
                <div className="card">
                    <h3>Post not found</h3>
                    <div className="meta">{error}</div>
                    <div className="row" style={{ marginTop: 8 }}>
                        <button className="button" onClick={() => (history.length > 1 ? window.history.back() : (window.location.href = BASE))}>← Back</button>
                    </div>
                </div>
            </div>
        );
    }
    if (!post && !error) return <PostSkeleton />;

    const meta = [
        post.link_flair_text || post.flair || "",
        post.subreddit ? `r/${post.subreddit}` : "",
        post.author ? `u/${post.author}` : ""
    ].filter(Boolean).join(" • ");

    // Prefer new manifest model; fall back to legacy
    const shaped =
        shapeFromNewManifest(man) ||
        shapeFromLegacy(man, post) ||
        null;

    let media = null;
    if (shaped) {
        if (shaped.type === "video") {
            media = <VideoSmart src={shaped.src} poster={shaped.poster} mutedByType={shaped.mutedByType} />;
        } else if (shaped.type === "gallery") {
            media = <GalleryViewer items={shaped.items} title={post.title || ""} />;
        } else if (shaped.type === "image") {
            media = <ImgSmart src={shaped.src} alt={post.title || ""} />;
        }
    }

    return (
        <div className="container">
            <div className="row" style={{ marginTop: 12, marginBottom: 8 }}>
                <button className="button" onClick={() => (history.length > 1 ? window.history.back() : (window.location.href = BASE))}>← Back</button>
                <button className="button" onClick={toggleFav}>{isFav ? "⭐ Unstar" : "☆ Star"}</button>
                {(man?.permalink || post.permalink) && (
                    <a className="button" href={man?.permalink || post.permalink} target="_blank" rel="noopener noreferrer">Open on Reddit ↗</a>
                )}
            </div>

            <article className="card">
                <h2 style={{ marginTop: 0 }}>{post.title}</h2>
                <div className="meta">{meta}</div>
                <hr className="sep" />
                {media}
                {post.selftext && (
                    <>
                        <hr className="sep" />
                        <div style={{ whiteSpace: "pre-wrap" }}>{post.selftext}</div>
                    </>
                )}
            </article>

            <h3 style={{ marginTop: 16 }}>Comments</h3>
            <article className="card">
                <CommentThread comments={post.comments || []} />
            </article>
        </div>
    );
}
