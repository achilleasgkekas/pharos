// Per-item dedup for the OUTBOUND alert channels (ntfy/Discord/Slack/Telegram/webhook +
// mobile push) — P82. The in-app notification bell already tracks "has the user been
// told about this exact alert before" via a dedupeKey (see computeAlerts() in
// app/notifications/actions.ts): a warranty item gets `warranty:<id>` with no day-count
// in the key, so it fires once when it enters the alert window and stays quiet while the
// day count ticks down, instead of re-notifying every single day. The outbound side never
// had that memory — harmless while the only trigger was a human pressing "Check & notify
// now", but P81 wired an unattended cron to the same scan, so an unresolved bill/warranty/
// deal would otherwise repeat the identical push on every tick until it resolves.
//
// Pure + framework-free (same shape as lib/priceHike.ts / lib/budgetAlert.ts) so it
// unit-tests without a DB. runAlertChecks (app/settings/actions.ts) supplies the live
// items per category + a key function; this returns which are new/changed since the last
// successful outbound send, plus the full current key set to persist as the next baseline.

export function splitFreshAlerts<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  previouslySent: ReadonlySet<string> | readonly string[]
): { fresh: T[]; keys: string[] } {
  const prev = previouslySent instanceof Set ? previouslySent : new Set(previouslySent);
  const keys = items.map(keyOf);
  const fresh = items.filter((item) => !prev.has(keyOf(item)));
  return { fresh, keys };
}
