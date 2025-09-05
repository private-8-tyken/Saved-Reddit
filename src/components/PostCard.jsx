// src/components/PostCard.jsx
// Post card component: displays individual post details and actions
import { saveFavs } from "../utils/storage.js";

export default function PostCard({ post, favs, setFavs, base }) {
    const isFav = favs.has(post.id);
    const toggle = () => {
        const next = new Set(favs);
        if (isFav) next.delete(post.id); else next.add(post.id);
        setFavs(next);
        saveFavs(next);
    };
    const meta = [
        post.subreddit ? `r/${post.subreddit}` : '',
        post.author ? `u/${post.author}` : '',
        post.flair || '',
        post.num_comments != null ? `${post.num_comments} comments` : '',
        post.saved_index != null ? `Saved #${post.saved_index}` : ''
    ].filter(Boolean).join(' • ');

    return (
        <article className="card" style={{ marginBottom: 12 }}>
            {post.media_preview ? (
                <img src={post.media_preview} alt="" loading="lazy"
                    style={{ width: '100%', borderRadius: 10, display: 'block' }} />
            ) : null}
            <h3 style={{ margin: '10px 2px' }}>
                <a
                    href={`${base}post/${encodeURIComponent(post.id)}`}
                    onClick={() => {
                        try {
                            const key = 'feed:scroll:' + location.search;
                            sessionStorage.setItem(key, String(window.scrollY || 0));
                        } catch { }
                    }}
                >
                    {post.title}
                </a>
            </h3>
            <div className="meta">{meta}</div>
            <div className="row" style={{ marginTop: 8 }}>
                <button className="button" onClick={toggle}>{isFav ? '⭐ Unstar' : '☆ Star'}</button>
                {post.permalink && <a className="button" href={post.permalink} target="_blank" rel="noopener noreferrer">Open on Reddit ↗</a>}
            </div>
        </article >
    );
}
