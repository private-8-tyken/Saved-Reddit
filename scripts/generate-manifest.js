// Run using:
// node scripts/generate-manifest.js

// scripts/generate-manifest.js
// Build a lightweight manifest with media + text previews.
// Reads:   data/posts/*.json
// Writes:  public/data/indexes/*.json
//          (also copies per-post JSONs to public/data/posts for detail pages)

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd(); // run from repo root
const INPUT_DIR = path.resolve(ROOT, 'data/posts');
const INDEX_OUT_DIR = path.resolve(ROOT, 'public/data/indexes');
const POSTS_PUBLIC_DIR = path.resolve(ROOT, 'public/data/posts');

await fs.mkdir(INDEX_OUT_DIR, { recursive: true });
await fs.mkdir(POSTS_PUBLIC_DIR, { recursive: true });

function plainExcerpt(text, n = 320) {
  if (!text) return '';
  const t = String(text)
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[*_`>#~]|\\|\[(.*?)\]\((.*?)\)/g, '$1'); // strip markdown & [link](url)
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function pickPreview(p) {
  // Prefer local poster/thumb if you saved one
  const local = p?.media?.items?.find(it => it.thumbnail)?.thumbnail || p?.media?.video?.poster;
  if (local) return { url: local, w: p?.media?.items?.[0]?.width, h: p?.media?.items?.[0]?.height, kind: 'local' };

  // Reddit preview (best-fit small resolution)
  const pr = p?.preview?.images?.[0];
  if (pr?.resolutions?.length) {
    const cand = [...pr.resolutions].sort((a, b) => a.width - b.width)
      .find(r => r.width >= 240 && r.width <= 360) || pr.resolutions[0];
    return { url: cand.url?.replace(/&amp;/g, '&'), w: cand.width, h: cand.height, kind: 'reddit' };
  }

  // Fallback thumbnail URL if present
  const th = p?.thumbnail;
  if (th && /^https?:\/\//.test(th)) return { url: th, w: 140, h: 140, kind: 'external' };

  return { url: null, w: null, h: null, kind: null };
}

async function loadPosts(dir) {
  const files = await fs.readdir(dir);
  const posts = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      if (!raw.trim()) { console.warn(`⚠️ Empty file: ${f}`); continue; }
      const p = JSON.parse(raw);
      posts.push(p);
      // Make per-post JSON publicly accessible for the detail page
      await fs.writeFile(path.join(POSTS_PUBLIC_DIR, f), JSON.stringify(p));
    } catch (err) {
      console.warn(`⚠️ Skipping ${f}: ${err.message}`);
    }
  }
  return posts;
}

const posts = await loadPosts(INPUT_DIR);

const manifest = posts.map(p => {
  const media_type =
    p?.media?.type ||
    (p?.is_self ? 'text' : (p?.link_domain ? 'link' : undefined));
  const has_media = !!(p?.media && ((p.media.items && p.media.items.length) || p.media.video));
  const prev = pickPreview(p);
  return {
    id: p.id,
    permalink: p.permalink,
    url: p.url,
    link_domain: p.link_domain || null,
    title: p.title,
    selftext_preview: plainExcerpt(p.selftext || ''),
    subreddit: p.subreddit,
    author: p.author,
    flair: p.link_flair_text || p.flair || null,
    created_utc: p.created_utc,
    saved_utc: p.saved_utc,
    score: p.score,
    num_comments: p.num_comments,
    media_type,
    has_media,
    media_preview: prev.url,          // may be null
    preview_width: prev.w || null,
    preview_height: prev.h || null,
    preview_kind: prev.kind || null
  };
});

const uniqSorted = arr => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
const facets = {
  subreddits: uniqSorted(manifest.map(p => p.subreddit)),
  authors:    uniqSorted(manifest.map(p => p.author)),
  flairs:     uniqSorted(manifest.map(p => p.flair)),
  domains:    uniqSorted(manifest.map(p => p.link_domain)),
  mediaTypes: uniqSorted(manifest.map(p => p.media_type)),
};

await fs.writeFile(path.join(INDEX_OUT_DIR, 'posts-manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(INDEX_OUT_DIR, 'facets.json'), JSON.stringify(facets, null, 2));
console.log(`✅ Manifest built: ${manifest.length} posts (with media & text previews).`);
