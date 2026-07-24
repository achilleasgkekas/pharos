import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/billing/portal mints a real Stripe Billing Portal session — a bug here
// either lets a non-owner manage billing, sends a workspace with no Stripe customer into a
// broken portal flow, or leaks a raw Stripe error. Zero route-level coverage today (mirrors
// the gap closed for the sibling checkout route). The already-unit-tested pure helpers
// (`pickBaseUrl`/`portalReturnUrl` in billingRoutes.test.ts, `portalAuditMeta` in
// portalAudit.test.ts) run for real here via plain import; only the session/Stripe/audit
// seams are mocked. Covers:
//   - resolveBillingSession's short-circuit response passed straight through,
//   - no billing customer on the tenant → 409, never calls Stripe,
//   - Stripe not-configured → 503, any other Stripe failure → 502, neither audits,
//   - success → 200 with { url, id }, audits billing.portal_opened with the whitelisted meta.

const { resolveBillingSessionMock, createPortalSessionMock, recordAuditMock } = vi.hoisted(() => ({
  resolveBillingSessionMock: vi.fn(),
  createPortalSessionMock: vi.fn(),
  recordAuditMock: vi.fn(async () => true),
}));

vi.mock('@/lib/billing/billingSession', () => ({ resolveBillingSession: resolveBillingSessionMock }));
vi.mock('@/lib/billing/stripe', () => ({ createPortalSession: createPortalSessionMock }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx stays real (pure)
});

import { POST } from './route';

function makeReq(body: unknown, url = 'https://app.example.com/api/saas/billing/portal'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(over: Record<string, unknown> = {}) {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'shared', status: 'active' },
      ctx: { tenantId: 'tenant1' },
      tenant: { slug: 'acme', plan: 'shared', billingCustomerId: 'cus_123', ...over },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SAAS_PUBLIC_URL;
  delete process.env.APP_URL;
  resolveBillingSessionMock.mockResolvedValue(makeSession());
  createPortalSessionMock.mockResolvedValue({ ok: true, data: { id: 'bps_123', url: 'https://billing.stripe.com/bps_123' } });
  recordAuditMock.mockResolvedValue(true);
});

describe('session resolution', () => {
  it('passes through whatever resolveBillingSession short-circuits with (gate/401/403/404), never calls Stripe', async () => {
    const blocked = NextResponse.json({ error: 'billing requires an owner or admin role' }, { status: 403 });
    resolveBillingSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({}));

    expect(res).toBe(blocked);
    expect(createPortalSessionMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('forwards the tenant slug from the request body to resolveBillingSession', async () => {
    await POST(makeReq({ tenant: 'OtherSlug' }));
    expect(resolveBillingSessionMock).toHaveBeenCalledWith('OtherSlug');
  });
});

describe('billing customer check', () => {
  it('no billing customer on the tenant → 409, never calls Stripe', async () => {
    resolveBillingSessionMock.mockResolvedValueOnce(makeSession({ billingCustomerId: null }));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(409);
    expect(createPortalSessionMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});

describe('Stripe call + response shaping', () => {
  it('Stripe not configured → 503, never audits', async () => {
    createPortalSessionMock.mockResolvedValueOnce({ ok: false, reason: 'not-configured' });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(503);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('any other Stripe failure → 502, never audits', async () => {
    createPortalSessionMock.mockResolvedValueOnce({ ok: false, reason: 'stripe request failed' });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(502);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('success → 200 with { url, id }, passes the resolved customerId + return URL to Stripe', async () => {
    const res = await POST(makeReq({}));

    expect(createPortalSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_123',
        returnUrl: 'https://app.example.com/settings?billing=portal_return',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; id: string };
    expect(json).toEqual({ url: 'https://billing.stripe.com/bps_123', id: 'bps_123' });
  });

  it('SAAS_PUBLIC_URL env takes priority over the request origin for the return URL', async () => {
    process.env.SAAS_PUBLIC_URL = 'https://pharos.app';
    await POST(makeReq({}));
    expect(createPortalSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ returnUrl: 'https://pharos.app/settings?billing=portal_return' })
    );
  });

  it('audits billing.portal_opened with the whitelisted plan + portalId only, after success', async () => {
    await POST(makeReq({}));
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({
        action: 'billing.portal_opened',
        actor: 'acc1',
        target: 'acme',
        meta: { plan: 'shared', portalId: 'bps_123' },
      })
    );
  });
});
