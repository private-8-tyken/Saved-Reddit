// src/utils/storage.js
// Favorites + auth utilities with a v2 schema and CSV import/export
// + Viewed state with TTL (v2) for “Hide Viewed” feed filtering

/** Storage key (new schema) */
const FAV_KEY_V2 = 'sr__v2__favorites';

const hasWindow = typeof window !== 'undefined';
const hasLocal = hasWindow && typeof window.localStorage !== 'undefined';
const hasSession = hasWindow && typeof window.sessionStorage !== 'undefined';

/** In-memory cache of v2 favorites: { [id]: { ts:number, note?:string } } */
let _cache = null;

/** Fire-and-forget event when favorites change (so Feed can refresh) */
function emitFavsChanged() {
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('favorites:changed'));
        }
    } catch { }
}

/** Safe JSON.parse */
function parseJSON(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}

/** Read v2 map from localStorage (and memoize) */
function readV2() {
    if (!hasLocal) return {};
    if (_cache) return _cache;
    const raw = window.localStorage.getItem(FAV_KEY_V2);
    const obj = parseJSON(raw, {});
    // validate shape defensively
    if (!obj || typeof obj !== 'object') {
        _cache = {};
        return _cache;
    }
    for (const k of Object.keys(obj)) {
        const rec = obj[k];
        if (!rec || typeof rec.ts !== 'number') {
            // If malformed, drop entry
            delete obj[k];
        }
    }
    _cache = obj;
    return _cache;
}

/** Write v2 map to localStorage (and cache) */
function writeV2(obj) {
    if (!hasLocal) return;
    _cache = obj || {};
    try {
        window.localStorage.setItem(FAV_KEY_V2, JSON.stringify(_cache));
    } catch { }
    emitFavsChanged();
}

/** Public: record-aware loader */
export function loadFavRecords() {
    const obj = readV2();
    // Return a Map for convenient iteration/sorting
    return new Map(Object.entries(obj));
}

/** Public: record-aware saver (overwrites all) */
export function saveFavRecords(map) {
    const next = {};
    for (const [id, rec] of map.entries()) {
        if (!id) continue;
        const ts = typeof rec?.ts === 'number' ? rec.ts : Date.now();
        const note = typeof rec?.note === 'string' ? rec.note : undefined;
        next[id] = note ? { ts, note } : { ts };
    }
    writeV2(next);
}

/** Public: add/remove/toggle helpers */
export function addFavorite(id, ts) {
    if (!id) return;
    const obj = { ...readV2() };
    if (!obj[id]) obj[id] = { ts: typeof ts === 'number' ? ts : Date.now() };
    writeV2(obj);
}
export function removeFavorite(id) {
    if (!id) return;
    const obj = { ...readV2() };
    if (obj[id]) { delete obj[id]; writeV2(obj); }
}
export function toggleFavorite(id) {
    if (!id) return;
    const obj = { ...readV2() };
    if (obj[id]) { delete obj[id]; }
    else { obj[id] = { ts: Date.now() }; }
    writeV2(obj);
}

/** ---------- Back-compat shims so existing components keep working ---------- */

/**
 * loadFavs(): returns Set<string> of IDs
 * (Derived from v2 records. No legacy v1 needed since you have no data yet.)
 */
export function loadFavs() {
    return new Set(Object.keys(readV2()));
}

/**
 * saveFavs(nextSet): interprets `nextSet` as the desired final ID set.
 * - Adds new IDs with ts = now
 * - Removes missing IDs
 */
export function saveFavs(nextSet) {
    const want = new Set(nextSet || []);
    const obj = { ...readV2() };
    // Remove missing
    for (const id of Object.keys(obj)) {
        if (!want.has(id)) delete obj[id];
    }
    // Add new
    for (const id of want) {
        if (!obj[id]) obj[id] = { ts: Date.now() };
    }
    writeV2(obj);
}

/** ---------- CSV helpers ---------- */

