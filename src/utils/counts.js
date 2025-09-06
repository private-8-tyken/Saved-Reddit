// src/utils/counts.js
// Utility functions for counting occurrences in arrays.
export function countBy(items, picker) {
    const map = new Map();
    for (const it of items || []) {
        const key = picker(it);
        if (key == null || key === "") continue;
        const k = String(key);
        map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
}
