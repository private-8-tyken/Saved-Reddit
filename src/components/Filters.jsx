// src/components/Filters.jsx
import React from "react";

export default function Filters({ facets, query, onChange }) {
    const mkToggle = (key, val) => {
        const cur = new Set(query[key] || []);
        if (cur.has(val)) cur.delete(val); else cur.add(val);
        onChange({ ...query, [key]: Array.from(cur).sort(), page: 1 });
    };

    const mkMulti = (label, key, values) => (
        <div className="block">
            <div className="label">{label}</div>
            <div className="chips">
                {values.map(v => (
                    <button key={v}
                        className={`chip ${query[key]?.includes(v) ? 'on' : ''}`}
                        onClick={() => mkToggle(key, v)} type="button">
                        {v}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <aside className="filters">
            <div className="row">
                <input
                    className="search"
                    type="search"
                    placeholder="Search title & text…"
                    value={query.q || ''}
                    onChange={e => onChange({ ...query, q: e.target.value, page: 1 })}
                />
            </div>

            {mkMulti('Subreddit', 'sub', facets.subreddits || [])}
            {mkMulti('Author', 'author', facets.authors || [])}
            {mkMulti('Flair', 'flair', facets.flairs || [])}
            {mkMulti('Domain', 'domain', facets.domains || [])}
            {mkMulti('Media', 'media', facets.mediaTypes || [])}

            <div className="row two">
                <label>From
                    <input type="date" value={query.from || ''} onChange={e => onChange({ ...query, from: e.target.value, page: 1 })} />
                </label>
                <label>To
                    <input type="date" value={query.to || ''} onChange={e => onChange({ ...query, to: e.target.value, page: 1 })} />
                </label>
            </div>

            <div className="row">
                <label>Sort
                    <select value={query.sort} onChange={e => onChange({ ...query, sort: e.target.value })}>
                        <option value="created_desc">Newest</option>
                        <option value="score_desc">Top score</option>
                        <option value="comments_desc">Most comments</option>
                        <option value="title_asc">Title A→Z</option>
                    </select>
                </label>
            </div>

            <div className="row actions">
                <button type="button" onClick={() => onChange({
                    q: '', sub: [], author: [], flair: [], domain: [], media: [],
                    from: '', to: '', sort: 'created_desc', page: 1,
                })}>Clear all</button>
            </div>

            <style>{`
        .filters { border:1px solid rgba(255,255,255,.12); background:#1a1a1b; border-radius:8px; padding:12px; color:#d7dadc; }
        .label { font-size:12px; color:#9aa0a6; margin:6px 0; }
        .row { margin: 8px 0; }
        .row.two { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
        .search, input[type="date"], select { width:100%; background:#0f1a1c; color:#d7dadc; border:1px solid #343536; border-radius:6px; padding:8px; }
        .chips { display:flex; flex-wrap:wrap; gap:6px; }
        .chip { background:#2a2b2c; border:1px solid #343536; color:#d7dadc; border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; }
        .chip.on { background:#3b3c3d; border-color:#4a4c4f; }
        .actions button { background:#2a2b2c; border:1px solid #343536; border-radius:6px; padding:6px 10px; color:#d7dadc; cursor:pointer; }
      `}</style>
        </aside>
    );
}
