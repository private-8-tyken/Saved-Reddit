// src/components/MobileDrawer.jsx
import React, { useEffect, useRef, useCallback } from "react";

export default function MobileDrawer({ open, onClose, children }) {
    // Focus the panel for a11y when it opens
    const panelRef = useRef(null);
    useEffect(() => { if (open) panelRef.current?.focus(); }, [open]);

    // Lock body scroll while open
    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";
        return () => (document.body.style.overflow = "");
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // --- Swipe to close (rightward swipe > threshold) ---
    const start = useRef({ x: null, y: null });
    const tracking = useRef(false);

    const startTrack = useCallback((x, y) => {
        start.current = { x, y };
        tracking.current = true;
    }, []);

    const moveTrack = useCallback(
        (x, y) => {
            if (!tracking.current || start.current.x == null) return;
            const dx = x - start.current.x;
            const dy = y - start.current.y;

            // ignore vertical scroll or tiny jitters
            if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) return;

            const threshold = Math.max(40, Math.min(140, window.innerWidth * 0.18));
            if (dx > threshold) {
                tracking.current = false;
                onClose();
            }
        },
        [onClose]
    );

    const endTrack = useCallback(() => {
        tracking.current = false;
        start.current = { x: null, y: null };
    }, []);

    // Touch events
    const onTouchStart = (e) =>
        startTrack(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e) =>
        moveTrack(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchEnd = endTrack;

    // Optional: mouse “swipe” support
    const onPointerDown = (e) =>
        e.pointerType === "mouse" && startTrack(e.clientX, e.clientY);
    const onPointerMove = (e) =>
        e.pointerType === "mouse" && moveTrack(e.clientX, e.clientY);
    const onPointerUp = (e) => e.pointerType === "mouse" && endTrack();

    return (
        <>
            <div
                className="mdrawer-backdrop"
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,.5)",
                    opacity: open ? 1 : 0,
                    pointerEvents: open ? "auto" : "none",
                    transition: "opacity .15s ease",
                    zIndex: 50,
                }}
                onClick={onClose}
            />
            <aside
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Filters"
                className="mdrawer"
                style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    height: "100dvh",
                    width: "min(92vw, 420px)",
                    borderLeft: "1px solid #343536",
                    transform: open ? "translateX(0)" : "translateX(100%)",
                    transition: "transform .2s ease",
                    zIndex: 51,
                    padding: 12,
                    overflowY: "auto",
                    background: "rgba(26, 26, 27, 0.5)",
                    touchAction: "pan-y", // keep vertical scroll smooth
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Grab handle hint (subtle) */}
                <div
                    aria-hidden
                    style={{
                        position: "absolute",
                        left: 6,
                        top: "40%",
                        width: 6,
                        height: 46,
                        borderRadius: 999,
                        background: "rgba(215,218,220,.55)",
                        boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
                    }}
                />

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: 16 }}>Filters</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: "#2a2b2c",
                            border: "1px solid #343536",
                            color: "#d7dadc",
                            borderRadius: 6,
                            padding: "6px 10px",
                            cursor: "pointer",
                        }}
                    >
                        Close
                    </button>
                </div>

                {children}
            </aside>
        </>
    );
}
