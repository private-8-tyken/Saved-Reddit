// src/utils/text.js
// utility functions for text processing

// create a plain-text excerpt from a markdown string
export function excerpt(raw = "", max = 200) {
    if (!raw) return "";
    // super-light cleanup: strip basic markdown and squish spaces
    const txt = String(raw)
        .replace(/[*_~`>#-]+/g, " ")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1") // [label](url) -> label
        .replace(/\s+/g, " ")
        .trim();
    if (txt.length <= max) return txt;
    // cut on word boundary
    const slice = txt.slice(0, max);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > 60 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

export function getDomain(url = "") {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
