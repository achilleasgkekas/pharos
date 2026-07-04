/**
 * Lightweight in-memory rate limiter for the `/api/v1` REST API.
 *
 * A fixed-window counter keyed by API-token user id (falling back to client IP for
 * the unauthenticated login route). It is **config-gated and off by default**: a
 * self-hosted single-user Pharos never trips it, but a shared/SaaS deployment can
 * set a cap to blunt runaway clients and brute-force login attempts.
 *
 * Enable via env:
 *   API_RATE_LIMIT       max requests per window per key (unset / <=0 → disabled)
 *   API_RATE_WINDOW_MS   window length in ms (default 60000 = 1 minute)
 *
 * The store is a plain module-level Map, so the limit is per-process (fine for the
 * single Node container Pharos ships as). It is intentionally NOT durable — a
 * restart resets counters, which is acceptable for abuse protection.
 */

export type RateEntry = { count: number; resetAt: number };

export type RateResult = {
  allowed: boolean;
  /** Requests still permitted in the current window (0 once blocked). */
  remaining: number;
  /** The configured ceiling. */
  limit: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  /** Seconds until reset, for the `Retry-After` header (0 when allowed). */
  retryAfterSec: number;
};

export type RateConfig = { enabled: boolean; limit: number; windowMs: number };

/** Shared per-process counter store. Exported so tests can pass their own Map. */
export const rateStore = new Map<string, RateEntry>();

/** Cap the store so a flood of distinct keys cannot grow it unbounded. */
const MAX_KEYS = 5000;

/** Drop entries whose window has already elapsed. Keeps the store bounded. */
export function pruneExpired(store: Map<string, RateEntry>, now: number): void {
  for (const [key, e] of store) {
    if (now >= e.resetAt) store.delete(key);
  }
}

/**
 * Record one hit for `key` and report whether it is within the limit.
 * Pure with respect to the injected `store` and `now` (no clock/env reads), so it
 * is fully unit-testable. Mutates `store` in place (fixed-window semantics).
 */
export function rateHit(
  store: Map<string, RateEntry>,
  key: string,
  now: number,
  limit: number,
  windowMs: number
): RateResult {
  // Opportunistic cleanup only when the store gets large, to avoid O(n) on every call.
  if (store.size > MAX_KEYS) pruneExpired(store, now);

  let e = store.get(key);
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + windowMs };
    store.set(key, e);
  }
  e.count += 1;

  const allowed = e.count <= limit;
  const remaining = Math.max(0, limit - e.count);
  const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((e.resetAt - now) / 1000));
  return { allowed, remaining, limit, resetAt: e.resetAt, retryAfterSec };
}

/**
 * Read the rate-limit config from the environment. Returns `enabled: false` unless
 * `API_RATE_LIMIT` is a positive integer. Read fresh each call (cheap; env is
 * effectively constant at runtime) so tests can flip it without module reloading.
 */
export function rateLimitConfig(): RateConfig {
  const limit = Number.parseInt(process.env.API_RATE_LIMIT || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { enabled: false, limit: 0, windowMs: 0 };
  }
  const win = Number.parseInt(process.env.API_RATE_WINDOW_MS || '', 10);
  const windowMs = Number.isFinite(win) && win > 0 ? win : 60_000;
  return { enabled: true, limit, windowMs };
}
