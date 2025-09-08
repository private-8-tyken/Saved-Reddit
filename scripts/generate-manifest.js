// Run using:
//   node scripts/generate-manifest.js
//
// Outputs under public/data/indexes:
//   - posts-manifest.json   (list used by the feed)
//   - facets.json           (maps of name->count for sidebar chips)
//   - build-report.json     (counts & warnings)
// And it copies each original post JSON to public/data/posts/<id>.json
//
// Env knobs (optional):
//   TOP_N_FACETS=50   // if set, trims each facet map to top-N by count (then A→Z)
//
// Notes:
// - Consolidates counts into facets.json so the UI doesn't need subs-all/authors-all.
// - Supports optional data/ordered_posts.csv to pin saved/order indices.
// - NEW: Emits stable R2 URLs for media so UI doesn't guess.

import { promises as fs } from "node:fs";
import path from "node:path";

// (optional) let Node load .env if present
try { await import('dotenv/config'); } catch { }

const ROOT = process.cwd(); // run from repo root
const INPUT_DIR = path.resolve(ROOT, "data/posts");
const INDEX_OUT_DIR = path.resolve(ROOT, "public/data/indexes");
const POSTS_PUBLIC_DIR = path.resolve(ROOT, "public/data/posts");
const ORDERED_CSV = path.resolve(ROOT, "data/ordered_posts.csv");

await fs.mkdir(INDEX_OUT_DIR, { recursive: true });
await fs.mkdir(POSTS_PUBLIC_DIR, { recursive: true });

/** --- MEDIA BASE (R2 Worker/Domain) --- */
const RAW_MEDIA_BASE = process.env.PUBLIC_MEDIA_BASE || "";
const MEDIA_BASE = RAW_MEDIA_BASE
    ? RAW_MEDIA_BASE.replace(/\s+$/, "").replace(/\/?$/, "/")
    : "";
const MEDIA_BASE_OK = !!MEDIA_BASE;

/** --- tiny CSV loader for "index,url,id" (no header) --- */
async function loadOrderIndex(csvPath) {
    const raw = await fs.readFile(csvPath, "utf8").catch(() => "");
    if (!raw.trim()) return new Map();
    const map = new Map();
    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cells = line.split(",").map((s) => s?.trim().replace(/^"(.*)"$/, "$1"));
        const [indexStr, _url, id] = cells;
        const idx = Number(indexStr);
        if (Number.isFinite(idx) && id) map.set(id, idx);
    }
    return map;
}
const ORDER_INDEX = await loadOrderIndex(ORDERED_CSV);

