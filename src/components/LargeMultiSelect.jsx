import React, { useEffect, useMemo, useState } from "react";
import { BASE } from "../lib/base";

export default function LargeMultiSelect({ label, value = [], onChange, loadPath }) {
    const [open, setOpen] = useState(false);
    const [all, setAll] = useState(null); // [{name, count?}]
    const [q, setQ] = useState("");
    const [sort, setSort] = useState("freq"); // 'freq' | 'az'
    const rowH = 40, viewH = 360;

    // Lazy-load the full list when user opens this picker
    useEffect(() => {
        if (open && !all) {
            fetch(`${BASE}${loadPath}`)
                .then(r => r.json())
                .then(setAll)
                .catch(() => setAll([]));
        }
    }, [open, all]);

    const items = useMemo(() => {
        let xs = all || [];
        if (q) {
            const term = q.toLowerCase();
            xs = xs.filter(x => x.name.toLowerCase().includes(term));
        }
        if (sort === "az") xs = xs.slice().sort((a, b) => a.name.localeCompare(b.name));
        // else assume pre-sorted by frequency in the JSON file
        return xs;
    }, [all, q, sort]);

    // windowing
    const [scrollTop, setScrollTop] = useState(0);
    const start = Math.max(0, Math.floor(scrollTop / rowH) - 4);
    const end = Math.min(items.length, start + Math.ceil(viewH / rowH) + 8);
    const before = start * rowH, after = Math.max(0, (items.length - end) * rowH);

    const toggle = (name) => {
        const set = new Set(value);
        set.has(name) ? set.delete(name) : set.add(name);
        onChange(Array.from(set).sort());
    };

    return (
        <div className="lms">
            <div className="label">{label}</div>
            <button type="button" className="picker" onClick={() => setOpen(true)}>
                {value.length ? `${value.length} selected` : "Browse all…"}
            </button>

            {open && <div className="lms-backdrop" onClick={() => setOpen(false)} />}

            {open && (
                <div className="lms-modal" role="dialog" aria-modal="true" aria-label={label}>
                    <div className="lms-head">
                        <strong>{label}</strong>
                        <div className="lms-spacer" />
                        <button className="pill" onClick={() => setSort(sort === "freq" ? "az" : "freq")}
                            title={sort === "freq" ? "Sort A→Z" : "Sort by frequency"}>
                            {sort === "freq" ? "A→Z" : "Freq"}
                        </button>
                        <button className="pill" onClick={() => setOpen(false)}>Done</button>
                    </div>

                    {!!value.length && (
                        <div className="lms-selected">
                            {value.map(v => (
                                <button key={v} className="tag" onClick={() => toggle(v)} title="Remove">{v} ✕</button>
                            ))}
                        </div>
                    )}

                    <input
                        className="lms-search"
                        placeholder={`Search ${label.toLowerCase()}…`}
                        value={q} onChange={e => setQ(e.target.value)}
                    />

                    <div
                        className="lms-list"
                        style={{ height: viewH, overflowY: "auto" }}
                        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                    >
                        <div style={{ height: before }} />
                        {items.slice(start, end).map(x => (
                            <label key={x.name} className="lms-row" style={{ height: rowH }}>
                                <input type="checkbox" checked={value.includes(x.name)} onChange={() => toggle(x.name)} />
                                <span className="name">{x.name}</span>
                                {typeof x.count === "number" && <span className="count">{x.count}</span>}
                            </label>
                        ))}
                        <div style={{ height: after }} />
                    </div>
                </div>
            )}

            <style>{`
        .picker { background:#2a2b2c; border:1px solid #343536; color:#d7dadc; border-radius:6px; padding:6px 10px; cursor:pointer; }
        .lms-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:70; }
        .lms-modal { position:fixed; top:8vh; left:50%; transform:translateX(-50%);
          width:min(92vw, 560px); max-height:84vh; background:#1a1a1b; border:1px solid #343536; border-radius:8px; padding:12px;
          display:flex; flex-direction:column; gap:8px; z-index:71; }
        .lms-head { display:flex; align-items:center; gap:8px; }
        .lms-spacer { flex:1; }
        .pill { background:#2a2b2c; border:1px solid #343536; color:#d7dadc; border-radius:999px; padding:4px 10px; cursor:pointer; font-size:12px; }
        .lms-selected { display:flex; flex-wrap:wrap; gap:6px; }
        .tag { background:#3b3c3d; border:1px solid #4a4c4f; color:#d7dadc; border-radius:999px; padding:2px 8px; font-size:12px; cursor:pointer; }
        .lms-search { width:100%; background:#0f1a1c; color:#d7dadc; border:1px solid #343536; border-radius:6px; padding:8px; }
        .lms-list { border:1px solid #343536; border-radius:6px; background:#0f1a1c; }
        .lms-row { display:flex; align-items:center; gap:8px; padding:0 10px; border-bottom:1px solid rgba(255,255,255,.05); }
        .name { flex:1; }
        .count { color:#818384; font-size:12px; }
        @media (max-width: 900px) {
          .lms-modal { top:0; bottom:0; left:auto; right:0; transform:none; width:min(92vw, 420px); max-height:100dvh; border-left:1px solid #343536; border-radius:0; }
        }
      `}</style>
        </div>
    );
}
