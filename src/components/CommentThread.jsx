// src/components/CommentThread.jsx
// Comment thread component: displays nested comments with collapse/expand functionality
import React, { useState } from "react";

function Comment({ c, depth = 0 }) {
    const [open, setOpen] = useState(true);
    return (
        <div style={{ marginLeft: depth ? 12 : 0, borderLeft: depth ? '1px solid var(--border)' : 'none', paddingLeft: depth ? 10 : 0, marginTop: 8 }}>
            <div className="meta">
                {(c.author || '[deleted]')} • {c.score ?? 0} pts
                <button className="button" style={{ marginLeft: 8, padding: '4px 8px' }} onClick={() => setOpen(o => !o)}>{open ? 'Collapse' : 'Expand'}</button>
            </div>
            {open && <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{c.body}</div>}
            {open && Array.isArray(c.replies) && c.replies.map(r => (
                <Comment key={r.id} c={r} depth={depth + 1} />
            ))}
        </div>
    );
}

export default function CommentThread({ comments }) {
    if (!comments || !comments.length) {
        return <div className="meta">No comments.</div>;
    }
    return (
        <div>
            {comments.map(c => <Comment key={c.id} c={c} />)}
        </div>
    );
}
