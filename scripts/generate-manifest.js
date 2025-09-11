// scripts/generate-manifest.js
// Dryrun: node scripts/generate-manifest.js --validate-only
// Run:    node scripts/generate-manifest.js
//
// SCHEMA CONTRACT (public shapes)
// - Post (public):
//   id:string, title:string, subreddit:string, author:string, created_utc:number|null,
//   score?:number|null, num_comments?:number|null, flair?:string|null, permalink?:string, url?:string
//   comments?: Comment[]
// - Comment (public):
//   id:string, author:string|null, body:string, score:number|null, replies:Comment[]
//
// What it does (summary):
// - Lists ALL objects in your Cloudflare R2 bucket via S3 API (paginated)
// - Builds an index: { <postId>: { images[], gallery[], video, redgiphy, gif } }
// - Normalizes each raw post JSON (lossless) and writes to public/data/posts/<id>.json
// - Writes public/data/indexes/{posts-manifest.json, facets.json, build-report.json}
//
// Env (required for R2 listing):
//   R2_ENDPOINT          = "https://<accountid>.r2.cloudflarestorage.com"
//   R2_ACCESS_KEY_ID     = "<access key>"
//   R2_SECRET_ACCESS_KEY = "<secret>"
//   R2_BUCKET            = "<bucket name>"
//   PUBLIC_MEDIA_BASE    = "https://<your-worker-or-cdn>/"
// Optional:
//   R2_OBJECTS_CACHE     = "data/r2_objects.json"     // file path for caching keys
//   R2_SKIP_LIST         = "1"                        // if set, read cache instead of calling R2
//
// Flags / Env:
//   --validate-only OR MANIFEST_VALIDATE_ONLY=1  => validate/normalize in-memory; do not write manifest/facets/posts
//
// NOTE: PUBLIC_MEDIA_BASE is used to build absolute media URLs in the manifest.

console.log(
    "ENV present:",
    !!process.env.R2_ENDPOINT,
    !!process.env.R2_ACCESS_KEY_ID,
    !!process.env.R2_SECRET_ACCESS_KEY,
    !!process.env.R2_BUCKET,
    !!process.env.PUBLIC_MEDIA_BASE
);

import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

try { await import("dotenv/config"); } catch { }

const VALIDATE_ONLY =
    process.argv.includes("--validate-only") ||
    process.env.MANIFEST_VALIDATE_ONLY === "1";

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
function isImageUrl(u) {
    const ext = extFromUrl(u);
    if (!ext) return false;
    return /^(jpe?g|png|webp)$/i.test(ext);
}
function stableHash(s = "") {
    // tiny djb2 -> base36, 6 chars; stable across runs
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36).slice(0, 6);
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

/** ---------- Lossless schema normalization ---------- */
const POST_REQUIRED = ["id", "title", "subreddit", "author", "created_utc"];
const coerceStr = (v) => (v === null || v === undefined) ? "" : String(v);
const coerceNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * Normalize Reddit-ish replies that might be:
 *  - array of comments
 *  - object with .data.children = [{ data: comment }, ...]
 *  - empty string "" (no replies)
 */
function toReplyArray(rawReplies) {
    if (!rawReplies) return [];
    if (Array.isArray(rawReplies)) return rawReplies;
    if (typeof rawReplies === "string") return []; // reddit sometimes returns "" for no replies
    const children = rawReplies?.data?.children;
    if (Array.isArray(children)) {
        return children.map((c) => c?.data || c).filter(Boolean);
    }
    return [];
}

/**
 * Lossless, never-drop normalization of a single comment node.
 * Synthesizes id when missing; defaults author/body/score; recurses into replies as array.
 */
