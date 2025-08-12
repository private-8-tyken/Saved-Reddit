export const BASE: string = import.meta.env.BASE_URL || '/';

/**
 * Returns a full asset URL based on the base URL.
 * If the provided path is already a full URL, it returns it as is.
 * Otherwise, it prepends the base URL to the path.
 *
 * @param {string} [p] - The asset path or URL.
 * @returns {string} - The full asset URL.
 */
export function asset(p?: string) {
  if (!p) return '';
  return /^https?:\/\//i.test(p) ? p : `${BASE}${p.replace(/^\/+/, '')}`;
}
