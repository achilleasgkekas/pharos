import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/saas/billing/checkout is the ONLY route that mints a real Stripe Checkout
// Session — a bug here either lets a non-owner start billing, silently drops the audit
// trail, or leaks a raw Stripe error to the client. It has zero route-level coverage today
// (grep of api/saas/**/*.test.ts: only billing/webhook + invites/accept have one). This
// closes that gap for what the route itself is responsible for (session resolution +
// plan validation + Stripe call + response shaping); the already-unit-tested pure helpers
// (`checkoutablePlan`/`pickBaseUrl`/`checkoutUrls` in billingRoutes.test.ts,
// `checkoutAuditMeta` in checkoutAudit.test.ts) run for real here via plain import, only
// the session/Stripe/audit seams are mocked:
//   - resolveBillingSession's short-circuit response is passed straight through untouched,
//   - a missing/free/unknown plan → 400, never calls Stripe,
//   - Stripe not-configured → 503, any other Stripe failure → 502, neither audits,
//   - success → 200 with { url, id }, audits billing.checkout_started with the whitelisted
//     meta, and SAAS_PUBLIC_URL takes priority over the request origin for redirect URLs.

const { resolveBillingSessionMock, createCheckoutSessionMock, recordAuditMock } = vi.hoisted(() => ({
  resolveBillingSessionMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
  recordAuditMock: vi.fn(async () => true),
}));

vi.mock('@/lib/billing/billingSession', () => ({ resolveBillingSession: resolveBillingSessionMock }));
vi.mock('@/lib/billing/stripe', () => ({ createCheckoutSession: createCheckoutSessionMock }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx stays real (pure)
});

import { POST } from './route';
import { NextResponse } from 'next/server';

function makeReq(body: unknown, url = 'https://app.example.com/api/saas/billing/checkout'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

const SESSION = {
  session: {
    account: { sub: 'acc1', email: 'owner@example.com' },
    workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ctx: { tenantId: 'tenant1' },
    tenant: { slug: 'acme', billingCustomerId: null },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SAAS_PUBLIC_URL;
  delete process.env.APP_URL;
  resolveBillingSessionMock.mockResolvedValue(SESSION);
  createCheckoutSessionMock.mockResolvedValue({ ok: true, data: { id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' } });
  recordAuditMock.mockResolvedValue(true);
});

describe('session resolution', () => {
  it('passes through whatever resolveBillingSession short-circuits with (gate/401/403/404), never calls Stripe', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveBillingSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({ plan: 'shared' }));

    expect(res).toBe(blocked);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('forwards the tenant slug from the request body to resolveBillingSession', async () => {
    await POST(makeReq({ plan: 'shared', tenant: 'OtherSlug' }));
    expect(resolveBillingSessionMock).toHaveBeenCalledWith('OtherSlug');
  });

  it('omitted tenant → resolveBillingSession gets null (defaults to first workspace)', async () => {
    await POST(makeReq({ plan: 'shared' }));
    expect(resolveBillingSessionMock).toHaveBeenCalledWith(null);
  });
});

describe('plan validation', () => {
  it('missing plan → 400, never calls Stripe', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('free plan → 400 (not checkout-able), never calls Stripe', async () => {
    const res = await POST(makeReq({ plan: 'free' }));
    expect(res.status).toBe(400);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('unknown plan string → 400, never calls Stripe', async () => {
    const res = await POST(makeReq({ plan: 'enterprise' }));
    expect(res.status).toBe(400);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});

describe('Stripe call + response shaping', () => {
  it('Stripe not configured → 503, never audits', async () => {
    createCheckoutSessionMock.mockResolvedValueOnce({ ok: false, reason: 'not-configured' });
    const res = await POST(makeReq({ plan: 'shared' }));
    expect(res.status).toBe(503);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('any other Stripe failure → 502, never audits', async () => {
    createCheckoutSessionMock.mockResolvedValueOnce({ ok: false, reason: 'stripe request failed' });
    const res = await POST(makeReq({ plan: 'shared' }));
    expect(res.status).toBe(502);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('success → 200 with { url, id }, passes the resolved session fields to Stripe', async () => {
    const res = await POST(makeReq({ plan: 'dedicated' }));

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'dedicated',
        tenantId: 'tenant1',
        customerId: null,
        customerEmail: 'owner@example.com',
        successUrl: 'https://app.example.com/settings?billing=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://app.example.com/settings?billing=cancelled',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; id: string };
    expect(json).toEqual({ url: 'https://checkout.stripe.com/cs_123', id: 'cs_123' });
  });

  it('SAAS_PUBLIC_URL env takes priority over the request origin for redirect URLs', async () => {
    process.env.SAAS_PUBLIC_URL = 'https://pharos.app';
    await POST(makeReq({ plan: 'shared' }));
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: 'https://pharos.app/settings?billing=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://pharos.app/settings?billing=cancelled',
      })
    );
  });

  it('audits billing.checkout_started with the whitelisted plan + checkoutId only, after success', async () => {
    await POST(makeReq({ plan: 'shared' }));
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({
        action: 'billing.checkout_started',
        actor: 'acc1',
        target: 'acme',
        meta: { plan: 'shared', checkoutId: 'cs_123' },
      })
    );
  });
});
