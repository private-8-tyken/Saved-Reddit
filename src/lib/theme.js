// src/lib/theme.js
const KEY = 'theme'; // 'dark' | 'light' | 'system'
export function getPreferred() {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    return 'system';
}
export function applyTheme(next) {
    const mode = next === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : next;
    document.documentElement.dataset.theme = mode; // 'dark' or 'light'
    localStorage.setItem(KEY, next);
}
export function initTheme() {
    applyTheme(getPreferred());
    // react to system changes if user chose system
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem(KEY) === 'system') applyTheme('system');
    });
}
