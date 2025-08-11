import React, { useEffect, useState } from "react";

export default function RedditFeed() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch("/data/indexes/posts-manifest.json")
      .then((r) => r.json())
      .then(setPosts);
  }, []);

  if (!posts.length) return <div>Loading...</div>;

  return (
    <div className="feed">
      {posts.map((post, i) => (
        <article className="post-card" key={i}>
          <h2>{post.title}</h2>
          <div className="meta">
            <span>r/{post.subreddit}</span>
            <span>by {post.author}</span>
            <span>Score: {post.score}</span>
            <span>Comments: {post.num_comments}</span>
          </div>
          {post.flair && <span className="flair">{post.flair}</span>}
          {post.over_18 && <span className="nsfw">NSFW</span>}
          {post.spoiler && <span className="spoiler">Spoiler</span>}
        </article>
      ))}
      <style>{`
        .feed {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 700px;
          margin: 2rem auto;
        }
        .post-card {
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 1rem;
          background: var(--astro-bg, #fff);
        }
        .meta {
          font-size: 0.9em;
          color: #666;
          display: flex;
          gap: 1.5em;
          margin-bottom: 0.5em;
        }
        .flair {
          background: #eee;
          color: #333;
          border-radius: 4px;
          padding: 0.1em 0.5em;
          margin-left: 0.5em;
        }
        .nsfw {
          background: #f66;
          color: #fff;
          border-radius: 4px;
          padding: 0.1em 0.5em;
          margin-left: 0.5em;
        }
        .spoiler {
          background: #333;
          color: #fff;
          border-radius: 4px;
          padding: 0.1em 0.5em;
          margin-left: 0.5em;
        }
      `}</style>
    </div>
  );
}
