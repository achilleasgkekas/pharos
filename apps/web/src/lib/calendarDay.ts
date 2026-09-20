// The calendar day an agenda entry belongs to — chosen ONCE, on the server, and never
// re-derived anywhere else.
//
// /calendar buckets entries into month blocks with the server's clock, then the browser used to
// re-read each entry's ISO timestamp with `getDate()` — the VIEWER's clock. Two calendars for one
// entry. Any instant that falls on different dates in the two zones (a goal deadline stored at
// 21:00 UTC seen from Athens, a UTC-midnight bill seen from New York) landed in the right month
// block and was then drawn in the wrong cell of it, off by one day (#187).
//
// A date-only string carries no instant to re-interpret, so there is nothing left to disagree
// about. These two helpers are the only sanctioned way in and out of that representation.

/** `YYYY-MM-DD` for a Date, read in the SAME (local/server) frame the month key uses. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day-of-month out of a `YYYY-MM-DD`, read from the text — no Date, so no timezone. */
export function dayOf(value: string): number {
  return Number(value.slice(8, 10));
}

/** The `YYYY-MM` month key of a `YYYY-MM-DD`, so a caller can check an entry against its block. */
export function monthOf(value: string): string {
  return value.slice(0, 7);
}
