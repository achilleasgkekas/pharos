/**
 * Recurring personal-date logic (P50) — birthdays / anniversaries / namedays. Pure and
 * DB-free so the "when is the next one" rule is pinned by tests. Dates recur every year, so
 * everything is computed against the NEXT occurrence of a (month, day), never a fixed date.
 *
 * All arithmetic is in LOCAL time (the reminder is about a calendar day where the user is),
 * floored to midnight, so time-of-day and DST never shift the day count.
 */

const DAY_MS = 86400000;

function validMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31;
}

/** The occurrence date in a given calendar year, clamping an out-of-range day (Feb 29 in a
 *  non-leap year → Feb 28) instead of letting JS overflow it into the next month. */
function occurrenceInYear(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this month
  const d = new Date(year, month - 1, Math.min(day, lastDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days until the next occurrence of (month, day): 0 = today, then counts forward into
 *  next year once this year's date has passed. null for an invalid month/day. */
export function nextOccurrenceDays(month: number, day: number, now: number = Date.now()): number | null {
  if (!validMonthDay(month, day)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let occ = occurrenceInYear(today.getFullYear(), month, day);
  if (occ.getTime() < today.getTime()) occ = occurrenceInYear(today.getFullYear() + 1, month, day);
  return Math.round((occ.getTime() - today.getTime()) / DAY_MS);
}

/** The age / number of years reached AT the next occurrence, or null when the year is unknown
 *  (0) or invalid. E.g. born 1990, next birthday in 2027 → 37. */
export function yearsAtNextOccurrence(year: number, month: number, day: number, now: number = Date.now()): number | null {
  if (!year || year <= 0 || !validMonthDay(month, day)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let occYear = today.getFullYear();
  if (occurrenceInYear(occYear, month, day).getTime() < today.getTime()) occYear += 1;
  const n = occYear - year;
  return n >= 0 ? n : null;
}

export type SpecialDateRow = { _id: unknown; name: string; type?: string; month: number; day: number; year?: number };
export type UpcomingDate = { _id: unknown; name: string; type: string; days: number; years: number | null };

/**
 * Dates whose next occurrence falls within `leadDays` (0 = today counts). `leadDays <= 0`
 * turns the reminder off (returns nothing), the same convention as the other alert windows.
 * Soonest first.
 */
export function collectUpcomingDates(rows: SpecialDateRow[], leadDays: number, now: number = Date.now()): UpcomingDate[] {
  if (!(leadDays > 0)) return [];
  const out: UpcomingDate[] = [];
  for (const r of rows) {
    const days = nextOccurrenceDays(r.month, r.day, now);
    if (days === null || days > leadDays) continue;
    out.push({
      _id: r._id,
      name: r.name,
      type: r.type || '',
      days,
      years: yearsAtNextOccurrence(r.year ?? 0, r.month, r.day, now),
    });
  }
  return out.sort((a, b) => a.days - b.days);
}
