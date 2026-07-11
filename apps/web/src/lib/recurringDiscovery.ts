// Deterministic auto-discovery of untracked recurring charges (P7). No AI: groups
// priced expense rows by their normalized vendorKey (the same key the subscription /
// price-hike / category-rule logic use) and flags series with a regular cadence
// ("looks like a subscription/bill") that have no matching Subscription tracked yet.
// Pure + framework-free so it unit-tests without a DB (the server action feeds it
// lean Expense rows + the vendorKeys already covered by an existing Subscription).

export type RecurringRow = {
  vendor?: string | null;
  vendorKey?: string | null;
  amount?: number | null;
  date?: string | Date | null;
  category?: string | null;
  kind?: string | null;
};

export type RecurringCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type RecurringCandidate = {
  vendorKey: string;
  vendor: string;
  category: string;
  occurrences: number;
  /** Mean charge across the series, rounded to cents. */
  avgAmount: number;
  /** Most recent charge (what the user is paying now). */
  lastAmount: number;
  lastDate: string;
  firstDate: string;
  avgIntervalDays: number;
  cycle: RecurringCycle;
};

export type DiscoverOptions = {
  /** Minimum priced occurrences before a series is considered. Default 3. */
  minOccurrences?: number;
  /** Day tolerance around a cycle's nominal length (average AND per-gap consistency). Default 5. */
  toleranceDays?: number;
  /** vendorKeys already covered by an existing Subscription — excluded up front. */
  excludeVendorKeys?: Iterable<string>;
};

const CYCLE_BANDS: { cycle: RecurringCycle; days: number }[] = [
  { cycle: 'weekly', days: 7 },
  { cycle: 'monthly', days: 30 },
  { cycle: 'quarterly', days: 91 },
  { cycle: 'yearly', days: 365 },
];

/** Parse a row date to epoch ms, or null when it is not a valid date. */
function ts(d: string | Date | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return isNaN(t) ? null : t;
}

/**
 * Discover expense series that look like an untracked recurring charge.
 *
 * Rows are grouped by `vendorKey`; income rows, rows with no key/vendorKey already
 * excluded/non-positive amount/unparseable date are ignored. A series qualifies when
 * it has at least `minOccurrences` priced entries AND its inter-charge gaps cluster
 * around one of the known cycle lengths (weekly/monthly/quarterly/yearly) within
 * `toleranceDays` — both the average gap and every individual gap must be close to
 * that cycle, so a handful of coincidentally-averaging one-off purchases don't false-positive.
 *
 * @returns one candidate per qualifying series, most recently charged first.
 */
export function discoverRecurringCandidates(
  rows: RecurringRow[] | null | undefined,
  opts: DiscoverOptions = {},
): RecurringCandidate[] {
  const minOccurrences = Math.max(2, Math.floor(opts.minOccurrences ?? 3));
  const toleranceDays = opts.toleranceDays != null && opts.toleranceDays >= 0 ? opts.toleranceDays : 5;
  const excluded = new Set(Array.from(opts.excludeVendorKeys ?? []));

  type Row = { amount: number; t: number; date: string; vendor: string; category: string };
  const byKey = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    if (r.kind === 'income') continue;
    const key = (r.vendorKey || '').trim();
    const amount = Number(r.amount ?? 0);
    const t = ts(r.date);
    if (!key || excluded.has(key) || !(amount > 0) || t == null) continue;
    const arr = byKey.get(key) ?? [];
    arr.push({
      amount,
      t,
      date: new Date(t).toISOString(),
      vendor: (r.vendor || '').trim(),
      category: (r.category || '').trim(),
    });
    byKey.set(key, arr);
  }

  const out: RecurringCandidate[] = [];
  for (const [key, arr] of byKey) {
    if (arr.length < minOccurrences) continue;
    arr.sort((a, b) => a.t - b.t);

    const gaps: number[] = [];
    for (let i = 1; i < arr.length; i++) gaps.push((arr[i].t - arr[i - 1].t) / 86_400_000);
    const avgIntervalDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;

    let cycle: RecurringCycle | null = null;
    let bestDist = Infinity;
    for (const band of CYCLE_BANDS) {
      const dist = Math.abs(avgIntervalDays - band.days);
      if (dist < bestDist) { bestDist = dist; cycle = band.cycle; }
    }
    if (!cycle || bestDist > toleranceDays) continue; // average gap doesn't fit any known cycle

    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgIntervalDays)));
    if (maxDeviation > toleranceDays * 1.5) continue; // too irregular to call it recurring

    const avgAmount = arr.reduce((s, r) => s + r.amount, 0) / arr.length;
    const first = arr[0];
    const last = arr[arr.length - 1];

    // Most common category across the series (informational only).
    const catCounts = new Map<string, number>();
    for (const r of arr) if (r.category) catCounts.set(r.category, (catCounts.get(r.category) || 0) + 1);
    let category = '';
    let bestN = 0;
    for (const [c, n] of catCounts) if (n > bestN) { category = c; bestN = n; }

    out.push({
      vendorKey: key,
      vendor: last.vendor || first.vendor || key,
      category,
      occurrences: arr.length,
      avgAmount: Math.round(avgAmount * 100) / 100,
      lastAmount: last.amount,
      lastDate: last.date,
      firstDate: first.date,
      avgIntervalDays: Math.round(avgIntervalDays),
      cycle,
    });
  }

  out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  return out;
}
