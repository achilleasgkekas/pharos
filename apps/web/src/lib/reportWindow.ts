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

/** The 'YYYY-MM' a STORED date belongs to, or '' when missing/invalid.
 *
 *  Read in UTC, because that is the frame every one of these dates was written in (#242): the
 *  user picks a day, DateInput emits `YYYY-MM-DD`, and the write paths pin it to UTC midnight
 *  (`new Date(`${d}T00:00:00Z`)`, or Mongoose casting the bare date string to exactly the same
 *  instant). The value carries a DAY and no time of day, so asking local-time getters what
 *  o'clock it was invents an answer: on any server west of UTC, midnight of the 1st reads as
 *  the previous month and the record lands in the wrong bucket — a 1 July expense filed under
 *  June for every American self-host, while Athens saw it correctly. UTC hands back the day
 *  that was typed, on every server.
 *
 *  This is the record frame. The month AXIS is built from the server's own clock and stays
 *  local, so the page keeps showing the months its user is living in. */
export function monthKeyOfDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const parsed = d instanceof Date ? d : new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}
