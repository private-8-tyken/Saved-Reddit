import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data/posts');
const IDX_DIR = path.resolve('data/indexes');
await fs.mkdir(IDX_DIR, { recursive: true });

const files = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith('.json'));
const posts = await Promise.all(files.map(async f => JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'))));

const manifest = posts.map(p => ({
  id: p.id,
  title: p.title,
  subreddit: p.subreddit,
  author: p.author,
  flair: p.flair,
  over_18: !!p.over_18,
  spoiler: !!p.spoiler,
  created_utc: p.created_utc,
  saved_utc: p.saved_utc,
  score: p.score,
  num_comments: p.num_comments,
  link_domain: p.link_domain,
  url: p.url,
  selftext: p.selftext || '',
  hasMedia: !!(p.media && ((p.media.items && p.media.items.length) || p.media.video)),
  mediaType: p.media?.type || (p.is_self ? 'text' : (p.link_domain ? 'link' : undefined))
}));

const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
const facets = {
  subreddits: uniqSorted(manifest.map(p=>p.subreddit)),
  authors: uniqSorted(manifest.map(p=>p.author)),
  flairs: uniqSorted(manifest.map(p=>p.flair)),
  domains: uniqSorted(manifest.map(p=>p.link_domain))
};

await fs.writeFile(path.join(IDX_DIR, 'posts-manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(IDX_DIR, 'facets.json'), JSON.stringify(facets, null, 2));

// Build two minimal search corpora (we can swap to FlexSearch later if needed)
const baseDocs = manifest.map(p => ({ id: p.id, title: p.title, selftext: p.selftext, subreddit: p.subreddit, flair: p.flair, link_domain: p.link_domain }));
const withCommentsDocs = posts.map(p => ({ id: p.id, title: p.title, selftext: p.selftext, subreddit: p.subreddit, flair: p.flair, link_domain: p.link_domain, comments: (p.comments||[]).map(c => c.body).join('\n') }));
await fs.writeFile(path.join(IDX_DIR, 'search-no-comments.json'), JSON.stringify(baseDocs, null, 2));
await fs.writeFile(path.join(IDX_DIR, 'search-with-comments.json'), JSON.stringify(withCommentsDocs, null, 2));

console.log(`Built manifest (${manifest.length}), facets, and search corpora.`);