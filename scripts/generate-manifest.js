// Script to generate posts-manifest.json and facets.json from per-post JSON files
// Usage: node generate-manifest.js

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.resolve(__dirname, '../data/posts');
const INDEXES_DIR = path.resolve(__dirname, '../data/indexes');

function readAllPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const data = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    return data;
  });
}

function buildManifest(posts) {
  // Minimal fields for feed
  return posts.map(post => ({
    id: post.id,
    title: post.title,
    subreddit: post.subreddit,
    author: post.author,
    flair: post.flair,
    score: post.score,
    num_comments: post.num_comments,
    created_utc: post.created_utc,
    saved_utc: post.saved_utc,
    over_18: post.over_18,
    spoiler: post.spoiler,
    is_self: post.is_self,
    link_domain: post.link_domain,
    media_type: post.media?.type || null
  }));
}

function buildFacets(posts) {
  // Distinct lists for filters
  const subreddits = new Set();
  const authors = new Set();
  const flairs = new Set();
  const domains = new Set();
  const mediaTypes = new Set();
  posts.forEach(post => {
    if (post.subreddit) subreddits.add(post.subreddit);
    if (post.author) authors.add(post.author);
    if (post.flair) flairs.add(post.flair);
    if (post.link_domain) domains.add(post.link_domain);
    if (post.media?.type) mediaTypes.add(post.media.type);
  });
  return {
    subreddits: Array.from(subreddits).sort(),
    authors: Array.from(authors).sort(),
    flairs: Array.from(flairs).sort(),
    domains: Array.from(domains).sort(),
    mediaTypes: Array.from(mediaTypes).sort()
  };
}

function main() {
  if (!fs.existsSync(INDEXES_DIR)) fs.mkdirSync(INDEXES_DIR, { recursive: true });
  const posts = readAllPosts();
  const manifest = buildManifest(posts);
  const facets = buildFacets(posts);
  fs.writeFileSync(path.join(INDEXES_DIR, 'posts-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(INDEXES_DIR, 'facets.json'), JSON.stringify(facets, null, 2));
  console.log('Generated posts-manifest.json and facets.json');
}

main();
