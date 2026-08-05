import { createHmac, randomBytes } from 'node:crypto';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { assertPublicUrl } from './ssrf';
import { rateHit, type RateConfig } from './apiRateLimit';
import { WEBHOOK_EVENTS, type WebhookEvent, type WebhookSubscription } from './webhooks.shared';
import { deliverWithRetry, describeOutcome, type DeliveryOutcome } from './deliveryRetry';
import { recordDeliveries } from './deliveryLog';
import { webhookLogKey } from './deliveryLog.shared';

export { WEBHOOK_EVENTS };
export type { WebhookEvent, WebhookSubscription };

/**
 * Outbound event webhooks (P24) — automation hooks for Home Assistant / n8n /
 * Node-RED. Distinct from lib/notifiers.ts: notifiers fan out human-readable
 * *alert summaries* (ntfy/Discord/Slack/Telegram/webhook), these fire one
 * signed structured JSON POST per domain event a subscription opted into.
 *
 * Events fired from existing trigger points (no new event bus):
 *   receipt.parsed    → app/receipts/actions.ts (uploadReceipt, rescanReceipt)
 *   budget.exceeded    installment.due    price.drop
 *                      → app/settings/actions.ts (runAlertChecks)
 */

const TIMEOUT = 10000;

export function generateWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Stripe-style outbound signature so receivers can verify authenticity:
 * header value `t=<unix seconds>,v1=<hex hmac-sha256 of "t.body">`.
 * Pure (no clock/IO reads), so it is fully unit-testable.
 */
export function signWebhookPayload(secret: string, timestampSec: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
  return `t=${timestampSec},v1=${mac}`;
}

/** Validate + normalize a raw stored/submitted subscription. Drops unknown event names. */
export function coerceWebhookSubscription(raw: unknown, i: number): WebhookSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = String(r.url || '').trim();
  if (!url) return null;
  const events = Array.isArray(r.events)
    ? r.events.filter((e): e is WebhookEvent => WEBHOOK_EVENTS.some((w) => w.type === e))
    : [];
  return {
    id: String(r.id || `w${i}`),
    url,
    secret: String(r.secret || ''),
    enabled: r.enabled !== false,
    label: r.label ? String(r.label) : '',
    events,
  };
}

/** Read configured subscriptions (tenant-scoped: one tenant's URLs/secrets are
 *  never read for another). */
export async function getEventWebhooks(): Promise<WebhookSubscription[]> {
  await connectDB();
  const Config = await currentModel(AppConfig);
  const doc = await Config.findOne({ key: 'singleton' }).select('eventWebhooks').lean();
  const arr = Array.isArray(doc?.eventWebhooks) ? doc!.eventWebhooks : [];
  return arr.map(coerceWebhookSubscription).filter((c): c is WebhookSubscription => c !== null);
}

/** Per-process delivery counter, isolated from the `/api/v1` rate limiter's store
 *  (different key space — subscription id, not user/IP). */
const deliveryStore = new Map<string, { count: number; resetAt: number }>();

/** Off unless `WEBHOOK_RATE_LIMIT` is a positive integer — a self-hosted single-user
 *  instance never trips it; a shared/SaaS deployment can cap deliveries per subscription. */
function webhookRateLimitConfig(): RateConfig {
  const limit = Number.parseInt(process.env.WEBHOOK_RATE_LIMIT || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) return { enabled: false, limit: 0, windowMs: 0 };
  const win = Number.parseInt(process.env.WEBHOOK_RATE_WINDOW_MS || '', 10);
  const windowMs = Number.isFinite(win) && win > 0 ? win : 60_000;
  return { enabled: true, limit, windowMs };
}

/** One delivery attempt. Failures that a retry cannot fix (local rate limit, SSRF-blocked
 *  target) are marked `permanent` so deliverWithRetry gives up immediately. */
async function attemptOne(sub: WebhookSubscription, event: WebhookEvent, data: unknown): Promise<DeliveryOutcome> {
  const rl = webhookRateLimitConfig();
  if (rl.enabled && !rateHit(deliveryStore, sub.id, Date.now(), rl.limit, rl.windowMs).allowed) {
    return { ok: false, error: 'Local rate limit reached', permanent: true };
  }
  try {
    await assertPublicUrl(sub.url);
  } catch (err) {
    // SSRF guard — never POST to a private/loopback/internal address
    return { ok: false, error: (err as Error).message, permanent: true };
  }
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event, data, ts });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sub.secret) headers['X-Pharos-Signature'] = signWebhookPayload(sub.secret, ts, body);
  try {
    const res = await fetch(sub.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok
      ? { ok: true, ...(res.status ? { status: res.status } : {}) }
      : { ok: false, status: res.status, error: 'Rejected by receiver' };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Network error' };
  }
}

async function postOne(sub: WebhookSubscription, event: WebhookEvent, data: unknown): Promise<boolean> {
  return (await attemptOne(sub, event, data)).ok;
}

/**
 * Fire an event to every enabled subscription that opted into it. Never throws —
 * callers use this fire-and-forget from feature flows (receipt upload, alert scan).
 *
 * Each subscription retries with backoff (P80) and records the outcome in the
 * persisted delivery log, so an automation endpoint that was down when the event
 * fired is visible in Settings instead of vanishing.
 */
export async function dispatchEventWebhooks(event: WebhookEvent, data: unknown): Promise<{ sent: number; total: number }> {
  const subs = (await getEventWebhooks()).filter((s) => s.enabled && s.events.includes(event));
  if (subs.length === 0) return { sent: 0, total: 0 };
  const results = await Promise.allSettled(subs.map((s) => deliverWithRetry(() => attemptOne(s, event, data))));
  const at = new Date().toISOString();
  const rows: [string, { at: string; ok: boolean; status?: number; error?: string; attempts: number }][] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return; // deliverWithRetry never rejects; defensive only
    const out = r.value;
    if (out.ok) sent++;
    rows.push([
      webhookLogKey(subs[i].id),
      { at, ok: out.ok, ...(out.status ? { status: out.status } : {}), ...(out.ok ? {} : { error: describeOutcome(out) }), attempts: out.attempts },
    ]);
  });
  await recordDeliveries(rows);
  return { sent, total: subs.length };
}

/** Send a one-off test payload to a single (possibly unsaved) subscription, bypassing
 *  its `events` filter (a test should work even before any event is checked). Single
 *  attempt: the Test button is interactive and should answer immediately. */
export async function testEventWebhook(sub: WebhookSubscription): Promise<boolean> {
  return postOne(sub, 'receipt.parsed', { test: true, message: 'Pharos test webhook — delivery is working.' });
}
