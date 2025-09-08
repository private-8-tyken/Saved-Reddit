// src/components/PostPage.jsx
// Post page component: displays a single post with media and comments
import { useEffect, useState, useRef } from "react";
import CommentThread from "./CommentThread.jsx";
import { PostSkeleton } from "./Skeleton.jsx";
import { loadFavs, saveFavs } from "../utils/storage.js";

const rawBase = import.meta.env.BASE_URL || "/";
const BASE = rawBase.endsWith('/') ? rawBase : rawBase + '/';

/* ---------- tiny local utils for efficient media (additive) ---------- */
function useInView({ rootMargin = "300px" } = {}) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { rootMargin, threshold: 0.01 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [rootMargin]);
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

function VideoSmart({ src, poster, mediaType }) {
    const [hostRef, inView] = useInView();
    const [url, setUrl] = useState(null);
    const isGifProxy = mediaType === "gif";
    useEffect(() => { if (inView && !url) setUrl(src); }, [inView, url, src]);
    return (
        <div ref={hostRef} style={{ borderRadius: 10, overflow: "hidden" }}>
            <video
                autoPlay
                playsInline
                preload="metadata"
                poster={poster || ""}
                style={{ width: "100%", height: "auto", display: "block" }}
                src={url || undefined}
                onPlay={(e) => {
                    const v = e.currentTarget;
                    const obs = new IntersectionObserver(([ent]) => {
                        if (!ent.isIntersecting) v.pause();
                    }, { threshold: 0.01 });
                    obs.observe(v);
                }}
                muted={isGifProxy}
                controls={!isGifProxy}
            />
        </div>
    );
}

function GallerySmart({ items = [], alt = "" }) {
    const [i, setI] = useState(0);
    if (!items.length) return null;
    const current = items[i] || items[0];
    return (
        <div>
            <ImgSmart src={current} alt={alt} />
            {items.length > 1 && (
                <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 8 }}>
                    <button className="button" onClick={() => setI(v => Math.max(0, v - 1))}>Prev</button>
                    <div className="meta">{i + 1}/{items.length}</div>
                    <button className="button" onClick={() => setI(v => Math.min(items.length - 1, v + 1))}>Next</button>
                </div>
            )}
        </div>
    );
}
/* --------------------------------------------------------------------- */

/** Map a manifest entry → renderable media shape (no hooks here). */
function shapeMediaFromManifest(entry) {
    if (!entry) return null;
    const kind = (entry.media_type || "").toLowerCase();
    const urls = Array.isArray(entry.media_urls) ? entry.media_urls.filter(Boolean) : [];
    const galleryCount = Number.isFinite(entry.gallery_count) ? entry.gallery_count : urls.length;
    const first = urls[0];
    const isVideoUrl = (u) => /\.mp4($|\?)/i.test(u) || /\.webm($|\?)/i.test(u);

    if (!urls.length) return null;
    if (kind === "gallery" || galleryCount > 1) return { type: "gallery", items: urls };
    if (kind === "video" || kind === "gif" || isVideoUrl(first)) {
        return { type: "video", src: first, poster: entry.media_preview || "" };
    }
    return { type: "image", src: first };
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
            .catch(e => { if (active && e.name !== "AbortError") setError(e.message || 'Failed to load'); });
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
        post.link_flair_text || post.flair || '',
        post.subreddit ? `r/${post.subreddit}` : '',
        post.author ? `u/${post.author}` : ''
    ].filter(Boolean).join(' • ');

    // Compute shaped media without hooks (prevents hook-order issues)
    let shaped = shapeMediaFromManifest(man);
    if (!shaped) {
        const m = post?.media;
        if (m?.video?.url) shaped = { type: "video", src: m.video.url, poster: m.video.poster || "" };
        else if (Array.isArray(m?.items) && m.items.length > 1) shaped = { type: "gallery", items: m.items.map(x => x.url) };
        else if (Array.isArray(m?.items) && m.items.length === 1) shaped = { type: "image", src: m.items[0].url };
        else if (m?.image?.url) shaped = { type: "image", src: m.image.url };
    }

    let media = null;
    if (shaped) {
        if (shaped.type === "video") media = <VideoSmart src={shaped.src} poster={shaped.poster} mediaType={man.media_type} />;
        else if (shaped.type === "gallery") media = <GallerySmart items={shaped.items} alt={post.title || ""} />;
        else if (shaped.type === "image") media = <ImgSmart src={shaped.src} alt={post.title || ""} />;
    }

    return (
        <div className="container">
            <div className="row" style={{ marginTop: 12, marginBottom: 8 }}>
                <button className="button" onClick={() => (history.length > 1 ? window.history.back() : (window.location.href = BASE))}>← Back</button>
                <button className="button" onClick={toggleFav}>{isFav ? '⭐ Unstar' : '☆ Star'}</button>
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
                        <div style={{ whiteSpace: 'pre-wrap' }}>{post.selftext}</div>
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
