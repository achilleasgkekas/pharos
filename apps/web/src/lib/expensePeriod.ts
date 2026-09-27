// The month an expense counts in (its `period`), kept in step with its date (#355).

/** `YYYY-MM` of a stored date. UTC getters (#103): dates are date-only values at UTC midnight. */
export function monthOfDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** '' (derive it from the date) or a real `YYYY-MM`. */
export const PERIOD_RE = /^(\d{4}-(0[1-9]|1[0-2]))?$/;

/**
 * The period an edit should store. The edit form sends the period it opened with, so a date moved
 * to another month kept the old period and the expense went on counting in the old month. A
 * period that only mirrored the old date follows the new one; a period set to a different month
 * on purpose (a September bill paid in October) stays.
 */
export function periodForUpdate(sent: string, newDate: Date, before: { date?: Date | string | null; period?: string | null } | null): string {
  if (!sent) return monthOfDate(newDate);
  const oldDate = before?.date ? new Date(before.date) : null;
  const mirroredOld = !!oldDate && !Number.isNaN(oldDate.getTime()) && before?.period === sent && sent === monthOfDate(oldDate);
  return mirroredOld ? monthOfDate(newDate) : sent;
}

/** The form side: does the period still follow the date it was opened with? */
export function periodFollowsDate(period: string, isoDate: string): boolean {
  return !period || period === isoDate.slice(0, 7);
}
