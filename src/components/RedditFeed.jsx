// src/components/RedditFeed.jsx
import "../styles/RedditFeed.css";
import React, { useEffect, useMemo, useState } from "react";
import { BASE, asset } from "../lib/base";
import Filters from "./Filters.jsx";
import MobileDrawer from "./MobileDrawer.jsx";
import { parseQuery, pushQuery, DEFAULT_QUERY } from "../lib/query";
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
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    return text.split(re).map((part, i) =>
        re.test(part) ? <mark key={i}>{part}</mark> : part
    );
}

export default function RedditFeed() {
    const [posts, setPosts] = useState([]);
    const [facets, setFacets] = useState(null);
    const [query, setQuery] = useState(parseQuery());
    const [drawerOpen, setDrawerOpen] = useState(false);

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
                <div className="mobile-bar">
                    <button className="btn" type="button" onClick={() => setDrawerOpen(true)}>
                        Filters
                    </button>
                </div>
                <div className="resultbar">
                    <span>{count} result{count === 1 ? "" : "s"}</span>
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
                                {p.saved_utc && <span className="saved">Saved ID #{p.saved_utc}</span>}
                            </div>
                        </article>
                    );
                })}

                {!count && <div className="empty">No results. Try clearing filters.</div>}
            </div>

            <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                {facets && (
                    <Filters
                        facets={facets}
                        query={query}
                        onChange={updateQuery}
                    />
                )}
            </MobileDrawer>
        </div>
    );
}
