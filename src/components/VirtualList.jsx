// src/components/VirtualList.jsx
// A virtualized list component for efficiently rendering large lists.
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * items: any[]
 * itemHeight: number (px)
 * height: number (px)
 * overscan: number (rows)
 * renderItem: (item, idx) => JSX
 */
export default function VirtualList({
    items = [],
    itemHeight = 34,
    height = 420,
    overscan = 6,
    renderItem,
    className = "",
}) {
    const scrollerRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);

    const { start, end, padTop, padBottom } = useMemo(() => {
        const total = items.length;
        const first = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const visible = Math.ceil(height / itemHeight) + overscan * 2;
        const last = Math.min(total, first + visible);
        return {
            start: first,
            end: last,
            padTop: first * itemHeight,
            padBottom: (total - last) * itemHeight,
        };
    }, [items.length, scrollTop, itemHeight, height, overscan]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const onScroll = () => setScrollTop(el.scrollTop);
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div
            ref={scrollerRef}
            className={className}
            style={{ height, overflow: "auto" }}
            role="listbox"
        >
            <div style={{ height: padTop }} aria-hidden="true" />
            {items.slice(start, end).map((it, i) => (
                <div key={start + i} style={{ height: itemHeight, display: "flex", alignItems: "center" }}>
                    {renderItem(it, start + i)}
                </div>
            ))}
            <div style={{ height: padBottom }} aria-hidden="true" />
        </div>
    );
}
