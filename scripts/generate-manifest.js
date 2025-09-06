// Run using:
//   node scripts/generate-manifest.js
//
// What it does (outputs under public/data/indexes):
//   - posts-manifest.json   (list used by the feed)
//   - facets.json           (maps of name->count for sidebar chips)
//   - build-report.json     (counts & warnings)
// And it copies each original post JSON to public/data/posts/<id>.json
//
// Env knobs (optional):
//   TOP_N_FACETS=50   // if set, trims each facet map to top-N by count (then A→Z)
//
// Notes:
// - This consolidates counts into facets.json so the UI doesn't need subs-all/authors-all.
// - It also supports an optional data/ordered_posts.csv to pin saved/order indices.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd(); // run from repo root
const INPUT_DIR = path.resolve(ROOT, "data/posts");
const INDEX_OUT_DIR = path.resolve(ROOT, "public/data/indexes");
const POSTS_PUBLIC_DIR = path.resolve(ROOT, "public/data/posts");
const ORDERED_CSV = path.resolve(ROOT, "data/ordered_posts.csv");

await fs.mkdir(INDEX_OUT_DIR, { recursive: true });
await fs.mkdir(POSTS_PUBLIC_DIR, { recursive: true });

/** --- tiny CSV loader for "index,url,id" (no header) --- */
async function loadOrderIndex(csvPath) {
    const raw = await fs.readFile(csvPath, "utf8").catch(() => "");
    if (!raw.trim()) return new Map();
    const map = new Map();
    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        // naive CSV split; handles optional quotes around fields
        const cells = line
            .split(",")
            .map((s) => s?.trim().replace(/^"(.*)"$/, "$1"));
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

function pickPreview(p) {
    // Prefer local poster/thumb if you saved one
    const local =
        p?.media?.items?.find((it) => it.thumbnail)?.thumbnail ||
        p?.media?.video?.poster;
    if (local)
        return {
            url: local,
            w: p?.media?.items?.[0]?.width,
            h: p?.media?.items?.[0]?.height,
            kind: "local",
        };

    // Reddit preview (best-fit small resolution)
    const pr = p?.preview?.images?.[0];
    if (pr?.resolutions?.length) {
        const cand =
            [...pr.resolutions]
                .sort((a, b) => a.width - b.width)
                .find((r) => r.width >= 240 && r.width <= 360) || pr.resolutions[0];
        return {
            url: cand.url?.replace(/&amp;/g, "&"),
            w: cand.width,
            h: cand.height,
            kind: "reddit",
        };
    }

    // Fallback thumbnail URL if present
    const th = p?.thumbnail;
    if (th && /^https?:\/\//.test(th))
        return { url: th, w: 140, h: 140, kind: "external" };

    return { url: null, w: null, h: null, kind: null };
}

async function loadPosts(rootDir) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const out = [];
    for (const ent of entries) {
        const full = path.join(rootDir, ent.name);
        if (ent.isDirectory()) {
            // first-level folder name (e.g., text, image, video, link, gallery, gif)
            const sub = ent.name;
            const files = await fs.readdir(full);
            for (const f of files) {
                if (!f.endsWith(".json")) continue;
                const stem = path.parse(f).name;
                const raw = await fs.readFile(path.join(full, f), "utf8").catch(() => "");
                if (!raw.trim()) continue;
                const p = JSON.parse(raw);
                out.push({ __stem: stem, __folder: sub, __rel: `${sub}/${f}`, ...p });
                // copy original to public (flat name by default)
                await fs.writeFile(
                    path.join(POSTS_PUBLIC_DIR, `${stem}.json`),
                    JSON.stringify(p)
                );
            }
        } else if (ent.isFile() && ent.name.endsWith(".json")) {
            const stem = path.parse(ent.name).name;
            const raw = await fs.readFile(full, "utf8").catch(() => "");
            if (!raw.trim()) continue;
            const p = JSON.parse(raw);
            out.push({ __stem: stem, __folder: null, __rel: ent.name, ...p });
            await fs.writeFile(
                path.join(POSTS_PUBLIC_DIR, `${stem}.json`),
                JSON.stringify(p)
            );
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
    external: "external", // for external links
    media: "media", // generic media folder
    other: "other", // catch-all
};

function mediaTypeFromFolder(folder) {
    if (!folder) return null;
    const key = String(folder).toLowerCase();
    return MEDIA_FOLDER_MAP[key] || null;
}

/** --- build feed manifest --- */
const manifest = posts.map((p) => {
    const id = p.__stem || p.id || p.name;

    // 1) Prefer folder-based media type if present and recognized
    const folderType = mediaTypeFromFolder(p.__folder);

    // 2) Fallback: original auto-detection
    const autoType =
        p?.media?.type ||
        (p?.is_self ? "text" : p?.link_domain ? "link" : undefined);

    const media_type = folderType || autoType || null;

    const has_media = !!(
        p?.media && ((p.media.items && p.media.items.length) || p.media.video)
    );

    const prev = pickPreview(p);

    const order_index =
        ORDER_INDEX.get(id) ??
        ORDER_INDEX.get(p.id) ??
        ORDER_INDEX.get(p.name) ??
        null;

    return {
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
        media_type,
        has_media,
        media_preview: prev.url,
        preview_width: prev.w || null,
        preview_height: prev.h || null,
        preview_kind: prev.kind || null,
    };
});

/** --- facet counts (maps of name -> count) --- */
function inc(map, key) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
}
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
    // returns an array [{name, count}] sorted by count desc, then A→Z, sliced to topN (if provided)
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
// If TOP_N set, we trim each facet to top-N to keep the sidebar tiny.
// Otherwise, we emit full maps (the panel can still search/filter client-side).
const facets = {
    subreddits: pairsToObj(toSortedTopN(subFreq, TOP_N)),
    authors: pairsToObj(toSortedTopN(authorFreq, TOP_N)),
    flairs: pairsToObj(toSortedTopN(flairFreq, TOP_N)),
    domains: pairsToObj(toSortedTopN(domainFreq, TOP_N)),
    mediaTypes: pairsToObj(toSortedTopN(mediaFreq, TOP_N)),
};

/** --- write outputs --- */
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "posts-manifest.json"),
    JSON.stringify(manifest, null, 2)
);
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "facets.json"),
    JSON.stringify(facets, null, 2)
);

console.log(`✅ Manifest built: ${manifest.length} posts (with media & text previews).`);
console.log(
    `✅ Facets: subs=${Object.keys(facets.subreddits).length}, authors=${Object.keys(facets.authors).length}, flairs=${Object.keys(facets.flairs).length}, domains=${Object.keys(facets.domains).length}, media=${Object.keys(facets.mediaTypes).length}`
);

/** --- Build report (basic warnings) --- */
const warnings = [];

const KNOWN_MEDIA_FOLDERS = new Set(Object.keys(MEDIA_FOLDER_MAP));
for (const p of posts) {
    if (p.__folder && !KNOWN_MEDIA_FOLDERS.has(p.__folder.toLowerCase())) {
        warnings.push({
            id: p.__stem,
            note: "Unknown media folder",
            folder: p.__folder,
        });
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
        warnings.push({
            id: m.id,
            note: "media_preview may not exist at runtime",
            value: m.media_preview,
        });
    }
}

await fs.writeFile(
    path.join(INDEX_OUT_DIR, "build-report.json"),
    JSON.stringify({ posts: manifest.length, warnings }, null, 2)
);
console.log(
    `ℹ️  Warnings: ${warnings.length} (see public/data/indexes/build-report.json)`
);
