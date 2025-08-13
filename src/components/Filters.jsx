// src/components/Filters.jsx
import "../styles/Filters.css";
import React from "react";
import LargeMultiSelect from "./LargeMultiSelect.jsx";

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
                    <button
                        key={v}
                        className={`chip ${query[key]?.includes(v) ? 'on' : ''}`}
                        onClick={() => mkToggle(key, v)}
                        type="button"
                    >
                        {v}
                    </button>
                ))}
            </div>
        </div>
    );

    // Toggle the _asc/_desc suffix on the current sort key
    const toggleSortDir = () => {
        const cur = query.sort || 'created_desc';
        const next = cur.endsWith('_desc')
            ? cur.replace(/_desc$/, '_asc')
            : cur.endsWith('_asc')
                ? cur.replace(/_asc$/, '_desc')
                // if somehow no suffix, default to _desc
                : `${cur}_desc`;
        onChange({ ...query, sort: next, page: 1 });
    };

    // Small helper for setting sort while trying to preserve current direction
    const setSortField = (field) => {
        const dir = (query.sort || '').endsWith('_asc') ? 'asc' : 'desc';
        onChange({ ...query, sort: `${field}_${dir}`, page: 1 });
    };

    // Small helper to flip the suffix
    const flipSortDir = () => {
        const s = query.sort || 'created_desc';
        if (!/_asc$|_desc$/.test(s)) return; // only flip if it has a dir
        const next = s.endsWith('_desc') ? s.replace('_desc', '_asc') : s.replace('_asc', '_desc');
        onChange({ ...query, sort: next, page: 1 });
    };


    // Derive icon from suffix
    const isDesc = (query.sort || '').endsWith('_desc');

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
                    <div className="sort-row">
                        <select
                            value={query.sort}
                            onChange={e => onChange({ ...query, sort: e.target.value, page: 1 })}
                        >
                            <option value="created_desc">Created date</option>
                            <option value="score_desc">Score</option>
                            <option value="comments_desc">Comments</option>
                            <option value="title_asc">Title</option>
                        </select>
                        <button
                            type="button"
                            className="dir"
                            onClick={flipSortDir}
                            title={query.sort?.endsWith('_desc') ? 'Descending' : 'Ascending'}
                        >
                            {query.sort?.endsWith('_desc') ? '↓' : '↑'}
                        </button>
                    </div>
                </label>
            </div>

            {mkMulti('Media', 'media', facets.mediaTypes || [])}
            {mkMulti('Domain', 'domain', facets.domains || [])}

            <LargeMultiSelect
                label="Subreddit"
                value={query.sub}
                onChange={(vals) => onChange({ ...query, sub: vals, page: 1 })}
                loadPath="data/indexes/subs-all.json"
            />
            <LargeMultiSelect
                label="Author"
                value={query.author}
                onChange={(vals) => onChange({ ...query, author: vals, page: 1 })}
                loadPath="data/indexes/authors-all.json"
            />

            {mkMulti('Flair', 'flair', facets.flairs || [])}

            <div className="row actions">
                <button
                    type="button"
                    onClick={() => onChange({
                        q: '', sub: [], author: [], flair: [], domain: [], media: [],
                        from: '', to: '', sort: 'created_desc', page: 1,
                    })}
                >
                    Clear all
                </button>
            </div>
        </aside>
    );
}
