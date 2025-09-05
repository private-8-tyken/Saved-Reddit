// src/components/PostDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { BASE, asset } from "../lib/base";
import CommentsTree from "./CommentsTree.jsx";

function fmt(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PostDetail({ id }) {
    const [post, setPost] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${BASE}data/posts/${id}.json`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(setPost)
            .catch(e => setErr(`Could not load post ${id}: ${e.message}`))
            .finally(() => setLoading(false));
    }, [id]);

    const title = post?.title ?? "";
    const linkDomain = post?.link_domain;
    const hasLink = linkDomain && post?.url;

    if (loading) return <div className="detail-wrap"><div className="loading">Loading…</div><Style /></div>;
    if (err) return <div className="detail-wrap"><div className="error">{err}</div><Style /></div>;
    if (!post) return <div className="detail-wrap"><div className="error">Post not found.</div><Style /></div>;

    return (
        <div className="detail-wrap">
            <article className="post">
                {/* topline */}
                <div className="topline">
                    <a className="subreddit" href={`https://www.reddit.com/r/${post.subreddit}`} target="_blank" rel="noreferrer noopener">
                        r/{post.subreddit}
                    </a>
                    <span className="dot">•</span>
                    <span>Posted by <span className="author">u/{post.author}</span></span>
                    {post.created_utc && <>
                        <span className="dot">•</span>
                        <time dateTime={new Date(post.created_utc * 1000).toISOString()}>{fmt(post.created_utc)}</time>
                    </>}
                </div>

                {/* title + flair/media pills */}
                <h1 className="title">
                    {title}
                    {post.link_flair_text && <span className="flair">{post.link_flair_text}</span>}
                    {post.media?.type && <span className="pill">{post.media.type}</span>}
                </h1>

                {/* media policy: NO embeds for now, just preview if available */}
                {post.media?.items?.[0]?.thumbnail && (
                    <div className="media-wrap">
                        <img src={asset(post.media.items[0].thumbnail)} alt="" loading="lazy" />
                    </div>
                )}

                {/* selftext (full) */}
                {post.selftext && (
                    <div className="selftext">{post.selftext}</div>
                )}

                {/* external link card */}
                {hasLink && (
                    <a className="link-card" href={post.url} target="_blank" rel="noreferrer noopener">
                        <div className="link-domain">{linkDomain}</div>
                        <div className="link-cta">Open link ↗</div>
                    </a>
                )}

                {/* meta footer */}
                <div className="bottomline">
                    <span>▲ {post.score ?? 0}</span>
                    <span className="dot">•</span>
                    <span>💬 {post.num_comments ?? 0}</span>
                    {post.saved_utc && (<>
                        <span className="dot">•</span>
                        <span>Saved {fmt(post.saved_utc)}</span>
                    </>)}
                    <span className="spacer" />
                    {post.permalink && (
                        <a className="action" href={post.permalink} target="_blank" rel="noreferrer noopener">View on Reddit</a>
                    )}
                </div>
            </article>

            {/* comments */}
            <section className="comments-section">
                <div className="comments-header">
                    <h2>Comments</h2>
                    <div className="comments-meta">{post.num_comments ?? 0} total</div>
                </div>
                <CommentsTree comments={post.comments || []} />
            </section>

            <Style />
        </div>
    );
}

/** shared reddit-ish styling */
function Style() {
    return (
        <style>{`
      :root {
        --bg: #0b1416;
        --card: #1a1a1b;
        --card2: #0f1a1c;
        --card-hover: #1f1f20;
        --border: #343536;
        --border2: #2a2b2c;
        --text: #d7dadc;
        --meta: #818384;
        --link: #3aa0ff;
      }
      .detail-wrap {
        max-width: 860px;
        margin: 24px auto;
        padding: 0 12px;
        color: var(--text);
      }
      .loading, .error { color: var(--meta); }
      .post {
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: 8px;
        padding: 12px;
      }
      .topline, .bottomline {
        display: flex; align-items: center; gap: 8px;
        color: var(--meta); font-size: 12px;
      }
      .topline { margin-bottom: 6px; }
      .bottomline { margin-top: 8px; flex-wrap: wrap; }
      .spacer { flex: 1; }
      .dot { opacity: .9; }
      .subreddit { color: var(--text); text-decoration: none; font-weight: 600; }
      .subreddit:hover { text-decoration: underline; }
      .author { color: var(--meta); }
      .title {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        font-size: 1.25rem; font-weight: 700; margin: 4px 0 8px;
      }
      .flair {
        background: #343536; color: var(--text);
        border-radius: 4px; padding: 2px 6px; font-size: 11px;
      }
      .pill {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px; padding: 2px 8px; font-size: 11px;
      }
      .media-wrap { border: 1px solid rgba(255,255,255,.08); border-radius: 6px; overflow: hidden; margin: 6px 0 10px; }
      .media-wrap img { width: 100%; max-height: 460px; object-fit: cover; display: block; }

      .selftext {
        white-space: pre-wrap;
        line-height: 1.45; font-size: 14px; color: #c9d1d9;
        margin-bottom: 8px;
      }
      .link-card {
        display: flex; justify-content: space-between; align-items: center;
        border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
        border-radius: 6px; padding: 10px 12px; text-decoration: none; color: var(--text);
      }
      .link-card:hover { border-color: rgba(255,255,255,.2); }
      .link-domain { font-size: 12px; color: var(--meta); }
      .link-cta { font-size: 12px; }

      .comments-section { margin-top: 16px; }
      .comments-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
      .comments-header h2 { font-size: 1rem; margin: 0; }
      .comments-meta { color: var(--meta); font-size: 12px; }
    `}</style>
    );
}
