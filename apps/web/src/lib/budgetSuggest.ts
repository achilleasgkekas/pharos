// Deterministic budget suggestions from spending history (P27). No AI: buckets
// non-income expenses by category × month, takes the median monthly total per
// category over a trailing window of complete months, rounds to the nearest €5,
// and skips categories with too little history. Pure + framework-free so it can
// be unit-tested without a DB (the server action feeds it lean Expense rows).

export type BudgetExpenseRow = {
  kind?: string | null;
  amount?: number | null;
  category?: string | null;
  period?: string | null;
  date?: string | Date | null;
};

export type SuggestBudgetsOptions = {
  /** How many complete months (before the current one) to consider. Default 3. */
  windowMonths?: number;
  /** Minimum distinct months a category must appear in to be suggested. Default 2. */
  minMonths?: number;
  /** Rounding step for the suggested amount. Default 5 (nearest €5). */
  roundTo?: number;
  /** Reference "now" for the trailing window. Defaults to the current date. */
  now?: Date;
};

/** YYYY-MM key for a date (UTC-agnostic; local month is fine for month bucketing). */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Resolve the YYYY-MM bucket of an expense row: prefer an explicit `period`,
 *  else derive from `date`. Returns null when neither is a valid month. */
function rowMonth(r: BudgetExpenseRow): string | null {
  if (r.period && /^\d{4}-\d{2}$/.test(r.period)) return r.period;
  if (r.date != null) {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (!isNaN(d.getTime())) return monthKey(d);
  }
  return null;
}

/** Median of a non-empty numeric list (average of the two middle values on even length). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Suggest a monthly budget per expense category from spending history.
 *
 * Only the `windowMonths` complete months immediately before the current month
 * are considered (the current, still-partial month is excluded so it does not
 * drag medians down). For each category, the median of its per-month totals over
 * the months it actually appears in is rounded to the nearest `roundTo`. A
 * category is skipped when it has fewer than `minMonths` months of spend, or when
 * the rounded suggestion collapses to zero.
 *
 * @returns category → suggested monthly amount (only qualifying categories).
 */
export function suggestBudgetsFromExpenses(
  rows: BudgetExpenseRow[] | null | undefined,
  opts: SuggestBudgetsOptions = {},
): Record<string, number> {
  const windowMonths = Math.max(1, Math.floor(opts.windowMonths ?? 3));
  const minMonths = Math.max(1, Math.floor(opts.minMonths ?? 2));
  const roundTo = opts.roundTo && opts.roundTo > 0 ? opts.roundTo : 5;
  const now = opts.now ?? new Date();

  // Build the allowed set of complete months: the current month is excluded, then
  // the previous `windowMonths` months are included.
  const allowed = new Set<string>();
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < windowMonths; i++) {
    cursor.setMonth(cursor.getMonth() - 1);
    allowed.add(monthKey(cursor));
  }

  // category → (month → summed amount)
  const byCat = new Map<string, Map<string, number>>();
  for (const r of rows ?? []) {
    if (r.kind === 'income') continue;
    const amt = Number(r.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const mk = rowMonth(r);
    if (!mk || !allowed.has(mk)) continue;
    const cat = (r.category || 'other').trim() || 'other';
    let months = byCat.get(cat);
    if (!months) byCat.set(cat, (months = new Map()));
    months.set(mk, (months.get(mk) ?? 0) + amt);
  }

  const out: Record<string, number> = {};
  for (const [cat, months] of byCat) {
    if (months.size < minMonths) continue;
    const suggestion = Math.round(median([...months.values()]) / roundTo) * roundTo;
    if (suggestion > 0) out[cat] = suggestion;
  }
  return out;
}
