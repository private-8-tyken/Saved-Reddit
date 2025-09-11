// src/components/CommentThread.jsx
// Comment thread component: displays nested comments with collapse/expand functionality
import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";

/**
 * Comment pagination & expansion
 * Props:
 *  - comments: Comment[]  (normalized: { id, author|null, body, score|null, replies: Comment[] })
 *  - initialLimit: number (top-level page size)
 *  - childLimit: number   (per-node replies page size)
 *  - depth: number        (internal use)
 */

export default function CommentThread({
    comments,
    initialLimit = 25,
    childLimit = 8,
    depth = 0,
}) {
    const [visibleTop, setVisibleTop] = useState(() =>
        Math.min(initialLimit, Array.isArray(comments) ? comments.length : 0)
    );

    const list = Array.isArray(comments) ? comments : [];
    const visible = list.slice(0, visibleTop);
    const remaining = list.length - visibleTop;

    const loadMoreTop = useCallback(() => {
        setVisibleTop((v) => Math.min(v + initialLimit, list.length));
    }, [initialLimit, list.length]);

    if (!list.length) {
        return depth === 0 ? <div className="ct-empty">No comments</div> : null;
    }

    return (
        <div className={`ct ${depth === 0 ? "ct-root" : ""}`}>
            {visible.map((c) => (
                <CommentNode key={c.id} node={c} depth={depth} childLimit={childLimit} />
            ))}
            {remaining > 0 && (
                <button className="ct-more" onClick={loadMoreTop}>
                    Show more comments ({remaining})
                </button>
            )}
        </div>
    );
}

function CommentNode({ node, depth, childLimit }) {
    const {
        id,
        author = null,
        body = "",
        score = null,
        replies = [],
    } = node || {};

    // per-node UI state
    const [collapsed, setCollapsed] = useState(false);
    const totalReplies = Array.isArray(replies) ? replies.length : 0;
    const [visibleReplies, setVisibleReplies] = useState(() =>
        Math.min(childLimit, totalReplies)
    );
    const remainingReplies = totalReplies - visibleReplies;

    const toggle = useCallback(() => setCollapsed((x) => !x), []);
    const loadMoreReplies = useCallback(() => {
        setVisibleReplies((v) => Math.min(v + childLimit, totalReplies));
    }, [childLimit, totalReplies]);

    // keep visibleReplies in range if replies count changes
    useEffect(() => {
        setVisibleReplies((v) => Math.min(Math.max(childLimit, v), totalReplies));
    }, [totalReplies, childLimit]);

    const authorLabel = author ?? "[deleted]";
    const scoreLabel =
        typeof score === "number" ? `${score} point${score === 1 ? "" : "s"}` : null;

    return (
        <div className={`ct-node depth-${depth}`}>
            <div className="ct-line" />
            <div className="ct-card">
                <div className="ct-meta">
                    <button
                        className="ct-collapse"
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? "Expand" : "Collapse"}
                        onClick={toggle}
                        title={collapsed ? "Expand" : "Collapse"}
                    >
                        {collapsed ? "➕" : "➖"}
                    </button>
                    <span className="ct-author">{authorLabel}</span>
                    {scoreLabel && <span className="ct-score"> · {scoreLabel}</span>}
                </div>
                {body && !collapsed && <div className="ct-body">{body}</div>}

                {!collapsed && totalReplies > 0 && (
                    <div className="ct-children">
                        <CommentThread
                            comments={replies.slice(0, visibleReplies)}
                            initialLimit={visibleReplies} // exact slice, no top-level paging inside
                            childLimit={childLimit}
                            depth={depth + 1}
                        />
                        {remainingReplies > 0 && (
                            <button className="ct-more" onClick={loadMoreReplies}>
                                Show more replies ({remainingReplies})
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}