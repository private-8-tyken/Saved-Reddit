// src/utils/storage.js
// Utilities for loading/saving favorites and checking auth status
export const favKey = 'favorites';
const hasWindow = typeof window !== 'undefined';
const hasLocal = hasWindow && typeof window.localStorage !== 'undefined';
const hasSession = hasWindow && typeof window.sessionStorage !== 'undefined';

export function loadFavs() {
    if (!hasLocal) return new Set();               // SSR-safe fallback
    try { return new Set(JSON.parse(localStorage.getItem(favKey) || '[]')); } catch { return new Set(); }
}
export function saveFavs(set) {
    if (!hasLocal) return;                         // SSR no-op
    try { localStorage.setItem(favKey, JSON.stringify(Array.from(set))); } catch { }
}
export function isAuthed() {
    if (!hasSession) return false;                 // SSR-safe fallback
    try { return sessionStorage.getItem('authed') === '1'; } catch { return false; }
}