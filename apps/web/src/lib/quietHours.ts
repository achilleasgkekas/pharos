/**
 * Quiet hours / do-not-disturb window for the outbound alert cron (P86).
 *
 * P81 wired an unattended cron to runAlertChecks, so a deal-alert or a bill nag can now
 * fire push/ntfy/Discord/Telegram/webhook at any hour of the night. This is the one
 * daily window in which the cron holds outbound delivery — the scan still runs and the
 * in-app bell still updates, only the phone-buzzing dispatch is deferred to the next
 * run outside the window (see runAlertChecks, which skips persisting the dedupe baseline
 * while quiet so nothing is silently swallowed).
 *
 * Pure and DB-free on purpose — the wrap-around-midnight logic is the whole feature, so
 * it is pinned by tests. server-local time, one window per day (MVP, per the P86 spec).
 */

export type QuietHours = { start: string; end: string };

/** Parse "HH:MM" (24h) into minutes since midnight, or null if malformed/out of range. */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Coerce raw stored/user input into a valid {start, end}; anything malformed → ''. */
export function normalizeQuietHours(raw: unknown): QuietHours {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clean = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return parseHHMM(s) === null ? '' : s;
  };
  return { start: clean(obj.start), end: clean(obj.end) };
}

/**
 * A window is only "on" when both ends parse AND differ. Equal start/end would describe
 * either a zero-length window or a whole day — both meaningless as a DND setting, so we
 * treat them as "no quiet hours" rather than guessing.
 */
export function quietHoursEnabled(qh: QuietHours | null | undefined): boolean {
  if (!qh) return false;
  const a = parseHHMM(qh.start);
  const b = parseHHMM(qh.end);
  return a !== null && b !== null && a !== b;
}

/**
 * Is `now` (server-local) inside the quiet window? Handles the common overnight case
 * (start > end, e.g. 22:00→07:00) by treating the window as wrapping past midnight.
 * Half-open [start, end): a run exactly at `end` is already outside, so alerts held at
 * 06:59 go out at the 07:00 tick.
 */
export function isWithinQuietHours(now: Date, qh: QuietHours | null | undefined): boolean {
  if (!quietHoursEnabled(qh)) return false;
  const start = parseHHMM((qh as QuietHours).start) as number;
  const end = parseHHMM((qh as QuietHours).end) as number;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}
