/** Parse a date value safely; never returns an Invalid Date (which crashes Mongoose).
 *  Handles ISO (YYYY-MM-DD) plus European day-first DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *  (Greek receipts) which native `new Date()` cannot parse and would otherwise silently
 *  fall back to "today". */
export function safeDate(value: unknown, fallback: Date = new Date()): Date {
  return parseFlexibleDate(value) ?? fallback;
}

/**
 * For server actions (#404): true when `value` is absent/blank (an optional date left out) or a
 * date we can read. False for text that is there but is not a real date, such as `31/02/2026`
 * or `2026-02-31`, which `safeDate` would otherwise have quietly turned into today.
 */
export function isBlankOrValidDate(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return !value.trim() || parseFlexibleDate(value) !== null;
}

/** Do these parts name a real day? `new Date` rolls 31 February over to 3 March instead. */
function realDay(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Like safeDate but returns null (not a fallback) for empty/invalid input. */
export function safeDateOrNull(value: unknown): Date | null {
  return parseFlexibleDate(value);
}

function parseFlexibleDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  // European day-first: 23/09/2025, 23-09-2025, 23.09.2025 → reorder to ISO.
  // ISO (year-first, e.g. 2025-09-23) never matches here because its first group
  // is 4 digits, so it falls through to native parsing below.
  const eu = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (eu) {
    const [, dd, mm, yyyy] = eu;
    const day = Number(dd);
    const month = Number(mm);
    if (realDay(Number(yyyy), month, day)) {
      // UTC midnight, like every other date-only value (#355); without the Z it was midnight in
      // the SERVER's zone, so the stored day depended on where the app ran.
      const iso = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
      if (!isNaN(iso.getTime())) return iso;
    }
  }

  // ISO day first (2025-09-23, 2025-09-23T10:00:00Z): native parsing would roll an impossible
  // day such as 2026-02-31 over into March (#404).
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (ymd && !realDay(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))) return null;

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns the current local date as an ISO string (YYYY-MM-DD), avoiding the UTC shift of `.toISOString()`. */
export function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA');
}
