// src/components/Skeleton.jsx
// Simple skeleton/loading placeholder components
import React from "react";
export function Skeleton({ h = 16, w = '100%', style = {} }) {
    return (
        <div
            className="skeleton"
            style={{ height: h, width: w, ...style }}
            aria-hidden="true"
        />
    );
}

export function SkeletonCard() {
    return (
        <div className="card" style={{ marginBottom: 12 }} aria-busy="true">
            <Skeleton h={180} style={{ marginBottom: 8 }} />
            <Skeleton h={18} w="80%" style={{ margin: '6px 0' }} />
            <Skeleton h={14} w="40%" />
        </div>
    );
}

export function PostSkeleton() {
    return (
        <div className="container">
            <div className="card" style={{ marginBottom: 12 }} aria-busy="true">
                <Skeleton h={28} w="70%" style={{ margin: '6px 0' }} />
                <Skeleton h={14} w="40%" style={{ marginBottom: 8 }} />
                <Skeleton h={220} />
            </div>
        </div>
    );
}
