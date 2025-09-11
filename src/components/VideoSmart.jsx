// src/components/VideoSmart.jsx
// Smart video component: autoplay/pause based on visibility, one-at-a-time per group
import React, { useEffect, useRef, useState } from "react";

/**
 * Smart video for feed cards.
 * - Autoplay (muted) only when sufficiently in-view
 * - Pause when out of view or tab hidden
 * - Optional "only one plays per group" behavior
 */
export default function VideoSmart({
    src,
    poster,
    loop = true,
    muted = true,
    playsInline = true,
    controls = false,         // NEW: allow controls (for non-GIF)
    group = "feed",
    isGif = false,
    className = "",
    videoClassName = "",      // NEW: apply class to <video>
    style,
}) {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);

    // Pause others when this one starts (one-at-a-time per group)
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const onPlay = () => {
            window.dispatchEvent(new CustomEvent("videosmart:playing", { detail: { group, who: el } }));
        };
        el.addEventListener("play", onPlay);
        const onSomeoneElse = (e) => {
            const { group: g, who } = e.detail || {};
            if (g === group && who !== el && !el.paused) {
                el.pause();
            }
        };
        window.addEventListener("videosmart:playing", onSomeoneElse);
        return () => {
            el.removeEventListener("play", onPlay);
            window.removeEventListener("videosmart:playing", onSomeoneElse);
        };
    }, [group]);

    // Play/pause based on viewport
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // be lazy with network/decoding
        el.preload = "none";
        el.muted = muted;
        el.playsInline = playsInline;
        el.loop = loop;

        let obs = null;
        const onVisible = (entries) => {
            const vis = entries.some((en) => en.isIntersecting && en.intersectionRatio >= 0.5);
            setInView(vis);
        };
        obs = new IntersectionObserver(onVisible, { threshold: [0, 0.5, 1], rootMargin: "200px 0px" });
        obs.observe(el);

        const onVisibility = () => {
            if (document.hidden && !el.paused) el.pause();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            if (obs) obs.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [muted, playsInline, loop]);

    // Apply play/pause when inView changes
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const tryPlay = async () => {
            try {
                if (el.readyState < 2) {
                    await el.play().catch(() => { }); // let browser decide
                } else {
                    await el.play().catch(() => { });
                }
            } catch { }
        };

        if (inView) {
            // for gif-proxy loops, start from beginning to feel like a GIF
            if (isGif) el.currentTime = 0;
            tryPlay();
        } else {
            if (!el.paused) el.pause();
            // Optional: reset currentTime for gifs to avoid CPU
            if (isGif) el.currentTime = 0;
        }
    }, [inView, isGif]);

    return (
        <div className={`video-smart ${className}`} style={style}>
            <video
                ref={ref}
                src={src}
                poster={poster || undefined}
                muted={muted}
                playsInline={playsInline}
                controls={controls}
                loop={loop}
                preload="none"
                tabIndex={-1}
                className={videoClassName}
            />
            <span className="vs-badge">muted</span>
        </div>
    );
}
