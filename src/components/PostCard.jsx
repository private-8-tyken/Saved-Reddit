// src/components/PostCard.jsx
// Post card component: displays individual post details and actions
import { saveFavs } from "../utils/storage.js";
import { excerpt, getDomain } from "../utils/text.js";

export default function PostCard({ post, favs, setFavs, base, searchTerm = "" }) {
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

    // Choose the best preview source
    const basePreview =
        post.selftext_preview ||
        post.selftext ||
        (post.media_type === 'link' && (post.url ? `Link: ${getDomain(post.url)}` : '')) ||
        '';
    const previewText = excerpt(basePreview, 200);

    // Simple highlighter for the search term (case-insensitive)
    function renderHighlighted(text, q) {
        const query = (q || "").trim();
        if (!query) return text;
        try {
            const re = new RegExp(`(${query.replace(/[.*?^${}()|[\]\\]/g, "\\$&")})`, "ig");
            const parts = String(text).split(re);
            return parts.map((chunk, i) =>
                re.test(chunk) ? <mark key={i}>{chunk}</mark> : <span key={i}>{chunk}</span>
            );
        } catch {
            return text;
        }
    }

    return (
        <article className="card" style={{ marginBottom: 12 }}>
            {post.media_preview ? (
                <img src={post.media_preview} alt="" loading="lazy" decoding="async" fetchpriority="low"
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
                    {renderHighlighted(post.title, searchTerm)}
                </a>
            </h3>
            <div className="meta">{renderHighlighted(meta, searchTerm)}</div>
            {previewText && (
                <p className="preview">
                    {renderHighlighted(previewText, searchTerm)}
                </p>
            )}
            <div className="row" style={{ marginTop: 8 }}>
                <button className="button" onClick={toggle}>{isFav ? '⭐ Unstar' : '☆ Star'}</button>
                {post.permalink && <a className="button" href={post.permalink} target="_blank" rel="noopener noreferrer">Open on Reddit ↗</a>}
            </div>
        </article >
    );
}
