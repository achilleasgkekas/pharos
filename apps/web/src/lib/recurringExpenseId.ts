import { createHash } from 'node:crypto';

/**
 * #69 — the id an auto-generated recurring entry MUST have, derived from the series and the period
 * it covers. Two page loads (or a page load and the cron) can enter `generateDueRecurring` at the
 * same moment: both read the same latest entry, both decide the next occurrence is missing, and
 * both insert it. The result is a double charge in every total the user reads.
 *
 * A lookup-then-insert cannot close that window, and a unique index over the natural key cannot
 * either without punishing real data: a unique {kind, vendorKey, date} would refuse the second
 * coffee bought at the same shop on the same day. The `_id` index, on the other hand, always
 * exists, is enforced by the server, covers every process, survives a crash, and applies ONLY to
 * the rows this generator creates. The bills recurrence does the same thing for the same reason
 * (lib/billRecurrence.ts, #33).
 *
 * Deterministic in the series identity + the period, never the amount or the wording, so an edited
 * projection still occupies its slot.
 */
export function recurringExpenseId(kind: string, vendorKey: string, period: string, seriesId?: string): string {
  if (seriesId) {
    return createHash('sha256')
      .update(`recurring-expense:series:${seriesId}|${period}`)
      .digest('hex')
      .slice(0, 24);
  }
  return createHash('sha256')
    .update(`recurring-expense:${kind}|${vendorKey}|${period}`)
    .digest('hex')
    .slice(0, 24);
}

/** Mongo's duplicate-key error — here it means "another run already created this entry". */
export function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}
