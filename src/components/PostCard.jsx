// src/components/PostCard.jsx
import { useMemo, useRef, useState, useEffect } from "react";
import { saveFavs, markViewed } from "../utils/storage.js";
import { excerpt, getDomain } from "../utils/text.js";
import VideoSmart from "./VideoSmart.jsx";

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

function VideoThumb({ src }) {
    const [wrapRef, inView] = useInViewport();
    const vRef = useRef(null);

    useEffect(() => {
        const v = vRef.current;
        if (!v) return;
        if (inView) {
            // lazy-start playback when visible
            v.play().catch(() => { });
        } else {
            v.pause();
        }
    }, [inView]);

    return (
        <div ref={wrapRef} className="pc-thumb pc-thumb--video">
            {/* preload="none" keeps it light */}
            <video
                ref={vRef}
                className="pc-thumb-video"
                src={src}
                muted
                loop
                playsInline
                preload="none"
            />
            <span className="pc-play">▶</span>
        </div>
    );
}

export default function PostCard({ post, favs, setFavs, base, searchTerm = "", isViewed = false }) {
    // --- URL helpers to respect Astro's base path for local /previews/* ---
    const withBase = (u) => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u; // absolute URL (Reddit/R2)
        if (u.startsWith(base)) return u; // already prefixed
        if (u.startsWith("/")) return base + u.slice(1); // root-relative -> base-relative
        return base + u; // plain relative -> base-relative
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

    // ----- favorites
    const isFav = favs.has(post.id);
    const toggleFav = () => {
        const next = new Set(favs);
        if (isFav) next.delete(post.id);
        else next.add(post.id);
        setFavs(next);
        saveFavs(next);
    };

    // ----- dates (restore original labels)
    const dt = post.created_utc ? new Date(post.created_utc * 1000) : null;
    const dateISO = dt ? dt.toISOString() : "";
    const dateLabel = dt
        ? dt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        })
        : "";

    // ----- manifest media bridge
    const mediaType = post.media_type || null; // 'image' | 'gallery' | 'video' | 'gif' | 'link' | 'text' | null
    const mediaPreview = post.media_preview || null;
    const mediaUrls = Array.isArray(post.media_urls)
        ? post.media_urls
        : post.media_url_compact
            ? Array.isArray(post.media_url_compact)
                ? post.media_url_compact
                : [post.media_url_compact]
            : [];
    const galleryCount = post.gallery_count ?? (mediaUrls.length > 1 ? mediaUrls.length : null);

    const firstUrl = mediaUrls[0] || "";
    const isMp4 = /\.mp4(\?|#|$)/i.test(firstUrl);
    const isGifFile = /\.gif(\?|#|$)/i.test(firstUrl);

    // Treat anything that is an MP4 (video/redgiphy) as video.
    const hasVideo = isMp4 || mediaType === "video";
    const hasGallery = mediaType === "gallery" && (galleryCount || 0) > 1;
    // Single image includes true images and GIF files (when the URL is .gif)
    const hasSingleImage =
        (mediaType === "image" && mediaUrls.length >= 1) ||
        (mediaType === "gif" && isGifFile);
    const hasAnyMedia = hasVideo || hasGallery || hasSingleImage;

    // ----- expand/collapse
    const [expanded, setExpanded] = useState(false);

    // ----- search highlight
    function renderHighlighted(text, q) {
        const query = (q || "").trim();
        if (!query) return text;
        try {
            const re = new RegExp(
                `(${query.replace(/[.*?^${}()|[\\]\\\\]/g, "\\$&")})`,
                "ig"
            );
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

    // ----- classnames to prevent squish when no thumb
    const hasThumb = !!mediaPreview || hasVideo; // treat video as “thumb-able”
    const gridClass = `pc-grid ${hasThumb ? "has-thumb" : "no-thumb"}`;

    // ----- inline expanded media (keep layout; simple, no extra components)
    const Expanded = useMemo(() => {
        if (!expanded || !hasAnyMedia) return null;

        // Videos/MP4s: autoplay on expand (muted + playsInline to satisfy autoplay policies)
        if (hasVideo) {
            return (
                <div className="pc-expand">
                    <video
                        className="pc-media-el"
                        src={firstUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                        preload="auto"
                    />
                </div>
            );
        }

        // Gallery: show the first image (keeping UI simple; no preview needed here)
        if (hasGallery) {
            return (
                <div className="pc-expand">
                    <div className="pc-gallery">
                        <img
                            src={firstUrl}
                            alt=""
                            loading="eager"
                            decoding="async"
                            className="pc-media-el"
                        />
                    </div>
                </div>
            );
        }

        // Single image or a real .gif file
        if (hasSingleImage) {
            return (
                <div className="pc-expand">
                    <img
                        src={firstUrl}
                        alt=""
                        loading="eager"
                        decoding="async"
                        className="pc-media-el"
                    />
                </div>
            );
        }

        return null;
    }, [expanded, hasAnyMedia, hasVideo, hasGallery, hasSingleImage, firstUrl]);

    return (
        <article className={`card post-card ${isViewed ? "is-viewed" : ""}`}>
            <div className={gridClass}>
                {/* Left thumbnail */}
                {hasThumb ? (
                    <aside className="pc-left">
                        <a
                            href={`${base}post/${encodeURIComponent(post.id)}`}
                            onClick={() => {
                                try {
                                    const key = "feed:scroll:" + location.search;
                                    sessionStorage.setItem(key, String(window.scrollY || 0));
                                } catch { }
                                markViewed(post.id); // IMPORTANT: pass id
                            }}
                        >
                            {mediaPreview ? (
                                // Prefer responsive preview block when present; fall back to legacy single URL
                                <img
                                    className="pc-thumb"
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                    src={withBase((post.preview && post.preview.src) || mediaPreview)}
                                    {...(post.preview?.srcset
                                        ? { srcSet: withBaseInSrcSet(post.preview.srcset) }
                                        : {})}
                                    {...(post.preview?.sizes ? { sizes: post.preview.sizes } : {})}
                                    {...(post.preview?.w && post.preview?.h
                                        ? { width: post.preview.w, height: post.preview.h }
                                        : {})}
                                />
                            ) : (
                                <div className="pc-thumb pc-thumb--video">
                                    <span className="pc-play">▶</span>
                                </div>
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
                                <time dateTime={dateISO} title={dt?.toLocaleString?.() || ""}>
                                    {dateLabel}
                                </time>
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
                                markViewed(post.id); // IMPORTANT: pass id
                            }}
                        >
                            {renderHighlighted(post.title, searchTerm)}
                        </a>
                        {post.flair ? <span className="flair">{post.flair}</span> : null}
                        {mediaType ? (
                            <span className="pill">
                                {mediaType}
                                {hasGallery ? ` (${galleryCount || mediaUrls.length})` : ""}
                            </span>
                        ) : null}
                    </h3>

                    {previewText && (
                        <p className="preview">{renderHighlighted(previewText, searchTerm)}</p>
                    )}

                    <div className="bottomline">
                        {post.score != null && <span className="score">▲ {post.score}</span>}
                        <span className="dot">•</span>
                        {post.num_comments != null && (
                            <span className="comments">💬 {post.num_comments}</span>
                        )}

                        {hasAnyMedia && (
                            <>
                                <span className="dot">•</span>
                                <button
                                    className="action expand"
                                    type="button"
                                    onClick={() => {
                                        setExpanded((e) => !e);
                                        markViewed(post.id); // expanding counts as viewed
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