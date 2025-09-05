// src/lib/applyFilters.js
export function applyFilters(items, q) {
    let out = items.slice();

    const inSet = (val, arr) => !arr?.length || (val && arr.includes(val));
    const toEpoch = (d) => (d ? Math.floor(new Date(d).getTime() / 1000) : null);

    // Facets
    out = out.filter(p =>
        inSet(p.subreddit, q.sub) &&
        inSet(p.author, q.author) &&
        inSet(p.flair, q.flair) &&
        inSet(p.link_domain, q.domain) &&
        inSet(p.media_type, q.media)
    );

    // Date range (created_utc)
    const fromTs = toEpoch(q.from), toTs = toEpoch(q.to);
    if (fromTs) out = out.filter(p => (p.created_utc ?? 0) >= fromTs);
    if (toTs) out = out.filter(p => (p.created_utc ?? 0) <= toTs);

    // Text search (phase 1)
    const term = (q.q || '').trim().toLowerCase();
    if (term) {
        out = out.filter(p =>
            (p.title || '').toLowerCase().includes(term) ||
            (p.selftext_preview || '').toLowerCase().includes(term)
        );
    }
    // Sort (supports both _desc and _asc for all fields)
    const sortKey = q.sort || 'saved_asc';
    switch (sortKey) {
        case 'saved_asc':
        default:
            out.sort((a, b) => (a.saved_utc ?? 0) - (b.saved_utc ?? 0));
            break;
        case 'saved_desc':
            out.sort((a, b) => (b.saved_utc ?? 0) - (a.saved_utc ?? 0));
            break;

        case 'created_asc':
            out.sort((a, b) => (a.created_utc ?? 0) - (b.created_utc ?? 0));
            break;
        case 'created_desc':
            out.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
            break;

        case 'score_desc':
            out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            break;
        case 'score_asc':
            out.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
            break;

        case 'comments_desc':
            out.sort((a, b) => (b.num_comments ?? 0) - (a.num_comments ?? 0));
            break;
        case 'comments_asc':
            out.sort((a, b) => (a.num_comments ?? 0) - (b.num_comments ?? 0));
            break;

        case 'title_asc':
            out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
        case 'title_desc':
            out.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
            break;
    }

    return out;
}
