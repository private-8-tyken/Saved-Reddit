import type { ManifestItem } from './types';

export type Query = {
    q?: string;
    sub?: string[]; author?: string[]; flair?: string[]; domain?: string[];
    media?: string[]; nsfw?: 'show' | 'hide' | 'only'; spoiler?: 'show' | 'hide' | 'only';
    from?: string; to?: string; sort?: string; page?: number;
};

export const applyFilters = (items: ManifestItem[], q: Query) => {
    let out = items.slice();
    const within = (v?: string, xs?: string[]) => !xs?.length || (v && xs.includes(v));
    const flag = (b?: boolean, mode?: 'show' | 'hide' | 'only') =>
        !mode || mode === 'show' || (mode === 'hide' && !b) || (mode === 'only' && !!b);

    out = out.filter(p => within(p.subreddit, q.sub)
        && within(p.author, q.author)
        && within(p.flair, q.flair)
        && within(p.link_domain, q.domain)
        && (!q.media?.length || (p.mediaType && q.media.includes(p.mediaType)))
        && flag(p.over_18, q.nsfw)
        && flag(p.spoiler, q.spoiler)
    );

    if (q.from) out = out.filter(p => (p.created_utc ?? 0) >= Date.parse(q.from) / 1000);
    if (q.to) out = out.filter(p => (p.created_utc ?? 0) <= Date.parse(q.to) / 1000);

    switch (q.sort) {
        case 'score_desc': out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); break;
        case 'comments_desc': out.sort((a, b) => (b.num_comments ?? 0) - (a.num_comments ?? 0)); break;
        case 'title_asc': out.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
        case 'created_desc': default: out.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
    }
    return out;
};