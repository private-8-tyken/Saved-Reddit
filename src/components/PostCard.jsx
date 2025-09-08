// src/components/PostCard.jsx
import { useMemo, useRef, useState, useEffect } from "react";
import { saveFavs } from "../utils/storage.js";
import { excerpt, getDomain } from "../utils/text.js";

export default function PostCard({ post, favs, setFavs, base, searchTerm = "" }) {
    // ----- favorites
    const isFav = favs.has(post.id);
    const toggleFav = () => {
        const next = new Set(favs);
        if (isFav) next.delete(post.id); else next.add(post.id);
        setFavs(next);
        saveFavs(next);
    };

    // ----- viewed tracking
    const viewedKey = "viewedPosts";
    const hasWindow = typeof window !== "undefined";
    const viewedSet = (() => {
        if (!hasWindow) return new Set();
        try { return new Set(JSON.parse(localStorage.getItem(viewedKey) || "[]")); } catch { return new Set(); }
    })();
    const isViewed = viewedSet.has(post.id);
    function markViewed() {
        if (!hasWindow) return;
        try {
            const arr = Array.from(viewedSet.add(post.id));
            localStorage.setItem(viewedKey, JSON.stringify(arr));
        } catch { }
    }

    // ----- dates
    const dt = post.created_utc ? new Date(post.created_utc * 1000) : null;
    const dateISO = dt ? dt.toISOString() : "";
    const dateLabel = dt
        ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : "";

    // ----- manifest media bridge
    const mediaType = post.media_type || null; // 'image' | 'gallery' | 'video' | 'gif' | 'link' | 'text' | null
    const mediaPreview = post.media_preview || null;
    const mediaUrls = Array.isArray(post.media_urls)
        ? post.media_urls
        : (post.media_url_compact
            ? (Array.isArray(post.media_url_compact) ? post.media_url_compact : [post.media_url_compact])
            : []);
    const galleryCount = post.gallery_count ?? (mediaUrls.length > 1 ? mediaUrls.length : null);

    const hasVideo = (mediaType === "video" || mediaType === "gif") && mediaUrls.length > 0 && /\.mp4(\?|#|$)/i.test(mediaUrls[0]);
    const hasGallery = mediaType === "gallery" && (galleryCount ? galleryCount > 0 : mediaUrls.length > 1);
    const hasSingleImage = mediaType === "image" && mediaUrls.length >= 1 && !hasVideo;
    const hasAnyMedia = hasVideo || hasGallery || hasSingleImage;

    // ----- UI state
    const [expanded, setExpanded] = useState(false);
    const [gIndex, setGIndex] = useState(0);
    useEffect(() => { if (!expanded) setGIndex(0); }, [expanded]);

    // ----- search highlight
    function renderHighlighted(text, q) {
        const query = (q || "").trim();
        if (!query) return text;
        try {
            const re = new RegExp(`(${query.replace(/[.*?^${}()|[\\]\\\\]/g, "\\$&")})`, "ig");
            const parts = String(text).split(re);
            return parts.map((chunk, i) =>
                re.test(chunk) ? <mark key={i}>{chunk}</mark> : <span key={i}>{chunk}</span>
            );
        } catch { return text; }
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

    // ----- video controls (QoL)
    const [muted, setMuted] = useState(true);
    const [loop, setLoop] = useState(false);
    const vidRef = useRef(null);
    useEffect(() => { if (vidRef.current) vidRef.current.muted = muted; }, [muted]);
    useEffect(() => { if (vidRef.current) vidRef.current.loop = loop; }, [loop]);

    // ----- inline expanded media
    const Expanded = useMemo(() => {
        if (!expanded || !hasAnyMedia) return null;

        if (hasVideo) {
            const src = mediaUrls[0];
            const isGifProxy = mediaType === "gif";
            return (
                <div className="pc-expand">
                    <div className="pc-video-wrap">
                        <video
                            ref={vidRef}
                            src={src}
                            poster={mediaPreview || undefined}
                            controls // native controls
                            autoPlay={isGifProxy}
                            loop={loop || isGifProxy}
                            muted={muted || isGifProxy}
                            playsInline
                            preload="metadata"
                            className="pc-media-el"
                        />
                        <div className="pc-controls">
                            <button type="button" onClick={() => setMuted(m => !m)} className="pc-btn">
                                {muted ? "Unmute" : "Mute"}
                            </button>
                            <button type="button" onClick={() => setLoop(l => !l)} className="pc-btn">
                                {loop ? "Loop: On" : "Loop: Off"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const v = vidRef.current;
                                    if (!v) return;
                                    v.playbackRate = v.playbackRate === 1 ? 1.5 : 1;
                                }}
                                className="pc-btn"
                            >
                                Speed 1×/1.5×
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (hasGallery) {
            const cur = mediaUrls[gIndex] || mediaUrls[0];
            const total = galleryCount || mediaUrls.length;
            const prev = () => setGIndex(i => (i - 1 + total) % total);
            const next = () => setGIndex(i => (i + 1) % total);
            return (
                <div className="pc-expand">
                    <div className="pc-gallery">
                        <img src={cur} alt="" loading="eager" decoding="async" className="pc-media-el" />
                        <div className="pc-gallery-bar">
                            <button type="button" className="pc-btn" onClick={prev} aria-label="Previous">‹</button>
                            <span className="pc-count">{gIndex + 1} / {total}</span>
                            <button type="button" className="pc-btn" onClick={next} aria-label="Next">›</button>
                        </div>
                    </div>
                </div>
            );
        }

        if (hasSingleImage) {
            return (
                <div className="pc-expand">
                    <img src={mediaUrls[0]} alt="" loading="eager" decoding="async" className="pc-media-el" />
                </div>
            );
        }

        return null;
    }, [expanded, hasAnyMedia, hasVideo, mediaUrls, mediaType, mediaPreview, hasGallery, hasSingleImage, gIndex, galleryCount, loop, muted]);

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
                                markViewed();
                            }}
                        >
                            {mediaPreview ? (
                                <img src={mediaPreview} alt="" loading="lazy" decoding="async" className="pc-thumb" />
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
                                markViewed();
                            }}
                        >
                            {renderHighlighted(post.title, searchTerm)}
                        </a>
                        {post.flair ? <span className="flair">{post.flair}</span> : null}
                        {mediaType ? (
                            <span className="pill">
                                {mediaType}{hasGallery ? ` (${galleryCount || mediaUrls.length})` : ""}
                            </span>
                        ) : null}
                    </h3>

                    {previewText && <p className="preview">{renderHighlighted(previewText, searchTerm)}</p>}

                    <div className="bottomline">
                        {post.score != null && <span className="score">▲ {post.score}</span>}
                        <span className="dot">•</span>
                        {post.num_comments != null && <span className="comments">💬 {post.num_comments}</span>}

                        {hasAnyMedia && (
                            <>
                                <span className="dot">•</span>
                                <button
                                    className="action expand"
                                    type="button"
                                    onClick={() => setExpanded(e => !e)}
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
                                onClick={markViewed}
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
