// scripts/generate-manifest.js
// Run: node scripts/generate-manifest.js
//
// What it does:
// - Lists ALL objects in your Cloudflare R2 bucket via S3 API (paginated)
// - Builds an index: { <postId>: { images[], gallery[], video, redgiphy, gif } }
// - Copies each raw post JSON to public/data/posts/<id>.json
// - Writes public/data/indexes/{posts-manifest.json, facets.json, build-report.json}
//
// Env (required for R2 listing):
//   R2_ENDPOINT          = "https://<accountid>.r2.cloudflarestorage.com"
//   R2_ACCESS_KEY_ID     = "<access key>"
//   R2_SECRET_ACCESS_KEY = "<secret>"
//   R2_BUCKET            = "<bucket name>"
//   PUBLIC_MEDIA_BASE    = "https://best-media-boy.mindscast-ethan-r2cloudflare.workers.dev/"  // MUST end with '/'
// Optional:
//   R2_OBJECTS_CACHE     = "data/r2_objects.json"     // file path for caching keys
//   R2_SKIP_LIST         = "1"                        // if set, read cache instead of calling R2
//
// NOTE: PUBLIC_MEDIA_BASE is used to build absolute media URLs in the manifest.

import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

try { await import("dotenv/config"); } catch { }

const ROOT = process.cwd();
const INPUT_DIR = path.resolve(ROOT, "data/posts");
const INDEX_OUT_DIR = path.resolve(ROOT, "public/data/indexes");
const POSTS_PUBLIC_DIR = path.resolve(ROOT, "public/data/posts");
const ORDERED_CSV = path.resolve(ROOT, "data/ordered_posts.csv");
await fs.mkdir(INDEX_OUT_DIR, { recursive: true });
await fs.mkdir(POSTS_PUBLIC_DIR, { recursive: true });

/** ---------- ENV ---------- */
const PUBLIC_MEDIA_BASE_RAW = process.env.PUBLIC_MEDIA_BASE || "";
const PUBLIC_MEDIA_BASE = PUBLIC_MEDIA_BASE_RAW ? PUBLIC_MEDIA_BASE_RAW.replace(/\/?$/, "/") : "";
const MEDIA_BASE_OK = !!PUBLIC_MEDIA_BASE;

const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_OBJECTS_CACHE = process.env.R2_OBJECTS_CACHE || path.resolve(ROOT, "data/r2_objects.json");
const R2_SKIP_LIST = process.env.R2_SKIP_LIST === "1";

