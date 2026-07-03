import path from 'path';

// ============ Path Constants ============
// These MUST live in a separate file (not index.ts) to avoid circular
// dependency issues: index.ts imports the route modules, and route modules
// import these constants. If they were in index.ts, the const values would
// not yet be initialised when route modules are required.

// Project root: two levels up from src/routes/ (or dist/routes/)
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Resolved paths with env var overrides
// Sibling projects live two levels above PROJECT_ROOT (server):
//   server → onerich → git/<sibling>
export const STOCK_PRICE_DIR = process.env.STOCK_PRICE_DIR
  || path.resolve(PROJECT_ROOT, '..', '..', 'stock_price');

export const VTRACK_DIR = process.env.VTRACK_DIR
  || path.resolve(PROJECT_ROOT, '..', '..', 'v_track');

export const KLINE_DIR = process.env.KLINE_DIR
  || path.resolve(PROJECT_ROOT, '..', '..', 'kline');

export const ONERICH_DIR = process.env.ONERICH_DIR
  || path.resolve(PROJECT_ROOT, '..', '..', 'onerich');

// ============ Date/Time Helpers (Beijing time) ============

export function bjNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

export function bjDateString(): string {
  const d = bjNow();
  return d.toISOString().slice(0, 10);
}

export function bjTimeString(): string {
  const d = bjNow();
  return d.toISOString().slice(11, 16);
}

// ============ Misc Helpers ============

export function safeParseStrArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
