/** Client-safe delivery-log types + pure helpers (no DB imports), so the Settings UI
 *  can render the history without pulling Mongoose into the client bundle. The
 *  persistence lives in deliveryLog.ts (server-only). */

export type DeliveryLogEntry = {
  at: string; // ISO timestamp of the last attempt
  ok: boolean;
  status?: number; // HTTP status, when the request reached a server
  error?: string; // short reason when it did not
  attempts: number; // 1 = delivered/failed first try, >1 = retried
};

/** Rows kept per channel. Enough to see a pattern ("it has been failing all week"),
 *  small enough that the config document cannot grow unbounded. */
export const DELIVERY_LOG_CAP = 20;

/** Channels kept in the map. Bounds growth when channels are added/removed over time
 *  (a deleted channel's rows age out instead of living forever). */
export const DELIVERY_LOG_KEY_CAP = 50;

export const notifierLogKey = (id: string) => `notifier:${id}`;
export const webhookLogKey = (id: string) => `webhook:${id}`;

function coerceEntry(raw: unknown): DeliveryLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const at = typeof r.at === 'string' ? r.at : r.at instanceof Date ? r.at.toISOString() : '';
  if (!at) return null;
  const status = Number(r.status);
  const attempts = Number(r.attempts);
  return {
    at,
    ok: r.ok === true,
    ...(Number.isFinite(status) && status > 0 ? { status } : {}),
    ...(r.error ? { error: String(r.error).slice(0, 200) } : {}),
    attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 1,
  };
}

/** Normalize whatever is stored in the Mixed field into a clean map (drops junk). */
export function normalizeDeliveryLog(raw: unknown): Record<string, DeliveryLogEntry[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DeliveryLogEntry[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const rows = value.map(coerceEntry).filter((e): e is DeliveryLogEntry => e !== null);
    if (rows.length > 0) out[key] = rows.slice(-DELIVERY_LOG_CAP);
  }
  return out;
}

/** Append newest-last and keep only the last `cap` rows. */
export function appendCapped(rows: DeliveryLogEntry[], entry: DeliveryLogEntry, cap = DELIVERY_LOG_CAP): DeliveryLogEntry[] {
  return [...rows, entry].slice(-cap);
}

/** Keep the `cap` most recently active keys (by their newest row), drop the rest. */
export function pruneLogKeys(
  log: Record<string, DeliveryLogEntry[]>,
  cap = DELIVERY_LOG_KEY_CAP,
): Record<string, DeliveryLogEntry[]> {
  const keys = Object.keys(log);
  if (keys.length <= cap) return log;
  const newest = (k: string) => Date.parse(log[k].at(-1)?.at ?? '') || 0;
  const kept = keys.sort((a, b) => newest(b) - newest(a)).slice(0, cap);
  return Object.fromEntries(kept.map((k) => [k, log[k]]));
}