/** --- helpers --- */
function plainExcerpt(text, n = 320) {
    if (!text) return "";
    const t = String(text)
        .replace(/\r\n?|\n/g, " ")
        .replace(/\s+/g, " ")
        // strip basic markdown and [label](url) links
        .replace(/[*_`>#~]|\\|\[(.*?)\]\((.*?)\)/g, "$1");
    return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

function pickPreviewFromReddit(p) {
    const local =
        p?.media?.items?.find((it) => it.thumbnail)?.thumbnail ||
        p?.media?.video?.poster;
    if (local)
        return { url: local, w: p?.media?.items?.[0]?.width, h: p?.media?.items?.[0]?.height, kind: "local" };

    const pr = p?.preview?.images?.[0];
    if (pr?.resolutions?.length) {
        const cand =
            [...pr.resolutions]
                .sort((a, b) => a.width - b.width)
                .find((r) => r.width >= 240 && r.width <= 360) || pr.resolutions[0];
        return { url: cand.url?.replace(/&amp;/g, "&"), w: cand.width, h: cand.height, kind: "reddit" };
    }
    const th = p?.thumbnail;
    if (th && /^https?:\/\//.test(th)) return { url: th, w: 140, h: 140, kind: "external" };
    return { url: null, w: null, h: null, kind: null };
}

async function loadPosts(rootDir) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const out = [];
    for (const ent of entries) {
        const full = path.join(rootDir, ent.name);
        if (ent.isDirectory()) {
            const sub = ent.name; // e.g., text, image, video, gallery, gif
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

const posts = await loadPosts(INPUT_DIR);

/** --- media-type normalization from folders --- */
const MEDIA_FOLDER_MAP = {
    text: "text",
    link: "link",
    image: "image",
    images: "image",
    gallery: "gallery",
    video: "video",
    videos: "video",
    gif: "gif",
    gifs: "gif",
    external: "external",
    media: "media",
    other: "other",
};
function mediaTypeFromFolder(folder) {
    if (!folder) return null;
    const key = String(folder).toLowerCase();
    return MEDIA_FOLDER_MAP[key] || null;
}

/** --- NEW: media URL construction helpers --- */
const EXT_FROM_MIME = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
};

function extFromUrl(u) {
    if (!u) return null;
    try {
        const clean = u.split("?")[0].split("#")[0];
        const m = clean.match(/\.([a-z0-9]+)$/i);
        return m ? m[1].toLowerCase() : null;
    } catch { return null; }
}
function extFromMime(m) {
    return EXT_FROM_MIME[m?.toLowerCase?.()] || null;
}

function zero2(i) {
    return String(i).padStart(2, "0");
}

function guessImageExtFromPost(p) {
    // Try: Reddit media_metadata (gallery) → mime
    const mm = p?.media_metadata;
    if (mm && typeof mm === "object") {
        for (const k of Object.keys(mm)) {
            const mime = mm[k]?.m; // e.g., "image/jpg"
            const ext = extFromMime(mime);
            if (ext) return ext;
        }
    }
    // Try the main URL
    const e = extFromUrl(p?.url);
    if (e && ["jpg", "jpeg", "png", "webp", "gif"].includes(e)) {
        return e === "jpeg" ? "jpg" : e;
    }
    // Fallback default
    return "jpg";
}

function deriveMedia(p) {
    const id = p.__stem || p.id || p.name;
    const folderType = mediaTypeFromFolder(p.__folder);
    const autoType = p?.media?.type || (p?.is_self ? "text" : p?.link_domain ? "link" : undefined);
    const media_type = folderType || autoType || null;

    if (!MEDIA_BASE_OK) {
        return { media_type, media_dir: null, media_urls: [], gallery_count: null, preview_url: null, note: "no-media-base" };
    }

    // Map type to base R2 directory & extension logic
    if (media_type === "gif") {
        const u = `${MEDIA_BASE}Gifs/${id}.gif`;
        return { media_type, media_dir: "Gifs", media_urls: [u], gallery_count: 1, preview_url: u };
    }

    if (media_type === "video") {
        // Our buckets: Videos/<id>.mp4 OR RedGiphys/<id>.mp4 (if you placed it there)
        // Heuristic: Prefer Videos/ if post hints at hosted video, else RedGiphys/ if it originated as a "gifv".
        const redg = `${MEDIA_BASE}RedGiphys/${id}.mp4`;
        const vids = `${MEDIA_BASE}Videos/${id}.mp4`;
        // If your dataset uses only one of these, pick one consistently:
        const use = p?.link_domain?.includes("giphy") || p?.url?.includes("gfycat") ? redg : vids;
        const dir = use.includes("/RedGiphys/") ? "RedGiphys" : "Videos";
        return { media_type, media_dir: dir, media_urls: [use], gallery_count: 1, preview_url: use };
    }

    if (media_type === "image" || media_type === "gallery") {
        // Single image: Images/<id>.<ext>
        // Gallery: Images/<id>/<01..N>.<ext>  (N from media_metadata or gallery_data/items)
        const imgExt = guessImageExtFromPost(p); // jpg|png|webp|gif
        const media_dir = "Images";

        // Detect gallery count
        let n = 0;
        if (Array.isArray(p?.gallery_data?.items)) {
            n = p.gallery_data.items.length;
        } else if (Array.isArray(p?.media?.items)) {
            n = p.media.items.length;
        } else {
            // Some posts have media_metadata keys but not gallery_data.items length
            if (p?.media_metadata && typeof p.media_metadata === "object") {
                n = Object.keys(p.media_metadata).length;
            }
        }

        if (media_type === "gallery" || n > 1) {
            const count = Math.max(2, n || 0); // if unknown but flagged as gallery, emit at least 2
            const urls = [];
            const max = count || 0;
            for (let i = 1; i <= max; i++) {
                urls.push(`${MEDIA_BASE}${media_dir}/${id}/${zero2(i)}.${imgExt}`);
            }
            const preview_url = urls[0] || null;
            return { media_type: "gallery", media_dir, media_urls: urls, gallery_count: urls.length || null, preview_url };
        } else {
            const u = `${MEDIA_BASE}${media_dir}/${id}.${imgExt}`;
            return { media_type: "image", media_dir, media_urls: [u], gallery_count: 1, preview_url: u };
        }
    }

    // Links or text or unknown → no media URLs
    return { media_type: media_type || null, media_dir: null, media_urls: [], gallery_count: null, preview_url: null };
}

/** --- build feed manifest --- */
const manifest = [];
const warnings = [];

for (const p of posts) {
    const id = p.__stem || p.id || p.name;

    const order_index =
        ORDER_INDEX.get(id) ??
        ORDER_INDEX.get(p.id) ??
        ORDER_INDEX.get(p.name) ??
        null;

    const r2 = deriveMedia(p);
    if (!MEDIA_BASE_OK) {
        warnings.push({ note: "PUBLIC_MEDIA_BASE not set; no R2 media URLs were emitted in the manifest." });
    } else if ((r2.media_type === "image" || r2.media_type === "gallery" || r2.media_type === "video" || r2.media_type === "gif") && r2.media_urls.length === 0) {
        warnings.push({ id, note: "Could not derive media URLs for post", folder: p.__folder, url: p.url });
    }

    // Preview: prefer R2 preview; else fall back to Reddit preview
    const prevReddit = pickPreviewFromReddit(p);
    const media_preview = r2.preview_url || prevReddit.url;
    const preview_width = r2.preview_url ? (p?.media?.items?.[0]?.width || null) : (prevReddit.w || null);
    const preview_height = r2.preview_url ? (p?.media?.items?.[0]?.height || null) : (prevReddit.h || null);
    const preview_kind = r2.preview_url ? "r2" : prevReddit.kind;

    manifest.push({
        id, // guaranteed id
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

        // NEW: normalized media info for UI
        media_type: r2.media_type,
        media_dir: r2.media_dir,          // e.g., "Images", "Gifs", "RedGiphys", "Videos"
        media_urls: r2.media_urls,        // array of absolute R2 URLs
        gallery_count: r2.gallery_count,  // null or number
        media_preview,                    // absolute preview URL (R2 if available; else reddit/thumb)
        preview_width,
        preview_height,
        preview_kind,
    });
}

/** --- facet counts (maps of name -> count) --- */
function inc(map, key) { if (!key) return; map.set(key, (map.get(key) || 0) + 1); }
const subFreq = new Map();
const authorFreq = new Map();
const flairFreq = new Map();
const domainFreq = new Map();
const mediaFreq = new Map();
for (const m of manifest) {
    inc(subFreq, m.subreddit);
    inc(authorFreq, m.author);
    inc(flairFreq, m.flair);
    inc(domainFreq, m.link_domain);
    inc(mediaFreq, m.media_type);
}

function toSortedTopN(map, topN) {
    const arr = Array.from(map, ([name, count]) => ({ name, count }));
    arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return Number.isFinite(topN) && topN > 0 ? arr.slice(0, topN) : arr;
}
function pairsToObj(pairs) {
    const o = Object.create(null);
    for (const { name, count } of pairs) o[name] = count;
    return o;
}

const TOP_N = Number(process.env.TOP_N_FACETS || 0) || 0;
const facets = {
    subreddits: pairsToObj(toSortedTopN(subFreq, TOP_N)),
    authors: pairsToObj(toSortedTopN(authorFreq, TOP_N)),
    flairs: pairsToObj(toSortedTopN(flairFreq, TOP_N)),
    domains: pairsToObj(toSortedTopN(domainFreq, TOP_N)),
    mediaTypes: pairsToObj(toSortedTopN(mediaFreq, TOP_N)),
};

/** --- write outputs --- */
await fs.writeFile(path.join(INDEX_OUT_DIR, "posts-manifest.json"), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(INDEX_OUT_DIR, "facets.json"), JSON.stringify(facets, null, 2));

/** --- Build report (basic warnings + NEW notes) --- */
const KNOWN_MEDIA_FOLDERS = new Set(Object.keys(MEDIA_FOLDER_MAP));
for (const p of posts) {
    if (p.__folder && !KNOWN_MEDIA_FOLDERS.has(p.__folder.toLowerCase())) {
        warnings.push({ id: p.__stem, note: "Unknown media folder", folder: p.__folder });
    }
}
for (const m of manifest) {
    const miss = [];
    if (!m.id) miss.push("id");
    if (!m.title) miss.push("title");
    if (!m.subreddit) miss.push("subreddit");
    if (miss.length) warnings.push({ id: m.id || "(unknown)", missing: miss });
    if (
        m.media_preview &&
        !/^https?:\/\//.test(m.media_preview) &&
        !m.media_preview?.startsWith("media/") &&
        !m.media_preview?.startsWith("public/")
    ) {
        warnings.push({ id: m.id, note: "media_preview may not exist at runtime", value: m.media_preview });
    }
}

await fs.writeFile(path.join(INDEX_OUT_DIR, "build-report.json"), JSON.stringify({ posts: manifest.length, warnings }, null, 2));

console.log(`✅ Manifest built: ${manifest.length} posts (with R2 media URLs & text previews).`);
console.log(
    `✅ Facets: subs=${Object.keys(facets.subreddits).length}, authors=${Object.keys(facets.authors).length}, flairs=${Object.keys(facets.flairs).length}, domains=${Object.keys(facets.domains).length}, media=${Object.keys(facets.mediaTypes).length}`
);
console.log(
    warnings.length
        ? `ℹ️  Warnings: ${warnings.length} (see public/data/indexes/build-report.json)`
        : "ℹ️  Warnings: 0"
);
