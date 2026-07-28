import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  stripeConfigured,
  webhookSecret,
  createCheckoutSession,
  createPortalSession,
  verifyStripeSignature,
} from './stripe';

// Το ΤΕΛΕΥΤΑΙΟ untested module του SaaS territory, και το μόνο που αγγίζει χρήματα.
// Δύο ξεχωριστά συμβόλαια δοκιμάζονται εδώ:
//   1. «καμία χρέωση δεν μπορεί να συμβεί χωρίς keys» — κάθε create-* helper πρέπει να
//      γυρίζει not-configured ΧΩΡΙΣ να αγγίξει το δίκτυο. Αν αυτό σπάσει, ένα
//      self-hosted deployment αρχίζει να χτυπά το api.stripe.com.
//   2. verifyStripeSignature — ο ΜΟΝΟΣ φύλακας του webhook. Ό,τι περνά από εδώ
//      αναβαθμίζει plan / ξεκλειδώνει entitlements, άρα ένα χαλαρό branch = δωρεάν
//      αναβαθμίσεις από οποιονδήποτε ξέρει το URL.
// Μηδέν δίκτυο: το fetch stub-άρεται· μηδέν πραγματικά keys.

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_SHARED',
  'STRIPE_PRICE_DEDICATED',
] as const;

const originals = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<
  string,
  string | undefined
>;

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, originals[k]);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** fetch stub που καταγράφει τις κλήσεις και γυρίζει προκαθορισμένη απάντηση. */
function stubFetch(res: { ok: boolean; status?: number; json?: unknown } | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (res instanceof Error) throw res;
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 400),
      json: async () => res.json ?? {},
    };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

/** Τα form fields του τελευταίου POST, ως απλό object. */
function formOf(call: { init: RequestInit }): Record<string, string> {
  const params = new URLSearchParams(String(call.init.body));
  return Object.fromEntries(params.entries());
}

const CHECKOUT = {
  plan: 'shared' as const,
  tenantId: 'ten_123',
  successUrl: 'https://app.ph-aros.com/account/workspace/billing?ok=1',
  cancelUrl: 'https://app.ph-aros.com/account/workspace/billing?cancel=1',
};

describe('stripeConfigured / webhookSecret', () => {
  it('is unconfigured when the secret key is unset — the self-hosted default', () => {
    setEnv('STRIPE_SECRET_KEY', undefined);
    expect(stripeConfigured()).toBe(false);
  });

  it('treats empty / whitespace-only keys as unconfigured', () => {
    // Ένα κενό STRIPE_SECRET_KEY= σε .env δεν επιτρέπεται να μοιάζει με «ρυθμισμένο»,
    // αλλιώς θα στέλναμε `Authorization: Bearer ` στο Stripe και θα παίρναμε 401 αντί
    // για καθαρό not-configured.
    for (const v of ['', '   ', '\t', '\n']) {
      setEnv('STRIPE_SECRET_KEY', v);
      expect(stripeConfigured()).toBe(false);
    }
  });

  it('is configured once a non-empty key is present', () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    expect(stripeConfigured()).toBe(true);
  });

  it('re-reads env on every call (a key added at runtime takes effect immediately)', () => {
    setEnv('STRIPE_SECRET_KEY', undefined);
    expect(stripeConfigured()).toBe(false);
    setEnv('STRIPE_SECRET_KEY', 'sk_live_x');
    expect(stripeConfigured()).toBe(true);
    setEnv('STRIPE_SECRET_KEY', undefined);
    expect(stripeConfigured()).toBe(false);
  });

  it('webhookSecret trims and defaults to empty string, never undefined', () => {
    setEnv('STRIPE_WEBHOOK_SECRET', undefined);
    expect(webhookSecret()).toBe('');
    setEnv('STRIPE_WEBHOOK_SECRET', '  whsec_abc  ');
    expect(webhookSecret()).toBe('whsec_abc');
  });
});

