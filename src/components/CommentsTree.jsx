// src/components/CommentsTree.jsx
import React, { useMemo, useState } from "react";

function fmt(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CommentNode({ c, depth = 0 }) {
    const [open, setOpen] = useState(true);
    const hasKids = (c.replies && c.replies.length > 0);

    return (
        <div className="comment" style={{ marginLeft: depth ? 12 : 0 }}>
            <div className="bar" aria-hidden />
            <div className="chead">
                <button className="toggle" onClick={() => setOpen(!open)} title={open ? "Collapse" : "Expand"}>
                    {open ? "▾" : "▸"}
                </button>
                <span className="author">u/{c.author || "unknown"}</span>
                {typeof c.score === "number" && <span className="score">▲ {c.score}</span>}
                {c.created_utc && <span className="date">{fmt(c.created_utc)}</span>}
            </div>

            {open && (
                <div className="cbody">
                    <div className="text">{c.body || ""}</div>
                    {hasKids && (
                        <div className="children">
                            {c.replies.map((r) => (
                                <CommentNode key={r.id} c={r} depth={depth + 1} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function CommentsTree({ comments }) {
    const flatCount = useMemo(() => {
        let n = 0;
        const walk = (xs) => xs?.forEach(y => { n++; walk(y.replies || []); });
        walk(comments || []);
        return n;
    }, [comments]);

    if (!comments || comments.length === 0) {
        return <div className="empty">No comments.</div>;
    }

    return (
        <div className="ctree">
            <div className="ctools">
                <span className="meta">{flatCount} comment{flatCount === 1 ? "" : "s"} loaded</span>
                {/* future: Collapse all / Expand all controls */}
            </div>

            {comments.map((c) => (
                <CommentNode key={c.id} c={c} />
            ))}

            <style>{`
        .ctools { display:flex; gap:12px; align-items:center; color:#818384; font-size:12px; margin: 8px 0; }
        .empty { color:#818384; font-size: 13px; }
        .comment { position: relative; padding-left: 10px; margin: 6px 0; }
        .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,.08); border-radius: 2px; }
        .chead { display:flex; align-items:center; gap:8px; color:#818384; font-size:12px; }
        .toggle { all: unset; cursor: pointer; color:#818384; }
        .toggle:hover { color:#d7dadc; }
        .author { color:#d7dadc; font-weight: 600; }
        .score, .date { color:#818384; }
        .cbody { margin: 4px 0 0; }
        .text { white-space: pre-wrap; font-size: 14px; line-height: 1.45; color:#c9d1d9; }
        .children { margin-top: 6px; }
      `}</style>
        </div>
    );
}
