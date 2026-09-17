// The Reports page period selector (6 / 12 / 24 months) — one definition of "inside the window".
//
// #122: the selector only ever reached the two month-by-month charts. Spend by store, biggest
// purchases, the receipts total, expenses by category and by space were all summed over the whole
// history, so after picking "6mo" half the page described six months and the other half every
// record ever entered. Every windowed figure now goes through these two helpers so they cannot
// drift apart again.

/** 'YYYY-MM' of the first month inside a window of `months` months ending with the current one. */
export function reportWindowStart(now: Date, months: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - (Math.max(1, months) - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Whether a 'YYYY-MM' key falls in the window. Keys compare correctly as strings; an empty or
 *  malformed key (an undated record) is outside, because it cannot be placed in any period. */
export function inReportWindow(monthKey: string, startKey: string): boolean {
  return /^\d{4}-\d{2}$/.test(monthKey) && monthKey >= startKey;
}

/** Local-time 'YYYY-MM' of a stored date, or '' when missing/invalid. Matches the page's monthKey. */
export function monthKeyOfDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const parsed = d instanceof Date ? d : new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}
