// Return-window tracking (PA3): every purchase has a period during which it can be
// returned to the store (14 days is the EU distance-selling default). The window is
// configurable globally (Settings → Defaults) and per store (Settings → Stores), and
// receipts within their window surface a "N days to return" badge + a closing alert.

/** Minimal store shape needed to resolve a return window. */
export type ReturnWindowStore = { name: string; returnWindowDays?: number | null };

/** EU distance-selling withdrawal period — the global fallback. */
export const DEFAULT_RETURN_WINDOW_DAYS = 14;

/** Effective return window (days) for a store: the store's own override when set,
 *  otherwise the global default. 0 means "no returns" (badge/alert suppressed). */
export function effectiveReturnWindow(
  storeName: string,
  stores: ReturnWindowStore[],
  defaultDays: number
): number {
  const key = (storeName || '').trim().toLowerCase();
  if (key) {
    const hit = stores.find((s) => s.name.trim().toLowerCase() === key);
    if (hit && typeof hit.returnWindowDays === 'number' && Number.isFinite(hit.returnWindowDays) && hit.returnWindowDays >= 0) {
      return hit.returnWindowDays;
    }
  }
  return Math.max(0, defaultDays);
}

/**
 * Days left in the return window for a purchase, or null when not applicable:
 * invalid date, window disabled (≤ 0), or window already closed. The deadline is
 * purchase date + windowDays; the result is clamped to windowDays so a bogus
 * future-dated receipt can't show a window longer than the policy.
 */
export function returnDaysLeft(
  purchaseDate: string | Date | null | undefined,
  windowDays: number,
  now: number = Date.now()
): number | null {
  if (!purchaseDate || !Number.isFinite(windowDays) || windowDays <= 0) return null;
  const t = new Date(purchaseDate).getTime();
  if (isNaN(t)) return null;
  const days = Math.ceil((t + windowDays * 86400000 - now) / 86400000);
  if (days < 0) return null;
  // Math.max also normalizes Math.ceil's negative zero to 0.
  return Math.max(0, Math.min(days, Math.floor(windowDays)));
}
