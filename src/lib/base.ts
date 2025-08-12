export const BASE: string = import.meta.env.BASE_URL || '/';

export function asset(p?: string) {
  if (!p) return '';
  return /^https?:\/\//i.test(p) ? p : `${BASE}${p.replace(/^\/+/, '')}`;
}
