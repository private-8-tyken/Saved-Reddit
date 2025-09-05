// src/components/PostPage.jsx
// Post page component: displays a single post with media and comments
import { useEffect, useState } from "react";
import CommentThread from "./CommentThread.jsx";
import { PostSkeleton } from "./Skeleton.jsx";
import { loadFavs, saveFavs } from "../utils/storage.js";

const rawBase = import.meta.env.BASE_URL || "/";
const BASE = rawBase.endsWith('/') ? rawBase : rawBase + '/';

export default function PostPage({ id }) {
    const [post, setPost] = useState(null);
    const [error, setError] = useState(null);
    const [favs, setFavs] = useState(new Set());
    const isFav = favs.has(id);
    const toggleFav = () => {
        const next = new Set(favs);
        if (isFav) next.delete(id); else next.add(id);
        setFavs(next); saveFavs(next);
    };

    useEffect(() => {
        let active = true;
        setError(null);
        setPost(null);
        fetch(`${BASE}data/posts/${id}.json`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(data => { if (active) setPost(data); })
            .catch(e => { if (active) setError(e.message || 'Failed to load'); });
        return () => { active = false; };
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

    const media = (() => {
        const m = post.media;
        if (!m) return null;
        if (m.video?.url) return <video src={m.video.url} poster={m.video.poster || ''} style={{ width: '100%', borderRadius: 10 }} controls />;
        if (Array.isArray(m.items) && m.items.length) {
            const first = m.items[0];
            return <img src={first.url} alt="" style={{ width: '100%', borderRadius: 10 }} loading="lazy" />;
        }
        return null;
    })();

    if (!post && !error) {
        return (
            <div className="container">
                <div className="card" style={{ marginBottom: 12 }}>
                    <div className="skeleton" style={{ height: 28, width: '70%', margin: '6px 0' }} />
                    <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 220 }} />
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="row" style={{ marginTop: 12, marginBottom: 8 }}>
                <button className="button" onClick={() => (history.length > 1 ? window.history.back() : (window.location.href = BASE))}>← Back</button>
                <button className="button" onClick={toggleFav}>{isFav ? '⭐ Unstar' : '☆ Star'}</button>
                {post.permalink && <a className="button" href={post.permalink} target="_blank" rel="noopener noreferrer">Open on Reddit ↗</a>}
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
