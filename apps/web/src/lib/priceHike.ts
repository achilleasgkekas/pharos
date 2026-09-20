// Deterministic price-hike / price-drop watch for recurring charges (P14). No AI:
// groups priced entries by their normalized vendorKey (the same key the recurring
// series + anomaly logic use), and for each qualifying series compares the LATEST
// charge to the one before it. When a bill/subscription moves by at least the
// configured threshold (percent OR absolute), it emits one event ("Netflix rose
// €2 (+15%)", "ΔΕΗ +18%"). Decreases are reported too — a sudden drop can be a
// mis-charge worth a look. Pure + framework-free so it unit-tests without a DB
// (the server action feeds it lean Expense rows).

export type HikeEntry = {
  vendor?: string | null;
  vendorKey?: string | null;
  amount?: number | null;
  origAmount?: number | null;
  date?: string | Date | null;
  recurring?: boolean | null;
  kind?: string | null;
};

export type PriceHike = {
  vendorKey: string;
  vendor: string;
  /** Previous charge in the series. */
  prev: number;
  /** Latest charge in the series. */
  curr: number;
  /** Signed change (curr − prev). */
  deltaAbs: number;
  /** Signed change as an integer percentage of the previous charge. */
  deltaPct: number;
  direction: 'up' | 'down';
  /** ISO date of the latest charge. */
  date: string;
};

export type DetectHikesOptions = {
  /** Percent threshold (of the previous charge) that triggers an event. Default 5. */
  minPct?: number;
  /** Absolute-amount threshold that triggers an event. Default 1. */
  minAbs?: number;
  /**
   * Minimum priced entries a NON-recurring series needs before it is watched.
   * A series flagged `recurring` is always watched regardless. Default 3 — keeps
   * one-off vendors from firing on a second, unrelated purchase.
   */
  minEntries?: number;
};

/** Parse a row date to epoch ms, or null when it is not a valid date. */
function ts(d: string | Date | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return isNaN(t) ? null : t;
}

/**
 * Detect price hikes/drops across recurring charge series.
 *
 * Rows are grouped by `vendorKey`; rows with no key or a non-positive amount are
 * ignored. A series is watched when any of its entries is marked `recurring`, or
 * when it has at least `minEntries` priced entries. Within a watched series the
 * two most recent charges (by date) are compared; the event fires when the change
 * is at least `minPct` percent OR at least `minAbs` in absolute value.
 *
 * @returns one event per changed series, most-recent first.
 */
export function detectPriceHikes(
  rows: HikeEntry[] | null | undefined,
  opts: DetectHikesOptions = {},
): PriceHike[] {
  const minPct = opts.minPct != null && opts.minPct >= 0 ? opts.minPct : 5;
  const minAbs = opts.minAbs != null && opts.minAbs >= 0 ? opts.minAbs : 1;
  const minEntries = Math.max(2, Math.floor(opts.minEntries ?? 3));

  type Row = { amount: number; t: number; date: string; vendor: string; recurring: boolean };
  const byKey = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    if (r.kind === 'income') continue;
    const key = (r.vendorKey || '').trim();
    const origAmount = Number(r.origAmount ?? 0);
    const amount = origAmount > 0 ? origAmount : Number(r.amount ?? 0);
    const t = ts(r.date);
    if (!key || !(amount > 0) || t == null) continue;
    const arr = byKey.get(key) ?? [];
    arr.push({
      amount,
      t,
      date: new Date(t).toISOString(),
      vendor: (r.vendor || '').trim(),
      recurring: !!r.recurring,
    });
    byKey.set(key, arr);
  }

  const out: PriceHike[] = [];
  for (const [key, arr] of byKey) {
    const watched = arr.some((e) => e.recurring) || arr.length >= minEntries;
    if (!watched || arr.length < 2) continue;

    // Two most recent charges by date (stable: keep insertion order on ties).
    arr.sort((a, b) => a.t - b.t);
    const curr = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    if (!(prev.amount > 0)) continue;

    const deltaAbs = curr.amount - prev.amount;
    const deltaPct = Math.round((deltaAbs / prev.amount) * 100);
    if (Math.abs(deltaPct) < minPct && Math.abs(deltaAbs) < minAbs) continue;

    out.push({
      vendorKey: key,
      vendor: curr.vendor || prev.vendor || key,
      prev: prev.amount,
      curr: curr.amount,
      deltaAbs: Math.round(deltaAbs * 100) / 100,
      deltaPct,
      direction: deltaAbs >= 0 ? 'up' : 'down',
      date: curr.date,
    });
  }

  // Most recent change first.
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
