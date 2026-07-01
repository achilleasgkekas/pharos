// Stripe billing client scaffold — NODE-ONLY. Deliberately DEPENDENCY-FREE: it talks to
// Stripe's REST API over `fetch` and verifies webhook signatures with node:crypto, so we
// add no npm dependency and the app type-checks/builds with or without Stripe configured.
//
// SAFETY: no real charge can happen from here. All network calls are guarded by
// `stripeConfigured()` (STRIPE_SECRET_KEY set). Keys come from env only (deferred by
// Achilleas) and are NEVER hardcoded/committed. When unconfigured, the create-* helpers
// return `{ ok: false, reason: 'not-configured' }` instead of throwing, so callers can
// degrade gracefully.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { stripePriceId, type PlanKey } from './plans';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Secret API key (server-side). Empty when Stripe is not set up. */
function secretKey(): string {
  return (process.env.STRIPE_SECRET_KEY || '').trim();
}

/** Webhook signing secret (whsec_…). Empty when not set up. */
export function webhookSecret(): string {
  return (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

/** True when the secret API key is present — the gate for every outbound Stripe call. */
export function stripeConfigured(): boolean {
  return secretKey().length > 0;
}

export type StripeResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Minimal form-encoded POST to the Stripe REST API. Never throws; returns a tagged
 *  result. Only called after `stripeConfigured()` has been checked by the helpers below. */
async function stripePost<T>(path: string, form: Record<string, string>): Promise<StripeResult<T>> {
  try {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const msg =
        (json as { error?: { message?: string } })?.error?.message || `stripe ${res.status}`;
      return { ok: false, reason: msg };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'stripe request failed' };
  }
}

/** Create a Checkout Session for a tenant to subscribe to a paid plan.
 *  Stub-safe: returns not-configured when Stripe keys / price IDs are absent. */
export async function createCheckoutSession(opts: {
  plan: PlanKey;
  tenantId: string;
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeResult<{ id: string; url: string | null }>> {
  if (!stripeConfigured()) return { ok: false, reason: 'not-configured' };
  const priceId = stripePriceId(opts.plan);
  if (!priceId) return { ok: false, reason: `no price configured for plan ${opts.plan}` };

  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // Carry the tenant id so the webhook can resolve which workspace was paid for.
    'metadata[tenantId]': opts.tenantId,
    'subscription_data[metadata][tenantId]': opts.tenantId,
    client_reference_id: opts.tenantId,
  };
  if (opts.customerId) form.customer = opts.customerId;
  else if (opts.customerEmail) form.customer_email = opts.customerEmail;

  return stripePost<{ id: string; url: string | null }>('/checkout/sessions', form);
}

/** Create a Billing Portal session so a tenant owner can manage/cancel their subscription.
 *  Stub-safe: not-configured when Stripe keys are absent or the tenant has no customer. */
export async function createPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<StripeResult<{ id: string; url: string }>> {
  if (!stripeConfigured()) return { ok: false, reason: 'not-configured' };
  if (!opts.customerId) return { ok: false, reason: 'tenant has no billing customer' };
  return stripePost<{ id: string; url: string }>('/billing_portal/sessions', {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
}

/**
 * Verify a Stripe webhook signature WITHOUT the Stripe SDK. Implements the documented
 * scheme: the `Stripe-Signature` header is `t=<unix>,v1=<hex hmac>[,v1=…]`; the signed
 * payload is `"<t>.<raw body>"`, HMAC-SHA256 with the endpoint's signing secret.
 *
 * @param rawBody  the EXACT raw request body string (must not be re-serialized JSON).
 * @param header   the `Stripe-Signature` header value.
 * @param secret   the endpoint signing secret (whsec_…); defaults to env.
 * @param toleranceSec  reject timestamps older/newer than this (replay guard, default 5m).
 * Returns true only on a constant-time match of at least one provided v1 signature.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string = webhookSecret(),
  toleranceSec = 300
): boolean {
  if (!secret || !header) return false;

  let timestamp = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (k === 't') timestamp = val;
    else if (k === 'v1') v1.push(val);
  }
  if (!timestamp || v1.length === 0) return false;

  // Replay window: timestamp must be a recent unix second.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  for (const sig of v1) {
    const sigBuf = Buffer.from(sig, 'utf8');
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) return true;
  }
  return false;
}
