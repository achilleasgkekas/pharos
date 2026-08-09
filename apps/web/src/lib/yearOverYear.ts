// Year-over-year same-month comparison (P69). Deterministic, DB-free, unit-testable.
//
// The Reports monthly-spend chart is a rolling window (6/12/24 months): it shows a
// trend, but it cannot answer the question that actually matters for a household with
// seasonal costs, "is this normal for the season, or a real increase?". Heating in
// January and travel in August are structurally expensive; comparing them to the month
// before is noise, comparing them to the SAME month a year earlier is signal. This
// module does exactly that over the per-month expense totals the Reports page has
// already aggregated, so it costs zero new queries and introduces zero new model.
//
// Two deliberate honesty rules, both enforced here and not left to the UI:
//   1. The current month is ALWAYS excluded. It is partial by definition, and a
//      part-month compared against a whole month reads as a fake improvement.
//   2. A month whose prior year has no tracked spend gets `pct: null`, never a
//      percentage. Growth from zero has no meaningful percent, and printing +100%
//      (or ∞) would invent a fact out of missing data.

export type YoyRow = {
  /** 'YYYY-MM' of the recent (complete) month. */
  key: string;
  /** 'YYYY-MM' of the same calendar month one year earlier. */
  prevKey: string;
  /** Tracked expense in `key`. */
  current: number;
  /** Tracked expense in `prevKey`. */
  previous: number;
  /** current − previous. Positive = spent more than the same month last year. */
  delta: number;
  /** Percent change vs last year, or null when last year had nothing tracked. */
  pct: number | null;
};

export type YearOverYear = {
  /** One row per complete month in the window, oldest first (chart order). */
  rows: YoyRow[];
  /** Most recent row that has a prior-year figure to compare against, for the
   *  headline sentence. Null when nothing in the window is comparable. */
  headline: YoyRow | null;
  /** How many rows carry a prior-year figure. 0 → the caller hides the card
   *  instead of drawing a whole chart against zeros. */
  comparable: number;
};

const KEY_RE = /^(\d{4})-(\d{2})$/;

/** Shift a 'YYYY-MM' key by whole years. Pure string/number math, no Date, so it
 *  cannot be knocked off by a timezone or a DST boundary. */
export function shiftYear(key: string, years: number): string {
  const m = KEY_RE.exec(key);
  if (!m) return key;
  return `${Number(m[1]) + years}-${m[2]}`;
}

/**
 * Build the same-month year-over-year series.
 *
 * @param totalByMonth  monthKey ('YYYY-MM') → tracked expense for that month, over the
 *                      FULL history (not just the rolling window — the prior year has
 *                      to be reachable, which is the whole point).
 * @param opts.now      reference date; its own month is treated as partial and skipped.
 * @param opts.months   how many complete months to place in the window (the Reports
 *                      page passes its 6/12/24 selector straight through).
 */
export function buildYearOverYear(
  totalByMonth: ReadonlyMap<string, number>,
  opts: { now: Date; months: number },
): YearOverYear {
  const span = Math.max(1, Math.floor(opts.months) || 0);
  const rows: YoyRow[] = [];
  // i = 1 is last month (the most recent COMPLETE one), i = span the oldest.
  for (let i = span; i >= 1; i--) {
    const d = new Date(opts.now.getFullYear(), opts.now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevKey = shiftYear(key, -1);
    const current = Math.round(Math.max(0, totalByMonth.get(key) ?? 0));
    const previous = Math.round(Math.max(0, totalByMonth.get(prevKey) ?? 0));
    rows.push({
      key,
      prevKey,
      current,
      previous,
      delta: current - previous,
      pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
    });
  }
  const comparable = rows.filter((r) => r.previous > 0).length;
  let headline: YoyRow | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].previous > 0) {
      headline = rows[i];
      break;
    }
  }
  return { rows, headline, comparable };
}