/** Export favorites to CSV string with header: id,timestamp */
export function exportFavoritesCSV() {
    const rows = [['id', 'timestamp']]; // ISO8601 for readability/interop
    for (const [id, rec] of loadFavRecords().entries()) {
        const iso = new Date(rec.ts || Date.now()).toISOString();
        rows.push([id, iso]);
    }
    // minimal CSV encoder (handles commas/quotes/newlines)
    const esc = (s) => {
        const t = String(s ?? '');
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    return csv;
}

/**
 * Import favorites from CSV text.
 * - Merge policy: UNION (never removes)
 * - Timestamp policy: keep EARLIEST (first time favorited)
 * - Returns { added, alreadyHad, invalid }
 */
export function importFavoritesCSV(csvText) {
    let added = 0, alreadyHad = 0, invalid = 0;
    if (typeof csvText !== 'string' || !csvText.trim()) {
        return { added, alreadyHad, invalid };
    }

    // simple CSV parser that handles quoted fields and commas/newlines
    function parseCSV(text) {
        const out = [];
        let i = 0, field = '', row = [], inQuotes = false;
        while (i < text.length) {
            const ch = text[i++];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i] === '"') { field += '"'; i++; } // escaped quote
                    else { inQuotes = false; }
                } else { field += ch; }
            } else {
                if (ch === '"') inQuotes = true;
                else if (ch === ',') { row.push(field); field = ''; }
                else if (ch === '\n' || ch === '\r') {
                    // handle CRLF/CR/LF
                    if (ch === '\r' && text[i] === '\n') i++;
                    row.push(field); field = '';
                    if (row.length > 1 || row[0] !== '') out.push(row);
                    row = [];
                } else { field += ch; }
            }
        }
        if (field.length || row.length) { row.push(field); out.push(row); }
        return out;
    }

    const rows = parseCSV(csvText).filter(r => r.length > 0);
    if (!rows.length) return { added, alreadyHad, invalid };

    // header detection
    const header = rows[0].map(s => String(s || '').trim().toLowerCase());
    let startIdx = 0;
    let idIdx = 0, tsIdx = 1;
    if (header.includes('id')) {
        idIdx = header.indexOf('id');
        tsIdx = header.indexOf('timestamp'); // may be -1
        startIdx = 1;
    }

    const obj = { ...readV2() };
    for (let r = startIdx; r < rows.length; r++) {
        const row = rows[r];
        const id = String(row[idIdx] || '').trim();
        if (!id) { invalid++; continue; }
        let ts = Date.now();
        if (tsIdx >= 0 && row[tsIdx]) {
            const d = new Date(String(row[tsIdx]).trim());
            if (!isNaN(d.getTime())) ts = d.getTime();
        }
        if (!obj[id]) { obj[id] = { ts }; added++; }
        else {
            // keep earliest timestamp
            if (typeof obj[id].ts !== 'number' || ts < obj[id].ts) {
                obj[id].ts = ts;
            }
            alreadyHad++;
        }
    }
    writeV2(obj);
    return { added, alreadyHad, invalid };
}

/** ---------- Viewed with TTL (v2) ---------- */
const VIEWED_KEY = "sr_viewed_v2"; // { v:2, byId: { [id]: ts } }
const VIEWED_TTL_DAYS_DEFAULT = 14;

function nowTs() { return Date.now(); }
function daysToMs(d) { return d * 24 * 60 * 60 * 1000; }

function readViewedRaw() {
    try {
        const raw = localStorage.getItem(VIEWED_KEY);
        if (!raw) return { v: 2, byId: {} };
        const obj = JSON.parse(raw);
        if (obj && obj.v === 2 && obj.byId && typeof obj.byId === "object") return obj;
    } catch { }
    // migrate from old set-like storage if it exists
    try {
        const legacy = localStorage.getItem("sr_viewed") || localStorage.getItem("viewedPosts");
        if (legacy) {
            const arr = JSON.parse(legacy);
            if (Array.isArray(arr)) {
                const byId = Object.fromEntries(arr.map((id) => [id, nowTs()]));
                const obj = { v: 2, byId };
                localStorage.setItem(VIEWED_KEY, JSON.stringify(obj));
                return obj;
            }
        }
    } catch { }
    return { v: 2, byId: {} };
}

function writeViewedRaw(obj) {
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify(obj)); } catch { }
}

export function markViewed(id) {
    if (!id) return;
    const obj = readViewedRaw();
    obj.byId[id] = nowTs();
    writeViewedRaw(obj);
}

/**
 * Returns a Set of *currently valid* viewed ids, after pruning expired ones.
 * Also persists the pruned map.
 */
export function getViewedSet({ ttlDays = VIEWED_TTL_DAYS_DEFAULT } = {}) {
    const ttlMs = daysToMs(ttlDays);
    const obj = readViewedRaw();
    const out = new Set();
    const byId = obj.byId || {};
    const now = nowTs();
    let mutated = false;
    for (const [id, ts] of Object.entries(byId)) {
        if (typeof ts !== "number" || now - ts > ttlMs) {
            delete byId[id];
            mutated = true;
        } else {
            out.add(id);
        }
    }
    if (mutated) writeViewedRaw({ v: 2, byId });
    return out;
}

export function clearViewed() {
    try { localStorage.removeItem(VIEWED_KEY); } catch { }
}

/** ---------- Auth (unchanged) ---------- */
export function isAuthed() {
    if (!hasSession) return false;
    try { return window.sessionStorage.getItem('authed') === '1'; } catch { return false; }
}

// expose for inline scripts on GitHub Pages
if (typeof window !== "undefined") {
    window.SR = window.SR || {};
    window.SR.exportFavoritesCSV = exportFavoritesCSV;
    window.SR.importFavoritesCSV = importFavoritesCSV;
}
