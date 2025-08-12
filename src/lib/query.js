// src/lib/query.js
const MULTI_KEYS = new Set(['sub', 'author', 'flair', 'domain', 'media']);
const VALID_SORT = new Set(['created_desc', 'score_desc', 'comments_desc', 'title_asc']);

export const DEFAULT_QUERY = {
    q: '',
    sub: [], author: [], flair: [], domain: [], media: [],
    from: '', to: '', sort: 'created_desc', page: 1,
};

export function parseQuery(search = globalThis.location?.search || '') {
    const out = { ...DEFAULT_QUERY };
    const sp = new URLSearchParams(search);
    for (const [k, v] of sp.entries()) {
        if (MULTI_KEYS.has(k)) out[k] = v ? v.split(',').filter(Boolean) : [];
        else if (k === 'page') out.page = Math.max(1, parseInt(v || '1', 10));
        else out[k] = v || '';
    }
    if (!VALID_SORT.has(out.sort)) out.sort = 'created_desc';
    return out;
}

export function toQueryString(q) {
    const sp = new URLSearchParams();
    if (q.q) sp.set('q', q.q);
    for (const k of MULTI_KEYS) {
        if (q[k]?.length) sp.set(k, q[k].join(','));
    }
    if (q.from) sp.set('from', q.from);
    if (q.to) sp.set('to', q.to);
    if (q.sort && q.sort !== 'created_desc') sp.set('sort', q.sort);
    if (q.page && q.page !== 1) sp.set('page', String(q.page));
    const s = sp.toString();
    return s ? `?${s}` : '';
}

export function pushQuery(q, replace = false) {
    const qs = toQueryString(q);
    const url = `${location.pathname}${qs}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
}
