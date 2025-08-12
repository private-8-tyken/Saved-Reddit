import React, { useEffect, useState } from "react";

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

export default function RedditFeed() {
    const [posts, setPosts] = useState([]);

    useEffect(() => {
        fetch(`${base}data/indexes/posts-manifest.json`)
            .then((r) => r.json())
            .then((list) => list.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0)))
            .then(setPosts)
            .catch((e) => console.error("Failed to load manifest", e));
    }, []);

    if (!posts.length) return <div className="feed loading">Loading…</div>;

    return (
        <div className="feed">
            {posts.map((p) => {
                const pid = p.id || deriveIdFromPermalink(p.permalink);
                if (!pid) return null; // skip malformed rows (prevents React key warning)

                return (
                    <article className="post-card" key={pid}>
                        {/* Topline: r/sub • posted by u/author • date */}
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

                        {/* Title + small pills */}
                        <h2 className="title">
                            <a href={`/post/${pid}`}>{p.title}</a>
                            {p.flair && <span className="flair">{p.flair}</span>}
                            {p.media_type && <span className="pill">{p.media_type}</span>}
                        </h2>

                        {/* Media preview (no embeds, just a thumbnail/poster) */}
                        {p.media_preview && (
                            <a href={`/post/${pid}`} className="media-wrap">
                                <img
                                    src={p.media_preview}
                                    alt=""
                                    loading="lazy"
                                    width={p.preview_width || undefined}
                                    height={p.preview_height || undefined}
                                />
                            </a>
                        )}

                        {/* Selftext preview */}
                        {p.selftext_preview && <p className="excerpt">{p.selftext_preview}</p>}

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

                        {/* Bottomline: score • comments • actions */}
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
                            <a className="action" href={`/post/${pid}`}>
                                Details
                            </a>
                            {p.saved_utc && <span className="saved">Saved {fmt(p.saved_utc)}</span>}
                        </div>
                    </article>
                );
            })}

            <style>{`
        :root {
          --bg: #0b1416;
          --card: #1a1a1b;
          --card-hover: #1f1f20;
          --border: #343536;
          --border-hover: #4a4c4f;
          --text: #d7dadc;
          --meta: #818384;
          --link: #3aa0ff;
          --link-visited: #a970ff;
          --badge: #343536;
        }
        .feed {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          max-width: 860px;
          margin: 24px auto;
          padding: 0 12px;
          color: var(--text);
        }
        .post-card {
          border: 1px solid var(--border);
          background: var(--card);
          border-radius: 8px;
          padding: 12px;
          transition: background .15s ease, border-color .15s ease;
        }
        .post-card:hover { background: var(--card-hover); border-color: var(--border-hover); }
        .topline, .bottomline {
          display: flex; align-items: center; gap: 8px;
          color: var(--meta); font-size: 12px; line-height: 1;
        }
        .topline { margin-bottom: 6px; }
        .bottomline { margin-top: 8px; flex-wrap: wrap; }
        .spacer { flex: 1; min-width: 8px; }
        .dot { opacity: .9; }
        .subreddit { color: var(--text); text-decoration: none; font-weight: 600; }
        .subreddit:hover { text-decoration: underline; }
        .author { color: var(--meta); }
        .title {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
          font-size: 1rem; font-weight: 600; margin: 2px 0 6px; line-height: 1.25;
        }
        .title a { color: var(--text); text-decoration: none; }
        .title a:hover { text-decoration: underline; }
        .title a:visited { color: var(--link-visited); }
        .flair {
          background: var(--badge); color: var(--text);
          border-radius: 4px; padding: 2px 6px; font-size: 11px;
        }
        .pill {
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
          color: var(--text); border-radius: 999px; padding: 2px 8px; font-size: 11px; opacity: .9;
        }
        .media-wrap {
          display: block; border-radius: 6px; overflow: hidden;
          border: 1px solid rgba(255,255,255,.08); margin: 6px 0 8px;
        }
        .media-wrap img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
        .excerpt {
          margin: 4px 0 8px; font-size: 14px; line-height: 1.45; color: #c9d1d9;
          display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap;
        }
        .link-card {
          display: flex; justify-content: space-between; align-items: center;
          border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
          border-radius: 6px; padding: 10px 12px; text-decoration: none; color: var(--text); margin-top: 6px;
        }
        .link-card:hover { border-color: rgba(255,255,255,.2); }
        .link-domain { font-size: 12px; color: var(--meta); }
        .link-cta { font-size: 12px; color: var(--text); }
        .score, .comments { color: var(--meta); }
        .action { color: var(--link); text-decoration: none; }
        .action:hover { text-decoration: underline; }
        .saved { color: var(--meta); }
        @media (min-width: 900px) { .feed { grid-template-columns: 1fr 1fr; } }
      `}</style>
        </div>
    );
}
