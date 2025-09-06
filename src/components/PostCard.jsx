// src/components/PostCard.jsx
// Post card component: postcard layout with lightweight actions, viewed-state, and search highlighting
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

    // Track viewed posts (used to tint cards the user has opened)
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

    // Topline date
    const dt = post.created_utc ? new Date(post.created_utc * 1000) : null;
    const dateISO = dt ? dt.toISOString() : "";
    const dateLabel = dt ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

    // Choose the best preview source
    const basePreview =
        post.selftext_preview ||
        post.selftext ||
        (post.media_type === "link" && (post.url ? `Link: ${getDomain(post.url)}` : "")) ||
        "";
    const previewText = excerpt(basePreview, 200);

    // Simple highlighter for the search term (case-insensitive)
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

    return (
        <article className={`card post-card ${isViewed ? "is-viewed" : ""}`} style={{ marginBottom: 12 }}>
            {/* Top line: subreddit • by author • date • Saved # */}
            <div className="topline">
                {post.subreddit && (
                    <a
                        className="subreddit"
                        href={`https://www.reddit.com/r/${encodeURIComponent(post.subreddit)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        {renderHighlighted(`r/${post.subreddit}`, searchTerm)}
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
                            {renderHighlighted(`u/${post.author}`, searchTerm)}
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

            {/* Optional media preview */}
            {post.media_preview ? (
                <img
                    src={post.media_preview}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    style={{ width: "100%", borderRadius: 10, display: "block" }}
                />
            ) : null}

            {/* Title + flair + media pill */}
            <h3 className="title" style={{ margin: "10px 2px" }}>
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
                {post.media_type ? <span className="pill">{post.media_type}</span> : null}
            </h3>

            {/* Excerpt with highlight */}
            {previewText && (
                <p className="preview">
                    {renderHighlighted(previewText, searchTerm)}
                </p>
            )}

            {/* Bottom line: score • comments • spacer • View on Reddit • star */}
            <div className="bottomline" style={{ marginTop: 8 }}>
                {post.score != null && <span className="score">▲ {post.score}</span>}
                <span className="dot">•</span>
                {post.num_comments != null && <span className="comments">💬 {post.num_comments}</span>}
                <span className="spacer"></span>
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
                <span
                    className="star"
                    role="button"
                    aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFav ? "true" : "false"}
                    tabIndex={0}
                    title={isFav ? "Click to unfavorite" : "Click to favorite"}
                    onClick={toggle}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
                >
                    {isFav ? "⭐" : "☆"}
                </span>
            </div>
        </article>
    );
}
