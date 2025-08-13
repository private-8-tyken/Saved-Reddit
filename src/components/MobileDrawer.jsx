import React, { useEffect } from "react";

export default function MobileDrawer({ open, onClose, children }) {
    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";
        return () => (document.body.style.overflow = "");
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <>
            <div
                className="mdrawer-backdrop"
                style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
                    opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
                    transition: "opacity .15s ease", zIndex: 50
                }}
                onClick={onClose}
            />
            <aside
                className="mdrawer"
                style={{
                    position: "fixed", top: 0, right: 0, height: "100dvh",
                    width: "min(92vw, 420px)",
                    borderLeft: "1px solid #343536",
                    transform: open ? "translateX(0)" : "translateX(100%)",
                    transition: "transform .2s ease", zIndex: 51,
                    padding: 12, overflowY: "auto",
                    background: "rgba(26, 26, 27, 0.5)" // Background color for filter drawer
                }}
                role="dialog" aria-modal="true"
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Filters</h3>
                    <button type="button" onClick={onClose}
                        style={{ background: "#2a2b2c", border: "1px solid #343536", color: "#d7dadc", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                        Close
                    </button>
                </div>
                {children}
            </aside>
        </>
    );
}
