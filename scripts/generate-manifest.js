// Run using:
//   node scripts/generate-manifest.js
//
// What it does (outputs under public/data/indexes):
//   - posts-manifest.json         (list used by the feed)
//   - facets.json                 (small, alphabetical lists for sidebar chips)
//   - subs-all.json               (all subreddits with counts, freq-sorted desc)
//   - authors-all.json            (all authors with counts, freq-sorted desc)
//   - build-report.json           (counts & warnings)
// And it copies each original post JSON to public/data/posts/<id>.json
//
// Env knobs (optional):
//   TOP_N_FACETS=50   // truncate subreddits/authors in facets.json (sidebar)

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd(); // run from repo root
const INPUT_DIR = path.resolve(ROOT, "data/posts");
const INDEX_OUT_DIR = path.resolve(ROOT, "public/data/indexes");
const POSTS_PUBLIC_DIR = path.resolve(ROOT, "public/data/posts");

await fs.mkdir(INDEX_OUT_DIR, { recursive: true });
await fs.mkdir(POSTS_PUBLIC_DIR, { recursive: true });

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

async function loadPosts(dir) {
    const files = await fs.readdir(dir);
    const posts = [];
    for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const stem = path.parse(f).name; // filename without .json
        try {
            const raw = await fs.readFile(path.join(dir, f), "utf8");
            if (!raw.trim()) continue;
            const p = JSON.parse(raw);
            posts.push({ __stem: stem, ...p }); // expose stem for id
            // copy original to public for detail view
            await fs.writeFile(
                path.join(POSTS_PUBLIC_DIR, `${stem}.json`),
                JSON.stringify(p)
            );
        } catch {
            // ignore bad files
        }
    }
    return posts;
}

const posts = await loadPosts(INPUT_DIR);

// ----- Build manifest used by the feed -----
const manifest = posts.map((p) => {
    const id = p.__stem || p.id || p.name; // prefer filename/stem
    const media_type =
        p?.media?.type ||
        (p?.is_self ? "text" : p?.link_domain ? "link" : undefined);
    const has_media = !!(
        p?.media && ((p.media.items && p.media.items.length) || p.media.video)
    );
    const prev = pickPreview(p);

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
        saved_utc: p.saved_utc,
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

// ----- Facets (small lists for sidebar chips) -----
const uniqSorted = (arr) =>
    Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
    );
const TOP_N = Number(process.env.TOP_N_FACETS || 50); // adjust/omit as desired

// Frequency maps for big lists
const subFreq = new Map();
const authorFreq = new Map();
for (const m of manifest) {
    if (m.subreddit)
        subFreq.set(m.subreddit, (subFreq.get(m.subreddit) || 0) + 1);
    if (m.author) authorFreq.set(m.author, (authorFreq.get(m.author) || 0) + 1);
}

// Big lists with counts, sorted by frequency desc (then A→Z)
const subsAll = Array.from(subFreq, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
);
const authorsAll = Array.from(
    authorFreq,
    ([name, count]) => ({ name, count })
).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

// Small, alphabetical facets for the sidebar (optionally truncated)
const facets = {
    subreddits: uniqSorted(manifest.map((p) => p.subreddit)).slice(0, TOP_N),
    authors: uniqSorted(manifest.map((p) => p.author)).slice(0, TOP_N),
    flairs: uniqSorted(manifest.map((p) => p.flair)),
    domains: uniqSorted(manifest.map((p) => p.link_domain)),
    mediaTypes: uniqSorted(manifest.map((p) => p.media_type)),
};

// ----- Write outputs -----
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "posts-manifest.json"),
    JSON.stringify(manifest, null, 2)
);
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "facets.json"),
    JSON.stringify(facets, null, 2)
);
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "subs-all.json"),
    JSON.stringify(subsAll, null, 2)
);
await fs.writeFile(
    path.join(INDEX_OUT_DIR, "authors-all.json"),
    JSON.stringify(authorsAll, null, 2)
);

console.log(
    `✅ Manifest built: ${manifest.length} posts (with media & text previews).`
);
console.log(
    `✅ Big lists: ${subsAll.length} subreddits, ${authorsAll.length} authors.`
);

// ----- Build report -----
const warnings = [];
for (const m of manifest) {
    const miss = [];
    if (!m.id) miss.push("id");
    if (!m.title) miss.push("title");
    if (!m.subreddit) miss.push("subreddit");
    if (miss.length) warnings.push({ id: m.id || "(unknown)", missing: miss });
    if (
        m.media_preview &&
        !/^https?:\/\//.test(m.media_preview) &&
        !m.media_preview.startsWith("media/") &&
        !m.media_preview.startsWith("public/")
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
