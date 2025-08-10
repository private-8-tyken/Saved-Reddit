// scripts/build-indexes.mjs (hybrid: read from data/, write to public/)
// PURPOSE
// - Read your canonical per-post JSONs from:   data/posts/**.json
// - Generate lightweight indexes into:         public/data/indexes/
// - Copy per-post JSONs for the site to:       public/data/posts/**.json
//   (So the browser can fetch them on GitHub Pages.)

import { promises as fs } from 'node:fs';
import path from 'node:path';

// --- PATHS ---------------------------------------------------------------
const SRC_POSTS_DIR = path.resolve('data', 'posts');          // input (your source JSONs)
const DST_BASE = path.resolve('public', 'data');              // all web-served data
const DST_POSTS_DIR = path.join(DST_BASE, 'posts');           // output: per-post JSONs for the site
const DST_INDEX_DIR = path.join(DST_BASE, 'indexes');         // output: manifest/facets/search

await fs.mkdir(DST_POSTS_DIR, { recursive: true });
await fs.mkdir(DST_INDEX_DIR, { recursive: true });

// --- HELPERS ------------------------------------------------------------
async function listJsonFiles(root) {
    const out = [];
    async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) await walk(fp);
            else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) out.push(fp);
        }
    }
    try {
        await walk(root);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            console.error('❗ Source posts directory not found:', root);
            console.error('   Create it and place your per-post JSONs there, e.g.: data/posts/t3_abc123.json');
            return [];
        }
        throw err;
    }
    return out;
}

const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));

function flattenComments(comments) {
    let text = '';
    (function walk(list) {
        if (!Array.isArray(list)) return;
        for (const c of list) {
            if (c && typeof c.body === 'string') text += c.body + '';
            if (c && c.replies) walk(c.replies);
        }
    })(comments || []);
    return text.trimEnd();
}

function toManifestItem(p) {
    return {
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
        // include selftext for simple substring search on feed (fine for ~2K posts)
        selftext: p.selftext || '',
        hasMedia: !!(p.media && ((p.media.items && p.media.items.length) || p.media?.video)),
        mediaType: p.media?.type || (p.is_self ? 'text' : (p.link_domain ? 'link' : undefined))
    };
}

async function ensureDirForFile(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

// --- MAIN ----------------------------------------------------------------
const files = await listJsonFiles(SRC_POSTS_DIR);
if (files.length === 0) {
    console.warn('No JSON files found to index.');
    process.exit(0);
}

const rawPosts = [];
for (const srcPath of files) {
    try {
        const json = await fs.readFile(srcPath, 'utf8');
        const p = JSON.parse(json);
        // Ensure an id exists (fallback to filename)
        p.id = p.id || path.basename(srcPath, '.json');
        rawPosts.push({ p, srcPath });
    } catch (err) {
        console.warn(`⚠️  Skipping ${path.relative(process.cwd(), srcPath)}: ${err.message}`);
    }
}

// Deduplicate by id (last one wins), keep the last source path for copying
const byId = new Map();
for (const { p, srcPath } of rawPosts) {
    byId.set(p.id, { p, srcPath });
}
const entries = [...byId.values()];
const posts = entries.map(e => e.p);

// Copy per-post JSONs into public/data/posts (preserve subfolders)
let copied = 0;
for (const { p, srcPath } of entries) {
    const rel = path.relative(SRC_POSTS_DIR, srcPath); // may include subfolders
    const dst = path.join(DST_POSTS_DIR, rel);
    await ensureDirForFile(dst);
    // Write normalized JSON (ensures id field present)
    await fs.writeFile(dst, JSON.stringify(p, null, 2));
    copied++;
}

// Build manifest & facets
const manifest = posts.map(toManifestItem);
const facets = {
    subreddits: uniqSorted(manifest.map(p => p.subreddit)),
    authors: uniqSorted(manifest.map(p => p.author)),
    flairs: uniqSorted(manifest.map(p => p.flair)),
    domains: uniqSorted(manifest.map(p => p.link_domain))
};

await fs.writeFile(path.join(DST_INDEX_DIR, 'posts-manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(DST_INDEX_DIR, 'facets.json'), JSON.stringify(facets, null, 2));

// Build lightweight search corpora (swap to FlexSearch later)
const baseDocs = posts.map(p => ({
    id: p.id,
    title: p.title ?? '',
    selftext: p.selftext ?? '',
    subreddit: p.subreddit ?? '',
    flair: p.flair ?? '',
    link_domain: p.link_domain ?? ''
}));

const withCommentsDocs = posts.map(p => ({
    ...baseDocs.find(d => d.id === p.id),
    comments: flattenComments(p.comments)
}));

await fs.writeFile(path.join(DST_INDEX_DIR, 'search-no-comments.json'), JSON.stringify(baseDocs, null, 2));
await fs.writeFile(path.join(DST_INDEX_DIR, 'search-with-comments.json'), JSON.stringify(withCommentsDocs, null, 2));

// --- LOG -----------------------------------------------------------------
console.log(`
✅ Indexed ${posts.length} posts (copied ${copied} JSON files)`);
console.log(`   Source: ${SRC_POSTS_DIR}`);
console.log(`   Posts  → ${DST_POSTS_DIR}`);
console.log(`   Indexes→ ${DST_INDEX_DIR}`);
console.log('   Files written:');
console.log('     - posts-manifest.json');
console.log('     - facets.json');
console.log('     - search-no-comments.json');
console.log('     - search-with-comments.json');