/** ---------- Small utils ---------- */
function zero2(i) { return String(i).padStart(2, "0"); }
function extFromUrl(u) {
    if (!u) return null;
    const clean = u.split("?")[0].split("#")[0];
    const m = clean.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : null; // preserve 'jpeg'
}
function plainExcerpt(text, n = 320) {
    if (!text) return "";
    const t = String(text)
        .replace(/\r\n?|\n/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[*_`>#~]|\\|\[(.*?)\]\((.*?)\)/g, "$1");
    return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}
function pickRedditPreview(p) {
    const pr = p?.preview?.images?.[0];
    if (pr?.resolutions?.length) {
        const cand = [...pr.resolutions]
            .sort((a, b) => a.width - b.width)
            .find(r => r.width >= 240 && r.width <= 360) || pr.resolutions[0];
        return { url: cand.url?.replace(/&amp;/g, "&"), w: cand.width, h: cand.height };
    }
    const th = p?.thumbnail;
    if (th && /^https?:\/\//.test(th)) return { url: th, w: 140, h: 140 };
    return { url: null, w: null, h: null };
}
// parse embedded images from selftext (markdown + bare links)
function extractImageLinksFromSelftext(p) {
    const raw = String(p?.selftext || "");
    if (!raw.trim()) return [];
    const out = [];
    const seen = new Set();
    const clean = raw.replace(/&amp;/g, "&");
    for (const m of clean.matchAll(/!\[[^\]]*?\]\((https?:\/\/[^\s)]+)\)/gi)) {
        const u = m[1];
        if (/\.(?:jpe?g|png|webp|gif)(?:\?|#|$)/i.test(u) && !seen.has(u)) { seen.add(u); out.push(u); }
    }
    for (const m of clean.matchAll(/\[[^\]]*?\]\((https?:\/\/[^\s)]+)\)/gi)) {
        const u = m[1];
        if (/\.(?:jpe?g|png|webp|gif)(?:\?|#|$)/i.test(u) && !seen.has(u)) { seen.add(u); out.push(u); }
    }
    for (const m of clean.matchAll(/https?:\/\/\S+/gi)) {
        const u = m[0].replace(/[)\],.]+$/, "");
        if (/\.(?:jpe?g|png|webp|gif)(?:\?|#|$)/i.test(u) && !seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out;
}

/** ---------- R2 list + index ---------- */
function assertR2Config() {
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
        throw new Error("Missing R2 env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
    }
}
async function listAllR2Keys() {
    if (R2_SKIP_LIST) {
        try {
            const cached = JSON.parse(await fs.readFile(R2_OBJECTS_CACHE, "utf8"));
            if (Array.isArray(cached)) return cached;
        } catch { }
        throw new Error("R2_SKIP_LIST=1 but no cache file found.");
    }
    assertR2Config();
    const s3 = new S3Client({
        region: "auto",
        endpoint: R2_ENDPOINT,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    const keys = [];
    let ContinuationToken = undefined;
    do {
        const resp = await s3.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            ContinuationToken,
            MaxKeys: 1000,
        }));
        for (const o of resp.Contents || []) {
            if (o.Key) keys.push(o.Key);
        }
        ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (ContinuationToken);
    // cache
    try { await fs.writeFile(R2_OBJECTS_CACHE, JSON.stringify(keys, null, 2)); } catch { }
    return keys;
}

/**
 * Build index:
 *  Images/<id>.<ext>                 => imagesSingle[id].push(url)
 *  Images/<id>/NN.<ext>              => imagesGallery[id].push({n:NN, url})
 *  Videos/<id>.mp4                   => video[id] = url
 *  RedGiphys/<id>.mp4                => redgiphy[id] = url
 *  Gifs/<id>.gif                     => gif[id] = url
 */
function buildR2Index(keys) {
    const idx = new Map(); // id -> { images:[], gallery:[], video:null, redgiphy:null, gif:null }

    const urlForKey = (k) => MEDIA_BASE_OK ? (PUBLIC_MEDIA_BASE + k) : null;

    for (const key of keys) {
        // Gallery: Images/<id>/NN.<ext>
        {
            const m = key.match(/^Images\/([^/]+)\/(\d{2})\.([a-z0-9]+)$/i);
            if (m) {
                const id = m[1], nn = parseInt(m[2], 10), ext = m[3].toLowerCase();
                const rec = idx.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
                rec.gallery.push({ n: nn, url: urlForKey(key), ext });
                idx.set(id, rec);
                continue;
            }
        }
        // Single image: Images/<id>.<ext>
        {
            const m = key.match(/^Images\/([^/]+)\.([a-z0-9]+)$/i);
            if (m) {
                const id = m[1], ext = m[2].toLowerCase();
                const rec = idx.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
                rec.images.push({ url: urlForKey(key), ext });
                idx.set(id, rec);
                continue;
            }
        }
        // Video: Videos/<id>.mp4
        {
            const m = key.match(/^Videos\/([^/]+)\.mp4$/i);
            if (m) {
                const id = m[1];
                const rec = idx.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
                rec.video = urlForKey(key);
                idx.set(id, rec);
                continue;
            }
        }
        // RedGiphys/<id>.mp4
        {
            const m = key.match(/^RedGiphys\/([^/]+)\.mp4$/i);
            if (m) {
                const id = m[1];
                const rec = idx.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
                rec.redgiphy = urlForKey(key);
                idx.set(id, rec);
                continue;
            }
        }
        // Gifs/<id>.gif
        {
            const m = key.match(/^Gifs\/([^/]+)\.gif$/i);
            if (m) {
                const id = m[1];
                const rec = idx.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
                rec.gif = urlForKey(key);
                idx.set(id, rec);
                continue;
            }
        }
    }

    // sort gallery frames by NN and flatten to URLs
    for (const [id, rec] of idx.entries()) {
        if (rec.gallery.length) {
            rec.gallery.sort((a, b) => a.n - b.n);
            rec.gallery = rec.gallery.map(g => g.url).filter(Boolean);
        }
        // de-dupe single images
        if (rec.images.length) {
            const seen = new Set();
            rec.images = rec.images.map(i => i.url).filter(u => !!u && !seen.has(u) && seen.add(u));
        }
    }
    return idx;
}

/** ---------- Posts IO ---------- */
async function loadOrderIndex(csvPath) {
    const raw = await fs.readFile(csvPath, "utf8").catch(() => "");
    if (!raw.trim()) return new Map();
    const map = new Map();
    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cells = line.split(",").map(s => s?.trim().replace(/^"(.*)"$/, "$1"));
        const [idxStr, _url, id] = cells;
        const idx = Number(idxStr);
        if (Number.isFinite(idx) && id) map.set(id, idx);
    }
    return map;
}
const ORDER_INDEX = await loadOrderIndex(ORDERED_CSV);

async function loadPosts(rootDir) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const out = [];
    for (const ent of entries) {
        const full = path.join(rootDir, ent.name);
        if (ent.isDirectory()) {
            const sub = ent.name;
            const files = await fs.readdir(full);
            for (const f of files) {
                if (!f.endsWith(".json")) continue;
                const stem = path.parse(f).name;
                const raw = await fs.readFile(path.join(full, f), "utf8").catch(() => "");
                if (!raw.trim()) continue;
                const p = JSON.parse(raw);
                out.push({ __stem: stem, __folder: sub, __rel: `${sub}/${f}`, ...p });
                await fs.writeFile(path.join(POSTS_PUBLIC_DIR, `${stem}.json`), JSON.stringify(p));
            }
        } else if (ent.isFile() && ent.name.endsWith(".json")) {
            const stem = path.parse(ent.name).name;
            const raw = await fs.readFile(full, "utf8").catch(() => "");
            if (!raw.trim()) continue;
            const p = JSON.parse(raw);
            out.push({ __stem: stem, __folder: null, __rel: ent.name, ...p });
            await fs.writeFile(path.join(POSTS_PUBLIC_DIR, `${stem}.json`), JSON.stringify(p));
        }
    }
    return out;
}

/** ---------- Build ---------- */
const posts = await loadPosts(INPUT_DIR);

// 1) Pull object keys from R2 (or cache) and build an index
let r2Keys = [];
try {
    r2Keys = await listAllR2Keys();
    console.log(`R2: indexed ${r2Keys.length} objects`);
} catch (err) {
    console.warn("⚠️  Could not list R2 objects:", err.message);
}
const r2Index = buildR2Index(r2Keys);

const manifest = [];
const warnings = [];

for (const p of posts) {
    const id = p.__stem || p.id || p.name;
    const order_index =
        ORDER_INDEX.get(id) ??
        ORDER_INDEX.get(p.id) ??
        ORDER_INDEX.get(p.name) ??
        null;

    // Gather media from R2 index (priority order)
    const rec = r2Index.get(id) || { images: [], gallery: [], video: null, redgiphy: null, gif: null };
    let media_type = null;
    let media_urls = [];
    let media_url_compact = null;
    let media_preview = null;
    let media_dir = null;
    let gallery_count = null;
    let preview_width = null;
    let preview_height = null;

    if (rec.video) {
        media_type = "video";
        media_urls = [rec.video];
        media_url_compact = rec.video;
        media_preview = rec.images?.[0] || rec.gallery?.[0] || rec.video; // if you want, keep same
        media_dir = "Videos";
    } else if (rec.redgiphy) {
        media_type = "gif";
        media_urls = [rec.redgiphy];
        media_url_compact = rec.redgiphy;
        media_preview = rec.redgiphy;
        media_dir = "RedGiphys";
    } else if (rec.gif) {
        media_type = "gif";
        media_urls = [rec.gif];
        media_url_compact = rec.gif;
        media_preview = rec.gif;
        media_dir = "Gifs";
    } else if (rec.gallery.length >= 2) {
        media_type = "gallery";
        media_urls = rec.gallery.slice();
        media_url_compact = media_urls.slice();
        media_preview = media_urls[0];
        media_dir = "Images";
        gallery_count = media_urls.length;
    } else if (rec.images.length >= 1) {
        media_type = "image";
        media_urls = [rec.images[0]];
        media_url_compact = rec.images[0];
        media_preview = rec.images[0];
        media_dir = "Images";
    } else {
        // No R2 match — fall back to embedded selftext images
        const embedded = extractImageLinksFromSelftext(p);
        if (embedded.length >= 2) {
            media_type = "gallery";
            media_urls = embedded.slice();
            media_url_compact = embedded.slice();
            media_preview = embedded[0];
            media_dir = null; // external
            gallery_count = embedded.length;
        } else if (embedded.length === 1) {
            media_type = "image";
            media_urls = [embedded[0]];
            media_url_compact = embedded[0];
            media_preview = embedded[0];
            media_dir = null; // external
        }
    }

    // Still no preview? Use Reddit preview/thumbnail for card polish
    if (!media_preview) {
        const pr = pickRedditPreview(p);
        media_preview = pr.url;
        preview_width = pr.w;
        preview_height = pr.h;
    }

    if (MEDIA_BASE_OK && ["image", "gallery", "video", "gif"].includes(media_type) && media_urls.length === 0) {
        warnings.push({ id, note: "Expected media but no URLs after R2 indexing.", type: media_type });
    }
    if (!MEDIA_BASE_OK) {
        warnings.push({ note: "PUBLIC_MEDIA_BASE not set; manifest media URLs may be null." });
    }

    manifest.push({
        id,
        permalink: p.permalink,
        url: p.url,
        link_domain: p.link_domain || null,
        title: p.title,
        selftext_preview: plainExcerpt(p.selftext || ""),
        subreddit: p.subreddit,
        author: p.author,
        flair: p.link_flair_text || p.flair || null,
        created_utc: p.created_utc,
        saved_index: p.saved_utc ?? (order_index !== null ? order_index : null),
        order_index,
        score: p.score,
        num_comments: p.num_comments,

        media_type,         // 'image' | 'gallery' | 'video' | 'gif' | 'link' | 'text' | null
        media_dir,          // 'Images' | 'Videos' | 'RedGiphys' | 'Gifs' | null
        media_urls,         // always an array (R2 or external)
        media_url_compact,  // string (single) OR array (gallery)
        gallery_count,      // number | null
        media_preview,      // thumbnail/poster for card
        preview_width,
        preview_height,
    });
}

/** ---------- Facets ---------- */
function inc(map, key) { if (!key) return; map.set(key, (map.get(key) || 0) + 1); }
const subFreq = new Map(), authorFreq = new Map(), flairFreq = new Map(),
    domainFreq = new Map(), mediaFreq = new Map();
for (const m of manifest) {
    inc(subFreq, m.subreddit);
    inc(authorFreq, m.author);
    inc(flairFreq, m.flair);
    inc(domainFreq, m.link_domain);
    inc(mediaFreq, m.media_type);
}
const toPairs = (map) => Array.from(map, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const pairsToObj = (pairs) => Object.fromEntries(pairs.map(({ name, count }) => [name, count]));
const facets = {
    subreddits: pairsToObj(toPairs(subFreq)),
    authors: pairsToObj(toPairs(authorFreq)),
    flairs: pairsToObj(toPairs(flairFreq)),
    domains: pairsToObj(toPairs(domainFreq)),
    mediaTypes: pairsToObj(toPairs(mediaFreq)),
};

/** ---------- Write ---------- */
await fs.writeFile(path.join(INDEX_OUT_DIR, "posts-manifest.json"), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(INDEX_OUT_DIR, "facets.json"), JSON.stringify(facets, null, 2));
await fs.writeFile(path.join(INDEX_OUT_DIR, "build-report.json"), JSON.stringify({ posts: manifest.length, warnings }, null, 2));

console.log(`✅ Manifest built: ${manifest.length} posts`);
console.log(`✅ Facets — subs:${Object.keys(facets.subreddits).length} authors:${Object.keys(facets.authors).length} flairs:${Object.keys(facets.flairs).length} domains:${Object.keys(facets.domains).length} media:${Object.keys(facets.mediaTypes).length}`);
console.log(warnings.length ? `ℹ️ Warnings: ${warnings.length} (see build-report.json)` : "ℹ️ Warnings: 0");
