/** Parse a date value safely; never returns an Invalid Date (which crashes Mongoose).
 *  Handles ISO (YYYY-MM-DD) plus European day-first DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *  (Greek receipts) which native `new Date()` cannot parse and would otherwise silently
 *  fall back to "today". */
export function safeDate(value: unknown, fallback: Date = new Date()): Date {
  return parseFlexibleDate(value) ?? fallback;
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
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`);
      if (!isNaN(iso.getTime())) return iso;
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
