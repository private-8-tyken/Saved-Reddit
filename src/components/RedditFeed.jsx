// src/components/RedditFeed.jsx
import "../styles/RedditFeed.css";
import React, { useEffect, useMemo, useState } from "react";
import { BASE, asset } from "../lib/base";
import Filters from "./Filters.jsx";
import MobileDrawer from "./MobileDrawer.jsx";
import { parseQuery, pushQuery } from "../lib/query";
import { applyFilters } from "../lib/applyFilters";

function fmt(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function deriveIdFromPermalink(permalink) {
    if (!permalink) return null;
    try {
        const parts = permalink.split("/").filter(Boolean);
        const i = parts.findIndex((s) => s === "comments");
        if (i !== -1 && parts[i + 1]) {
            const base36 = parts[i + 1];
            return base36.startsWith("t3_") ? base36 : `t3_${base36}`;
        }
    } catch { }
    return null;
}

function highlight(text, term) {
    if (!term || !text) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    return text.split(re).map((part, i) => (re.test(part) ? <mark key={i}>{part}</mark> : part));
}

/** Right-edge hot-zone + visible (subtle) vertical handle; mobile only (<=900px) */
function EdgeSwipeOpen({ onOpen }) {
    const start = React.useRef({ x: null, y: null });
    const tracking = React.useRef(false);

    const onTouchStart = (e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        tracking.current = true;
    };
    const onTouchMove = (e) => {
        if (!tracking.current || start.current.x == null) return;
        const t = e.touches[0];
        const dx = t.clientX - start.current.x; // left swipe => negative
        const dy = t.clientY - start.current.y;
        if (Math.abs(dy) > Math.abs(dx)) return; // ignore vertical
        const threshold = Math.max(40, Math.min(140, window.innerWidth * 0.18));
        if (dx < -threshold) {
            tracking.current = false;
            onOpen();
        }
    };
    const onTouchEnd = () => {
        tracking.current = false;
        start.current = { x: null, y: null };
    };

    return (
        <>
            <style>{`
        @media (min-width: 900px) {
          .edge-open-zone, .edge-handle { display: none; }
        }
        .edge-handle:focus-visible { outline: 2px solid rgba(255,255,255,.6); outline-offset: 2px; }
      `}</style>

            {/* Subtle vertical handle (tap or keyboard to open) */}
            <button
                type="button"
                className="edge-handle"
                aria-label="Open filters"
                onClick={onOpen}
                style={{
                    position: "fixed",
                    top: "50%",
                    right: 0,
                    transform: "translateY(-50%)",
                    zIndex: 49,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px 6px",
                    width: 32,
                    borderTopLeftRadius: 10,
                    borderBottomLeftRadius: 10,
                    border: "1px solid rgba(255,255,255,.16)",
                    borderRight: "none",
                    background: "linear-gradient(180deg, rgba(36,37,38,.92), rgba(20,20,21,.92))",
                    color: "#d7dadc",
                    boxShadow: "0 2px 10px rgba(0,0,0,.35)",
                    backdropFilter: "blur(6px)",
                    cursor: "pointer",
                }}
            >
                <span
                    aria-hidden
                    style={{
                        writingMode: "vertical-rl",
                        textOrientation: "mixed",
                        fontSize: 12,
                        letterSpacing: 1,
                        opacity: 0.9,
                        userSelect: "none",
                    }}
                >
                    Filters
                </span>
            </button>

            {/* Invisible swipe hot-zone */}
            <div
                className="edge-open-zone"
                style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    width: 28,            // swipe capture width
                    height: "100dvh",
                    zIndex: 48,           // under the handle (49) and drawer/backdrop (50/51)
                    touchAction: "pan-y", // preserve vertical scroll
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            />
        </>
    );
}

export default function RedditFeed() {
    const [posts, setPosts] = useState([]);
    const [facets, setFacets] = useState(null);
    const [query, setQuery] = useState(parseQuery());
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isNarrow, setIsNarrow] = useState(false);

    // Detect mobile layout (<=900px)
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(max-width: 900px)");
        const onChange = (e) => setIsNarrow(e.matches);
        setIsNarrow(mq.matches);
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else mq.addListener(onChange); // Safari < 14 fallback
        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", onChange);
            else mq.removeListener(onChange);
        };
    }, []);

    // Load data
    useEffect(() => {
        fetch(`${BASE}data/indexes/posts-manifest.json`)
            .then((r) => r.json())
            .then(setPosts)
            .catch((e) => console.error("Failed to load manifest", e));
    }, []);
    useEffect(() => {
        fetch(`${BASE}data/indexes/facets.json`)
            .then((r) => r.json())
            .then(setFacets)
            .catch((e) => console.error("Failed to load facets", e));
    }, []);

    // Sync with back/forward
    useEffect(() => {
        const onPop = () => setQuery(parseQuery(location.search));
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    // Update query + URL when filters change
    const updateQuery = (next) => {
        setQuery(next);
        pushQuery(next);
    };

    // Apply filters/search/sort
    const filtered = useMemo(() => applyFilters(posts, query), [posts, query]);
    const count = filtered.length;

    if (!posts.length) return <div className="feed loading">Loading…</div>;

    return (
        <div className="feed grid">
            <div className="left">
                {facets && <Filters facets={facets} query={query} onChange={updateQuery} />}
            </div>

            <div className="right">
                {/* Removed the old mobile-bar Filters button */}
                <div className="resultbar">
                    <span>
                        {count} result{count === 1 ? "" : "s"}
                    </span>
                    {query.q && <span className="meta"> • searching “{query.q}”</span>}
                </div>

                {(count ? filtered : []).map((p) => {
                    const pid = p.id || deriveIdFromPermalink(p.permalink);
                    if (!pid) return null;

                    return (
                        <article className="post-card" key={pid}>
                            {/* Topline */}
                            <div className="topline">
                                <a
                                    className="subreddit"
                                    href={`https://www.reddit.com/r/${p.subreddit}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    r/{p.subreddit}
                                </a>
                                <span className="dot">•</span>
                                <span className="by">
                                    Posted by <span className="author">u/{p.author}</span>
                                </span>
                                {p.created_utc && (
                                    <>
                                        <span className="dot">•</span>
                                        <time dateTime={new Date(p.created_utc * 1000).toISOString()}>
                                            {fmt(p.created_utc)}
                                        </time>
                                    </>
                                )}
                            </div>

                            {/* Title + pills */}
                            <h2 className="title">
                                <a href={`${BASE}post/${pid}`}>{highlight(p.title, query.q)}</a>
                                {p.flair && <span className="flair">{p.flair}</span>}
                                {p.media_type && <span className="pill">{p.media_type}</span>}
                            </h2>

                            {/* Media preview (no embeds) */}
                            {p.media_preview && (
                                <a href={`${BASE}post/${pid}`} className="media-wrap">
                                    <img
                                        src={asset(p.media_preview)}
                                        alt=""
                                        loading="lazy"
                                        width={p.preview_width || undefined}
                                        height={p.preview_height || undefined}
                                    />
                                </a>
                            )}

                            {/* Selftext preview */}
                            {p.selftext_preview && (
                                <p className="excerpt">{highlight(p.selftext_preview, query.q)}</p>
                            )}

                            {/* External link card */}
                            {p.link_domain && p.url && (
                                <a
                                    className="link-card"
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    title={p.url}
                                >
                                    <div className="link-domain">{p.link_domain}</div>
                                    <div className="link-cta">Open link ↗</div>
                                </a>
                            )}

                            {/* Bottomline */}
                            <div className="bottomline">
                                <span className="score">▲ {p.score ?? 0}</span>
                                <span className="dot">•</span>
                                <span className="comments">💬 {p.num_comments ?? 0}</span>

                                <span className="spacer" />

                                {p.permalink && (
                                    <a className="action" href={p.permalink} target="_blank" rel="noreferrer noopener">
                                        View on Reddit
                                    </a>
                                )}
                                <a className="action" href={`${BASE}post/${pid}`}>
                                    Details
                                </a>
                                {Number.isFinite(p.saved_utc) && (
                                    <span className="saved">Saved index #{p.saved_utc}</span>
                                )}
                            </div>
                        </article>
                    );
                })}

                {!count && <div className="empty">No results. Try clearing filters.</div>}
            </div>

            <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                {facets && <Filters facets={facets} query={query} onChange={updateQuery} />}
            </MobileDrawer>

            {/* Edge-swipe-to-open + visible vertical handle (mobile only, drawer closed) */}
            {isNarrow && !drawerOpen && <EdgeSwipeOpen onOpen={() => setDrawerOpen(true)} />}
        </div>
    );
}