function normalizeComment(node, warnings, pathTag = "comments", idx = 0, parentSynth = "root") {
    const obj = (node && typeof node === "object") ? node : {};
    const rawId = obj.id != null ? String(obj.id) : "";
    const body = obj.body != null ? coerceStr(obj.body) : "";
    const author = obj.author != null ? coerceStr(obj.author) : null;
    const score = coerceNum(obj.score);
    const repliesRaw = toReplyArray(obj.replies);

    let id = rawId.trim();
    if (!id) {
        // synth id: cid_<parent>_<pathIdx>_<hash>
        id = `cid_${parentSynth}_${pathTag}-${idx}_${stableHash(body || author || "")}`;
        warnings.push({ note: "Synthesized comment id", where: `${pathTag}[${idx}]`, synth: id });
    }
    const normReplies = [];
    for (let i = 0; i < repliesRaw.length; i++) {
        normReplies.push(normalizeComment(repliesRaw[i], warnings, `${pathTag}.replies`, i, id));
    }
    return { id, author, body, score, replies: normReplies };
}

/**
 * Lossless normalization of a post to the public shape.
 * Never drops a post; coerces required fields; normalizes comments if present.
 */
function normalizePostForPublic(raw, warnings, idHint) {
    const id0 = raw?.id || raw?.name || idHint || "";
    const id = coerceStr(id0) || `pid_${stableHash(JSON.stringify(raw).slice(0, 200))}`;
    const title = coerceStr(raw?.title);
    const subreddit = coerceStr(raw?.subreddit);
    const author = coerceStr(raw?.author);
    const created_utc = coerceNum(raw?.created_utc);
    const coerced = { id, title, subreddit, author, created_utc };
    const missing = POST_REQUIRED.filter(k => coerced[k] === "" || coerced[k] === null);
    if (missing.length) {
        warnings.push({ id, note: `Post missing/coerced fields: ${missing.join(", ")}`, type: "schema" });
    }
    // comments can exist under raw.comments or raw.data.comments
    const topComments = Array.isArray(raw?.comments)
        ? raw.comments
        : Array.isArray(raw?.data?.comments)
            ? raw.data.comments
            : null;

    let normComments = null;
    if (Array.isArray(topComments)) {
        normComments = [];
        for (let i = 0; i < topComments.length; i++) {
            normComments.push(normalizeComment(topComments[i], warnings, "comments", i, id));
        }
    }
    return {
        ...raw,
        id, title, subreddit, author, created_utc,
        comments: normComments ?? undefined,
    };
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
        forcePathStyle: true,
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
                out.push({ __stem: stem, __folder: sub, __rel: `${sub}/${f}`, __raw: p });
            }
        } else if (ent.isFile() && ent.name.endsWith(".json")) {
            const stem = path.parse(ent.name).name;
            const raw = await fs.readFile(full, "utf8").catch(() => "");
            if (!raw.trim()) continue;
            const p = JSON.parse(raw);
            out.push({ __stem: stem, __folder: null, __rel: ent.name, __raw: p });
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
let normalizedWritten = 0;

for (const p of posts) {
    const raw = p.__raw || p;
    const idGuess = p.__stem || raw.id || raw.name;

    // Normalize BEFORE writing any public files (lossless)
    const norm = normalizePostForPublic(raw, warnings, idGuess);
    const id = norm.id;
    const publicPath = path.join(POSTS_PUBLIC_DIR, `${id}.json`);

    // Write normalized public post JSON (unless validate-only)
    if (!VALIDATE_ONLY) {
        try {
            await fs.writeFile(publicPath, JSON.stringify(norm));
            normalizedWritten++;
        } catch (e) {
            warnings.push({ id, note: `Failed to write normalized post JSON: ${e.message}`, type: "io" });
        }
    }

    const order_index =
        ORDER_INDEX.get(id) ??
        ORDER_INDEX.get(raw.id) ??
        ORDER_INDEX.get(raw.name) ??
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
        // Prefer an IMAGE poster if present in R2; never point previews to videos
        media_preview = rec.images?.[0] || rec.gallery?.[0] || null;
        media_dir = "Videos";
    } else if (rec.redgiphy) {
        media_type = "video";
        media_urls = [rec.redgiphy];
        media_url_compact = rec.redgiphy;
        // Prefer an IMAGE poster; do not use gif/video for previews
        media_preview = rec.images?.[0] || rec.gallery?.[0] || null;
        media_dir = "RedGiphys";
    } else if (rec.gif) {
        media_type = "gif";
        media_urls = [rec.gif];
        media_url_compact = rec.gif;
        // Prefer an IMAGE poster; do not use gif for previews
        media_preview = rec.images?.[0] || rec.gallery?.[0] || null;
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
        const embedded = extractImageLinksFromSelftext(raw);
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
        } else {
            media_type = "text";
        }
    }

    // --- Guarantee IMAGE previews for all media types ---
    // 1) If preview exists but isn't an image, discard it (only jpg/png/webp)
    if (media_preview && !isImageUrl(media_preview)) {
        media_preview = null;
    }
    // 2) If missing, try to use an R2 image (single or first gallery frame)
    if (!media_preview) {
        const candidate = rec.images?.[0] || rec.gallery?.[0] || null;
        if (candidate && isImageUrl(candidate)) {
            media_preview = candidate;
        }
    }
    // 3) If still missing, fall back to Reddit's derived preview/thumbnail
    if (!media_preview) {
        const pr = pickRedditPreview(raw);
        if (pr?.url) {
            media_preview = pr.url;
            preview_width = pr.w;
            preview_height = pr.h;
        }
    }

    // --- Warnings ---
    // Warn if post has media but no R2 URLs (possible upload failure)
    if (MEDIA_BASE_OK && ["image", "gallery", "video", "gif"].includes(media_type) && media_urls.length === 0) {
        warnings.push({ id, note: "Expected media but no URLs after R2 indexing.", type: media_type });
    }
    if (!MEDIA_BASE_OK) {
        warnings.push({ note: "PUBLIC_MEDIA_BASE not set; manifest media URLs may be null." });
    }
    // Final safety net: warn if a media post still lacks an image preview
    if (["image", "gallery", "video", "gif"].includes(media_type) && !media_preview) {
        warnings.push({
            id,
            note: "Media post lacks an image preview (poster/thumbnail not found).",
            type: media_type
        });
    }

    manifest.push({
        id,
        permalink: raw.permalink,
        url: raw.url,
        link_domain: raw.link_domain || null,
        title: norm.title,
        selftext_preview: plainExcerpt(raw.selftext || ""),
        subreddit: norm.subreddit,
        author: norm.author,
        flair: raw.link_flair_text || raw.flair || null,
        created_utc: norm.created_utc,
        saved_index: raw.saved_utc ?? (order_index !== null ? order_index : null),
        order_index,
        score: raw.score,
        num_comments: raw.num_comments,

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
if (!VALIDATE_ONLY) {
    await fs.writeFile(path.join(INDEX_OUT_DIR, "posts-manifest.json"), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(INDEX_OUT_DIR, "facets.json"), JSON.stringify(facets, null, 2));
}
const report = {
    posts: manifest.length,
    normalized_posts_written: VALIDATE_ONLY ? 0 : normalizedWritten,
    warnings
};
await fs.writeFile(path.join(INDEX_OUT_DIR, "build-report.json"), JSON.stringify(report, null, 2));

console.log(`✅ Manifest built: ${manifest.length} posts`);
console.log(`✅ Facets — subs:${Object.keys(facets.subreddits).length} authors:${Object.keys(facets.authors).length} flairs:${Object.keys(facets.flairs).length} domains:${Object.keys(facets.domains).length} media:${Object.keys(facets.mediaTypes).length}`);
console.log(warnings.length ? `ℹ️ Warnings: ${warnings.length} (see build-report.json)` : "ℹ️ Warnings: 0");
if (VALIDATE_ONLY) console.log("🔎 Validate-only mode: manifest/facets not written");
