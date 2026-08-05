/**
 * Outbound delivery retry policy (P80), shared by the two outbound surfaces:
 * lib/notifiers.ts (human-readable alert summaries: ntfy/Discord/Slack/Telegram/
 * webhook) and lib/webhooks.ts (P24 signed structured event POSTs).
 *
 * Why: both used to be single-attempt fire-and-forget, so an n8n/Home Assistant
 * endpoint that happened to be restarting when an alert fired lost the event
 * silently. A couple of backed-off retries turn a momentary blip into a delivered
 * message; anything the receiver rejects outright (4xx) is NOT retried, because
 * repeating a request the server already refused only wastes time.
 *
 * Pure module (no IO, no clock beyond the injected sleep) so the policy is fully
 * unit-testable. See deliveryLog.ts for the persisted per-channel history.
 */

/** One delivery attempt's result. `permanent` marks a failure that retrying cannot fix
 *  (missing config, SSRF-blocked URL, local rate limit, unknown channel type). */
export type DeliveryOutcome = {
  ok: boolean;
  status?: number; // HTTP status when the request actually reached a server
  error?: string;
  permanent?: boolean;
};

export type DeliveryResult = DeliveryOutcome & { attempts: number };

/** Backoff between attempts, in ms. Two retries (three attempts total) by default.
 *  Deliberately short: dispatch is awaited inside a server action (the "Check &
 *  notify now" button) and the /api/cron/alerts request, so a minutes-long backoff
 *  would blow the request budget instead of helping. */
export const DEFAULT_RETRY_DELAYS_MS = [1000, 5000];

const MAX_RETRIES = 5;
const MAX_DELAY_MS = 60_000;

/** Parse a comma-separated ms list (env `NOTIFY_RETRY_DELAYS_MS`). Returns null when the
 *  value is absent/garbage so the caller falls back to the default; an explicitly EMPTY
 *  value means "no retries at all", which is a valid choice, so that returns []. */
export function parseRetryDelays(raw: string | undefined): number[] | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  const parts = trimmed.split(',').map((p) => Number.parseInt(p.trim(), 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.slice(0, MAX_RETRIES).map((n) => Math.min(n, MAX_DELAY_MS));
}

/** Configured backoff, env-overridable so a self-hoster can lengthen, shorten, or
 *  disable retries without a rebuild (and so tests can run them at zero delay). */
export function retryDelays(): number[] {
  return parseRetryDelays(process.env.NOTIFY_RETRY_DELAYS_MS) ?? DEFAULT_RETRY_DELAYS_MS;
}

/**
 * Retry only what a retry can plausibly fix:
 *   - no status at all (network error / timeout / DNS) → transient, retry
 *   - 5xx, 429 (rate limited), 408 (request timeout)   → transient, retry
 *   - any other 4xx (bad URL, revoked webhook, bad token) → permanent, give up
 *   - `permanent: true` (never left this process)        → give up
 */
export function isRetryable(o: DeliveryOutcome): boolean {
  if (o.ok || o.permanent) return false;
  if (o.status === undefined) return true;
  return o.status >= 500 || o.status === 429 || o.status === 408;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `send` until it succeeds, hits a permanent failure, or exhausts `delays`.
 * Never throws: `send` is expected to return an outcome rather than reject, and the
 * callers here (notifiers/webhooks) already funnel their errors into one.
 */
export async function deliverWithRetry(
  send: () => Promise<DeliveryOutcome>,
  opts: { delays?: number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DeliveryResult> {
  const delays = opts.delays ?? retryDelays();
  const sleep = opts.sleep ?? realSleep;
  let attempts = 0;
  for (;;) {
    const out = await send();
    attempts++;
    if (out.ok || attempts > delays.length || !isRetryable(out)) return { ...out, attempts };
    await sleep(delays[attempts - 1]);
  }
}

/** Short human-readable reason for a failed outcome, for the delivery log / UI. */
export function describeOutcome(o: DeliveryOutcome): string {
  if (o.ok) return 'ok';
  if (o.error) return o.status ? `HTTP ${o.status} — ${o.error}` : o.error;
  return o.status ? `HTTP ${o.status}` : 'failed';
}