describe('createCheckoutSession', () => {
  it('returns not-configured WITHOUT any network call when Stripe keys are absent', async () => {
    // Το πιο load-bearing test του module: ένα self-hosted install δεν επιτρέπεται να
    // κάνει ούτε ένα outbound request προς το Stripe.
    setEnv('STRIPE_SECRET_KEY', undefined);
    setEnv('STRIPE_PRICE_SHARED', 'price_shared');
    const { fn } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: false, reason: 'not-configured' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('refuses (and does not call Stripe) when the plan has no configured price id', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', undefined);
    const { fn } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    const r = await createCheckoutSession(CHECKOUT);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('shared');
    expect(fn).not.toHaveBeenCalled();
  });

  it('refuses the free plan — it has no Stripe price by definition', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    const { fn } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    const r = await createCheckoutSession({ ...CHECKOUT, plan: 'free' });

    expect(r.ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('posts a subscription checkout carrying the tenant id in THREE places', async () => {
    // metadata + subscription_data.metadata + client_reference_id. Ο webhook handler
    // χρειάζεται να βρει το tenant είτε από το session είτε από το subscription object,
    // και τα δύο μονοπάτια πρέπει να δουλεύουν — αλλιώς μια πληρωμή φτάνει χωρίς να
    // ξέρουμε ποιο workspace να αναβαθμίσουμε.
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_shared_123');
    const { calls } = stubFetch({ ok: true, json: { id: 'cs_1', url: 'https://pay/x' } });

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: true, data: { id: 'cs_1', url: 'https://pay/x' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(calls[0].init.method).toBe('POST');
    const form = formOf(calls[0]);
    expect(form.mode).toBe('subscription');
    expect(form['line_items[0][price]']).toBe('price_shared_123');
    expect(form['line_items[0][quantity]']).toBe('1');
    expect(form.success_url).toBe(CHECKOUT.successUrl);
    expect(form.cancel_url).toBe(CHECKOUT.cancelUrl);
    expect(form['metadata[tenantId]']).toBe('ten_123');
    expect(form['subscription_data[metadata][tenantId]']).toBe('ten_123');
    expect(form.client_reference_id).toBe('ten_123');
  });

  it('sends the secret key as a bearer token and form-encodes the body', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_secret');
    setEnv('STRIPE_PRICE_DEDICATED', 'price_ded');
    const { calls } = stubFetch({ ok: true, json: { id: 'cs_2' } });

    await createCheckoutSession({ ...CHECKOUT, plan: 'dedicated' });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_secret');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(typeof calls[0].init.body).toBe('string');
  });

  it('prefers an existing customer id over the email (no duplicate Stripe customers)', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    const { calls } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    await createCheckoutSession({
      ...CHECKOUT,
      customerId: 'cus_existing',
      customerEmail: 'owner@example.com',
    });

    const form = formOf(calls[0]);
    expect(form.customer).toBe('cus_existing');
    expect(form.customer_email).toBeUndefined();
  });

  it('falls back to customer_email when there is no customer id yet (first purchase)', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    const { calls } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    await createCheckoutSession({
      ...CHECKOUT,
      customerId: null,
      customerEmail: 'owner@example.com',
    });

    const form = formOf(calls[0]);
    expect(form.customer_email).toBe('owner@example.com');
    expect(form.customer).toBeUndefined();
  });

  it('sends neither customer field when both are absent', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    const { calls } = stubFetch({ ok: true, json: { id: 'cs_1' } });

    await createCheckoutSession({ ...CHECKOUT, customerId: null, customerEmail: null });

    const form = formOf(calls[0]);
    expect(form.customer).toBeUndefined();
    expect(form.customer_email).toBeUndefined();
  });

  it("surfaces Stripe's own error message on a non-2xx response", async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    stubFetch({ ok: false, status: 402, json: { error: { message: 'Your card was declined.' } } });

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: false, reason: 'Your card was declined.' });
  });

  it('falls back to the status code when the error body has no message', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    stubFetch({ ok: false, status: 500, json: {} });

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: false, reason: 'stripe 500' });
  });

  it('never throws on a network failure — it returns a tagged result', async () => {
    // Ο caller είναι route handler: ένα throw εδώ θα γινόταν 500 στον πελάτη αντί για
    // ένα «δοκίμασε ξανά» μήνυμα στο billing panel.
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    stubFetch(new Error('ECONNREFUSED'));

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: false, reason: 'ECONNREFUSED' });
  });

  it('survives a non-JSON success body (json() rejecting) without throwing', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    setEnv('STRIPE_PRICE_SHARED', 'price_s');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      }))
    );

    const r = await createCheckoutSession(CHECKOUT);

    expect(r).toEqual({ ok: true, data: {} });
  });
});

