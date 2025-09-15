// src/components/PostCard.jsx
import { useMemo, useRef, useState, useEffect } from "react";
import { saveFavs, markViewed } from "../utils/storage.js";
import { excerpt, getDomain } from "../utils/text.js";

/* IntersectionObserver helper */
function useInViewport(opts = { root: null, rootMargin: "300px", threshold: 0.01 }) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        if (!ref.current || typeof IntersectionObserver === "undefined") return;
        const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), opts);
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);
    return [ref, inView];
}

export default function PostCard({ post, favs, setFavs, base, searchTerm = "", isViewed = false }) {
    /* URL helpers for Astro base */
    const withBase = (u) => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        if (u.startsWith(base)) return u;
        if (u.startsWith("/")) return base + u.slice(1);
        return base + u;
    };
    const withBaseInSrcSet = (srcset) => {
        if (!srcset) return undefined;
        return srcset
            .split(",")
            .map((s) => {
                const [url, desc] = s.trim().split(/\s+/, 2);
                const url2 = withBase(url);
                return desc ? `${url2} ${desc}` : url2;
            })
            .join(", ");
    };

    /* favorites */
    const isFav = favs.has(post.id);
    const toggleFav = () => {
        const next = new Set(favs);
        if (isFav) next.delete(post.id);
        else next.add(post.id);
        setFavs(next);
        saveFavs(next);
    };

    /* dates */
    const dt = post.created_utc ? new Date(post.created_utc * 1000) : null;
    const dateISO = dt ? dt.toISOString() : "";
    const dateLabel = dt
        ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : "";

    /* ---------- Unified media model (new + legacy fallback) ---------- */
    // New: media_items [{ index, kind: 'image'|'gif'|'video'|'redgiphy', url, poster? }]
    const newItems = Array.isArray(post.media_items) ? post.media_items : null;

    // Legacy fallback: media_urls / media_url_compact + media_type
    const legacyUrls = Array.isArray(post.media_urls)
        ? post.media_urls
        : (post.media_url_compact
            ? (Array.isArray(post.media_url_compact) ? post.media_url_compact : [post.media_url_compact])
            : []);
    const legacyItems = legacyUrls.map((u, i) => {
        const isMp4 = /\.mp4(\?|#|$)/i.test(u);
        const isGif = /\.gif(\?|#|$)/i.test(u);
        const kind = isMp4 ? "video" : isGif ? "gif" : "image";
        return { index: i + 1, kind, url: u };
    });

    const galleryItems = (newItems && newItems.length ? newItems : legacyItems);
    const isGallery = galleryItems.length > 1;
    const lead = galleryItems[0] || null;

    // Label pill: "gallery (N)" or the lead kind
    const pillLabel = isGallery ? `gallery (${galleryItems.length})` : (lead?.kind || post.media_type || null);

    // Card preview image (always image)
    const previewImg = post.media_preview || post.preview?.src || null;

    /* search highlight */
    function renderHighlighted(text, q) {
        const query = (q || "").trim();
        if (!query) return text;
        try {
            const re = new RegExp(`(${query.replace(/[.*?^${}()|[\\]\\\\]/g, "\\$&")})`, "ig");
            const parts = String(text).split(re);
            return parts.map((chunk, i) =>
                re.test(chunk) ? <mark key={i}>{chunk}</mark> : <span key={i}>{chunk}</span>
            );
        } catch {
            return text;
        }
    }

    const previewText = excerpt(
        post.selftext_preview ||
        (post.media_type === "link" && post.url ? `Link: ${getDomain(post.url)}` : "") ||
        "",
        240
    );

    const hasThumb = !!previewImg || (lead && (lead.kind === "video" || lead.kind === "redgiphy" || lead.kind === "gif"));
    const gridClass = `pc-grid ${hasThumb ? "has-thumb" : "no-thumb"}`;

    /* expand/collapse */
    const [expanded, setExpanded] = useState(false);

    /* ---------- Expanded: inline gallery with controls & safe video playback ---------- */
    const Expanded = useMemo(() => {
        if (!expanded || !galleryItems.length) return null;

        function VisibleVideo({ src, k }) {
            const [wrapRef, inView] = useInViewport({ root: null, rootMargin: "300px", threshold: 0.01 });
            const vRef = useRef(null);

            useEffect(() => {
                const v = vRef.current;
                if (!v) return;
                if (inView) {
                    v.play().catch(() => { });
                } else {
                    v.pause();
                    try { v.currentTime = 0; } catch { }
                }
            }, [inView]);

            // pause on unmount (collapse or slide change)
            useEffect(() => () => { try { vRef.current && vRef.current.pause(); } catch { } }, []);

            return (
                <div ref={wrapRef} className="pc-expand">
                    <video
                        key={k}
                        ref={vRef}
                        className="pc-media-el"
                        src={src}
                        autoPlay
                        loop
                        playsInline
                        controls
                        preload="auto"
                    />
                </div>
            );
        }

        // If only one item, render plain
        if (galleryItems.length === 1) {
            const only = galleryItems[0];
            if (only.kind === "video" || only.kind === "redgiphy") {
                return <VisibleVideo key={`v:${post.id}:single`} src={only.url} />;
            }
            return (
                <div className="pc-expand">
                    <img src={only.url} alt="" loading="eager" decoding="async" className="pc-media-el" />
                </div>
            );
        }

        // Multi-item gallery
        function Gallery() {
            const [idx, setIdx] = useState(0);
            const total = galleryItems.length;
            const curr = galleryItems[idx];

            const go = (d) => setIdx((i) => (i + d + total) % total);
            const prev = () => go(-1);
            const next = () => go(+1);

            // Keyboard nav
            useEffect(() => {
                const onKey = (e) => {
                    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
                    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
                };
                window.addEventListener("keydown", onKey);
                return () => window.removeEventListener("keydown", onKey);
            }, [total]);

            // Prefetch next image
            useEffect(() => {
                const nxt = galleryItems[(idx + 1) % total];
                if (nxt && nxt.kind === "image") {
                    const img = new Image();
                    img.src = nxt.url;
                }
            }, [idx, total]);

            return (
                <div className="pc-expand">
                    <div className="pc-gallery">
                        <div className="pc-gctl">
                            <button type="button" className="button" onClick={prev} aria-label="Previous media" title="Previous (←)">‹ Prev</button>
                            <span className="pc-gcount">{idx + 1} / {total}</span>
                            <button type="button" className="button" onClick={next} aria-label="Next media" title="Next (→)">Next ›</button>
                        </div>

                        {curr.kind === "video" || curr.kind === "redgiphy" ? (
                            <VisibleVideo key={`v:${post.id}:${idx}`} src={curr.url} />
                        ) : (
                            <img
                                key={`${curr.kind[0]}:${post.id}:${idx}`}
                                src={curr.url}
                                alt=""
                                loading="eager"
                                decoding="async"
                                className="pc-media-el"
                            />
                        )}
                    </div>
                </div>
            );
        }

        return <Gallery />;
    }, [expanded, galleryItems, post.id]);

    return (
        <article className={`card post-card ${isViewed ? "is-viewed" : ""}`}>
            <div className={gridClass}>
                {/* Left thumbnail (always image when available) */}
                {hasThumb ? (
                    <aside className="pc-left">
                        <a
                            href={`${base}post/${encodeURIComponent(post.id)}`}
                            onClick={() => {
                                try {
                                    const key = "feed:scroll:" + location.search;
                                    sessionStorage.setItem(key, String(window.scrollY || 0));
                                } catch { }
                                markViewed(post.id);
                            }}
                        >
                            {previewImg ? (
                                <img
                                    className="pc-thumb"
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                    src={withBase(post.preview?.src || previewImg)}
                                    {...(post.preview?.srcset ? { srcSet: withBaseInSrcSet(post.preview.srcset) } : {})}
                                    {...(post.preview?.sizes ? { sizes: post.preview.sizes } : {})}
                                    {...(post.preview?.w && post.preview?.h ? { width: post.preview.w, height: post.preview.h } : {})}
                                />
                            ) : (
                                <div className="pc-thumb pc-thumb--video"><span className="pc-play">▶</span></div>
                            )}
                        </a>
                    </aside>
                ) : null}

                {/* Right column */}
                <div className="pc-right">
                    <div className="topline">
                        {post.subreddit && (
                            <a
                                className="subreddit"
                                href={`https://www.reddit.com/r/${encodeURIComponent(post.subreddit)}`}
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                r/{post.subreddit}
                            </a>
                        )}
                        <span className="dot">•</span>
                        {post.author && (
                            <span className="by">
                                Posted by{" "}
                                <a
                                    className="author"
                                    href={`https://www.reddit.com/user/${encodeURIComponent(post.author)}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    u/{post.author}
                                </a>
                            </span>
                        )}
                        {dateLabel && (
                            <>
                                <span className="dot">•</span>
                                <time dateTime={dateISO} title={dt?.toLocaleString?.() || ""}>{dateLabel}</time>
                            </>
                        )}
                        {post.saved_index != null && (
                            <>
                                <span className="dot">•</span>
                                <span className="saved meta">Saved #{post.saved_index}</span>
                            </>
                        )}
                    </div>

                    <h3 className="title">
                        <a
                            className="title-link"
                            href={`${base}post/${encodeURIComponent(post.id)}`}
                            onClick={() => {
                                try {
                                    const key = "feed:scroll:" + location.search;
                                    sessionStorage.setItem(key, String(window.scrollY || 0));
                                } catch { }
                                markViewed(post.id);
                            }}
                        >
                            {renderHighlighted(post.title, searchTerm)}
                        </a>
                        {post.flair ? <span className="flair">{post.flair}</span> : null}
                        {pillLabel ? <span className="pill">{pillLabel}</span> : null}
                    </h3>

                    {previewText && <p className="preview">{renderHighlighted(previewText, searchTerm)}</p>}

                    <div className="bottomline">
                        {post.score != null && <span className="score">▲ {post.score}</span>}
                        <span className="dot">•</span>
                        {post.num_comments != null && <span className="comments">💬 {post.num_comments}</span>}

                        {galleryItems.length > 0 && (
                            <>
                                <span className="dot">•</span>
                                <button
                                    className="action expand"
                                    type="button"
                                    onClick={() => {
                                        setExpanded((e) => !e);
                                        markViewed(post.id);
                                    }}
                                    aria-expanded={expanded ? "true" : "false"}
                                    title={expanded ? "Collapse media" : "Expand media"}
                                >
                                    {expanded ? "ᐱ Collapse" : "⤢ Expand"}
                                </button>
                            </>
                        )}

                        <span className="spacer" />
                        {post.permalink && (
                            <a
                                className="action view"
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => markViewed(post.id)}
                            >
                                View on Reddit
                            </a>
                        )}
                        <button
                            className={`star ${isFav ? "is-on" : ""}`}
                            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                            aria-pressed={isFav ? "true" : "false"}
                            onClick={toggleFav}
                        >
                            {isFav ? "⭐ Star" : "☆ Star"}
                        </button>
                    </div>

                    {/* Inline expanded media area */}
                    {Expanded}
                </div>
            </div>
        </article>
    );
}
