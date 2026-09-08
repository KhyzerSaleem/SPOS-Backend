const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function clampPage(page?: number): number {
  const n = Number(page);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PAGE;
}

export function clampLimit(limit?: number, fallback = DEFAULT_LIMIT): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_LIMIT, Math.floor(n));
}
