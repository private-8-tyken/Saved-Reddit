// scripts/export-manifest-to-csv.js
// Usage (PowerShell / CMD):
//   node scripts/export-manifest-to-csv.js
//   node scripts/export-manifest-to-csv.js --in public/data/indexes/posts-manifest.json --out data/manifest-export.csv
//
// Outputs CSV columns:
// id, permalink, url, title, created_utc, saved_index, order_index, score, num_comments

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

// sensible defaults for this repo
const ROOT = process.cwd();
function getArg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
    return fallback;
}

const IN_PATH = path.resolve(ROOT, getArg("--in", "public/data/indexes/posts-manifest.json"));
const OUT_PATH = path.resolve(ROOT, getArg("--out", "scripts/manifest-export.csv"));

// CSV escape helper
function esc(v) {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
    "id",
    "permalink",
    "url",
    "title",
    "created_utc",
    "saved_index",
    "order_index",
    "score",
    "num_comments",
];

async function main() {
    // read manifest
    const raw = await fs.readFile(IN_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
        throw new Error(`Manifest at ${IN_PATH} did not contain an array.`);
    }

    // ensure output dir exists
    await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });

    // write CSV
    const lines = [];
    lines.push(HEADERS.join(","));

    for (const p of arr) {
        lines.push([
            esc(p.id ?? ""),
            esc(p.permalink ?? ""),
            esc(p.url ?? ""),
            esc(p.title ?? ""),
            esc(p.created_utc ?? ""),       // note: field name is "created_utc" in manifest
            esc(p.saved_index ?? ""),
            esc(p.order_index ?? ""),
            esc(p.score ?? ""),
            esc(p.num_comments ?? ""),
        ].join(","));
    }

    const csv = lines.join("\n");
    await fs.writeFile(OUT_PATH, csv, "utf8");

    console.log(`✅ Wrote ${arr.length} rows to ${OUT_PATH}`);
}

main().catch((err) => {
    console.error("❌ Export failed:", err?.message || err);
    process.exit(1);
});