describe('createPortalSession', () => {
  it('returns not-configured WITHOUT a network call when Stripe is absent', async () => {
    setEnv('STRIPE_SECRET_KEY', undefined);
    const { fn } = stubFetch({ ok: true, json: { id: 'bps_1', url: 'https://portal' } });

    const r = await createPortalSession({ customerId: 'cus_1', returnUrl: 'https://back' });

    expect(r).toEqual({ ok: false, reason: 'not-configured' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('refuses an empty customer id instead of asking Stripe about nobody', async () => {
    // Ένα tenant που δεν πλήρωσε ποτέ δεν έχει customer· χωρίς αυτόν τον έλεγχο θα
    // στέλναμε `customer=` και θα δείχναμε το ακατάληπτο σφάλμα του Stripe στον χρήστη.
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    const { fn } = stubFetch({ ok: true, json: {} });

    const r = await createPortalSession({ customerId: '', returnUrl: 'https://back' });

    expect(r).toEqual({ ok: false, reason: 'tenant has no billing customer' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('checks configuration BEFORE the customer id (an unconfigured install says so first)', async () => {
    setEnv('STRIPE_SECRET_KEY', undefined);
    const r = await createPortalSession({ customerId: '', returnUrl: 'https://back' });
    expect(r).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('posts customer + return_url to the billing portal endpoint', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    const { calls } = stubFetch({ ok: true, json: { id: 'bps_1', url: 'https://portal/x' } });

    const r = await createPortalSession({ customerId: 'cus_9', returnUrl: 'https://back/here' });

    expect(r).toEqual({ ok: true, data: { id: 'bps_1', url: 'https://portal/x' } });
    expect(calls[0].url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(formOf(calls[0])).toEqual({ customer: 'cus_9', return_url: 'https://back/here' });
  });

  it('never throws on a network failure', async () => {
    setEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    stubFetch(new Error('socket hang up'));

    const r = await createPortalSession({ customerId: 'cus_9', returnUrl: 'https://back' });

    expect(r).toEqual({ ok: false, reason: 'socket hang up' });
  });
});

describe('verifyStripeSignature', () => {
  const SECRET = 'whsec_test_secret';
  const BODY = '{"id":"evt_1","type":"checkout.session.completed"}';

  /** Το documented scheme του Stripe: HMAC-SHA256 πάνω στο `<t>.<raw body>`. */
  function sign(body: string, ts: number, secret = SECRET): string {
    return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  }

  function headerFor(body: string, ts: number, secret = SECRET): string {
    return `t=${ts},v1=${sign(body, ts, secret)}`;
  }

  function nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  it('accepts a correctly signed, fresh payload', () => {
    const ts = nowSec();
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts), SECRET)).toBe(true);
  });

  it('rejects when the body was tampered with by a single byte', () => {
    // Το σημείο όλης της υπογραφής: το payload καθορίζει το plan upgrade.
    const ts = nowSec();
    const header = headerFor(BODY, ts);
    const tampered = BODY.replace('evt_1', 'evt_2');
    expect(verifyStripeSignature(tampered, header, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const ts = nowSec();
    const header = headerFor(BODY, ts, 'whsec_attacker');
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
  });

  it('rejects when the timestamp is swapped after signing (the t is part of the mac)', () => {
    const ts = nowSec();
    const good = sign(BODY, ts);
    expect(verifyStripeSignature(BODY, `t=${ts - 1},v1=${good}`, SECRET)).toBe(false);
  });

  it('fails closed with no secret — an unconfigured webhook accepts NOTHING', () => {
    // Χωρίς αυτό, ένα deployment χωρίς STRIPE_WEBHOOK_SECRET θα δεχόταν κάθε POST ως
    // αυθεντικό γεγονός Stripe, δηλαδή δωρεάν αναβαθμίσεις με ένα curl.
    const ts = nowSec();
    const header = headerFor(BODY, ts);
    expect(verifyStripeSignature(BODY, header, '')).toBe(false);
  });

  it('fails closed with a missing/empty signature header', () => {
    for (const h of [null, undefined, '']) {
      expect(verifyStripeSignature(BODY, h, SECRET)).toBe(false);
    }
  });

  it('rejects a header with a timestamp but no v1 signature', () => {
    expect(verifyStripeSignature(BODY, `t=${nowSec()}`, SECRET)).toBe(false);
  });

  it('rejects a header with a v1 signature but no timestamp', () => {
    expect(verifyStripeSignature(BODY, `v1=${sign(BODY, nowSec())}`, SECRET)).toBe(false);
  });

  it('rejects garbage headers without throwing', () => {
    for (const h of ['garbage', ',,,', 't=,v1=', 'v0=abc', '=', 't==,v1==']) {
      expect(() => verifyStripeSignature(BODY, h, SECRET)).not.toThrow();
      expect(verifyStripeSignature(BODY, h, SECRET)).toBe(false);
    }
  });

  it('rejects a non-numeric timestamp instead of coercing it', () => {
    const header = `t=abc,v1=${sign(BODY, nowSec())}`;
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
  });

  it('accepts when ANY of several v1 signatures matches (key rotation)', () => {
    // Το Stripe στέλνει πολλαπλά v1 κατά τη διάρκεια rotation του signing secret.
    const ts = nowSec();
    const header = `t=${ts},v1=${'0'.repeat(64)},v1=${sign(BODY, ts)}`;
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(true);
  });

  it('rejects when every provided v1 is wrong', () => {
    const ts = nowSec();
    const header = `t=${ts},v1=${'0'.repeat(64)},v1=${'f'.repeat(64)}`;
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(false);
  });

  it('ignores unknown scheme fields around the ones it needs', () => {
    const ts = nowSec();
    const header = `t=${ts},v0=deadbeef,v1=${sign(BODY, ts)},foo=bar`;
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(true);
  });

  it('tolerates whitespace around header keys and values', () => {
    const ts = nowSec();
    const header = ` t = ${ts} , v1 = ${sign(BODY, ts)} `;
    expect(verifyStripeSignature(BODY, header, SECRET)).toBe(true);
  });

  it('rejects a signature of the wrong length without throwing (timingSafeEqual guard)', () => {
    // node:crypto timingSafeEqual ΠΕΤΑΕΙ σε άνισα μήκη· ο length έλεγχος πριν από αυτό
    // είναι ο λόγος που ένα κομμένο v1 γυρίζει false αντί για 500.
    const ts = nowSec();
    const short = sign(BODY, ts).slice(0, 10);
    expect(() => verifyStripeSignature(BODY, `t=${ts},v1=${short}`, SECRET)).not.toThrow();
    expect(verifyStripeSignature(BODY, `t=${ts},v1=${short}`, SECRET)).toBe(false);
    const long = sign(BODY, ts) + 'ff';
    expect(verifyStripeSignature(BODY, `t=${ts},v1=${long}`, SECRET)).toBe(false);
  });

  it('is case-sensitive on the hex digest (lowercase is the contract)', () => {
    const ts = nowSec();
    const upper = sign(BODY, ts).toUpperCase();
    expect(verifyStripeSignature(BODY, `t=${ts},v1=${upper}`, SECRET)).toBe(false);
  });

  it('rejects a replayed event older than the tolerance window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const old = nowSec() - 301; // default tolerance 300s
    expect(verifyStripeSignature(BODY, headerFor(BODY, old), SECRET)).toBe(false);
  });

  it('accepts exactly at the tolerance boundary (past and future)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    expect(verifyStripeSignature(BODY, headerFor(BODY, nowSec() - 300), SECRET)).toBe(true);
    expect(verifyStripeSignature(BODY, headerFor(BODY, nowSec() + 300), SECRET)).toBe(true);
  });

  it('rejects a timestamp too far in the FUTURE too (clock-skew abuse)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    expect(verifyStripeSignature(BODY, headerFor(BODY, nowSec() + 301), SECRET)).toBe(false);
  });

  it('honours a custom tolerance in both directions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const ts = nowSec() - 30;
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts), SECRET, 60)).toBe(true);
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts), SECRET, 10)).toBe(false);
  });

  it('defaults the secret to STRIPE_WEBHOOK_SECRET from env', () => {
    setEnv('STRIPE_WEBHOOK_SECRET', SECRET);
    const ts = nowSec();
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts))).toBe(true);

    setEnv('STRIPE_WEBHOOK_SECRET', 'whsec_other');
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts))).toBe(false);

    setEnv('STRIPE_WEBHOOK_SECRET', undefined);
    expect(verifyStripeSignature(BODY, headerFor(BODY, ts))).toBe(false);
  });

  it('verifies the RAW body byte-for-byte, not a re-serialized equivalent', () => {
    // Πινάρει το documented συμβόλαιο: ο route handler ΠΡΕΠΕΙ να περνά το raw text.
    // Ένα JSON.parse→JSON.stringify round-trip αλλάζει το whitespace και σκοτώνει
    // κάθε νόμιμο webhook — σφάλμα που θα έμοιαζε με «λάθος secret».
    const raw = '{\n  "id": "evt_1"\n}';
    const ts = nowSec();
    const header = headerFor(raw, ts);
    expect(verifyStripeSignature(raw, header, SECRET)).toBe(true);
    expect(verifyStripeSignature(JSON.stringify(JSON.parse(raw)), header, SECRET)).toBe(false);
  });

  it('handles an empty body deterministically (signed empty verifies, unsigned does not)', () => {
    const ts = nowSec();
    expect(verifyStripeSignature('', headerFor('', ts), SECRET)).toBe(true);
    expect(verifyStripeSignature('', headerFor(BODY, ts), SECRET)).toBe(false);
  });

  it('handles multi-byte UTF-8 bodies (Greek workspace names in event metadata)', () => {
    const body = '{"name":"Πλαίσιο","emoji":"🚀"}';
    const ts = nowSec();
    expect(verifyStripeSignature(body, headerFor(body, ts), SECRET)).toBe(true);
    expect(verifyStripeSignature(body + ' ', headerFor(body, ts), SECRET)).toBe(false);
  });
});
