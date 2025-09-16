// src/utils/sorting.js
// export function makeComparator(sortKey, dir = 'asc') { ... }
// Various comparators for sorting posts
const INF = 1e15;

export function bySavedAsc(a, b) {
    const ai = a.saved_index ?? INF;
    const bi = b.saved_index ?? INF;
    if (ai !== bi) return ai - bi;
    // tie-breaker: newer created first
    return (b.created_utc ?? 0) - (a.created_utc ?? 0);
}

export function makeComparator(sortKey, dir = 'asc') {
    const mul = dir === 'desc' ? -1 : 1;
    switch (sortKey) {
        case 'saved': return (a, b) => mul * bySavedAsc(b, a);
        case 'created': return (a, b) => mul * ((a.created_utc ?? 0) - (b.created_utc ?? 0));
        case 'score': return (a, b) => mul * ((a.score ?? -INF) - (b.score ?? -INF));
        case 'comments': return (a, b) => mul * ((a.num_comments ?? -INF) - (b.num_comments ?? -INF));
        case 'title': return (a, b) => mul * (String(a.title).localeCompare(String(b.title)));
        case 'subreddit': return (a, b) => mul * (String(a.subreddit).localeCompare(String(b.subreddit)));
        case 'author': return (a, b) => mul * (String(a.author).localeCompare(String(b.author)));
        case 'domain': return (a, b) => mul * (String(a.link_domain || '').localeCompare(String(b.link_domain || '')));
        case 'flair': return (a, b) => mul * (String(a.flair || '').localeCompare(String(b.flair || '')));
        default: return (a, b) => mul * bySavedAsc(a, b);
    }
}
