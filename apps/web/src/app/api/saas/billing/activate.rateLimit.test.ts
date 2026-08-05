import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Rate limiting on POST /api/saas/billing/activate.
//
// Activation codes are the ONLY door to a paid plan and they are human-shaped
// (`FRIENDS-2026`), not random bytes. The route already refuses to say WHICH half of a wrong
// guess landed, but that only stops a guess becoming a method; it does nothing about a guess
// becoming a loop. Anyone can sign up for free and own a workspace, so reaching the code
// check is not a privilege worth counting on.
//
// So these cover the two properties the limiter exists for:
//   1. the IP key trips BEFORE resolveBillingSession, i.e. a flood cannot make the server
//      do database work on its behalf;
//   2. the account key trips even when the IP changes every request.
// Plus the one property that must NOT change: with API_RATE_LIMIT unset (the self-hosted
// default) the limiter is inert.

// `resolveActivation` returns a discriminated union (ok:true + plan | ok:false + reason), so
// the mock is typed on the union rather than inferred from its first return value.
type Activation = { ok: true; plan: string } | { ok: false; reason: string };

const { resolveBillingSessionMock, tenantUpdateMock, recordAuditMock, resolveActivationMock } =
  vi.hoisted(() => ({
    resolveBillingSessionMock: vi.fn(),
    tenantUpdateMock: vi.fn(async () => ({})),
    recordAuditMock: vi.fn(async () => {}),
    // Typed as the full union, not inferred from the default: without this the mock's
    // return type narrows to the failure branch and a success-case mockReturnValue below
    // stops type-checking the moment resolveActivation gained its `plan` field.
    resolveActivationMock: vi.fn<() => Activation>(() => ({ ok: false, reason: 'unknown-code' })),
  }));

vi.mock('@/lib/billing/billingSession', () => ({
  resolveBillingSession: resolveBillingSessionMock,
}));
vi.mock('@/lib/tenancy/audit', () => ({
  recordAudit: recordAuditMock,
  auditCtx: (t: string) => ({ tenantId: t }),
}));
vi.mock('@/lib/billing/activationCode', () => ({ resolveActivation: resolveActivationMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { updateOne: tenantUpdateMock } }));

import { POST } from './activate/route';
import { rateStore } from '@/lib/apiRateLimit';

/** Minimal NextRequest stand-in: the route only reads the body and the IP headers. */
function req(ip: string, code = 'GUESS-1'): NextRequest {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'x-forwarded-for' ? ip : null) },
    json: async () => ({ code }),
  } as unknown as NextRequest;
}

const SESSION = {
  session: {
    account: { sub: 'acct-1', email: 'a@example.com' },
    workspace: { slug: 'acme', role: 'owner' },
    ctx: { tenantId: 'tid-1' },
    tenant: { _id: 'tid-1', slug: 'acme' },
  },
};

const origLimit = process.env.API_RATE_LIMIT;
const origWindow = process.env.API_RATE_WINDOW_MS;

beforeEach(() => {
  rateStore.clear();
  vi.clearAllMocks();
  resolveBillingSessionMock.mockResolvedValue(SESSION);
  resolveActivationMock.mockReturnValue({ ok: false, reason: 'unknown-code' });
  process.env.API_RATE_LIMIT = '3';
  process.env.API_RATE_WINDOW_MS = '60000';
});

afterEach(() => {
  if (origLimit === undefined) delete process.env.API_RATE_LIMIT;
  else process.env.API_RATE_LIMIT = origLimit;
  if (origWindow === undefined) delete process.env.API_RATE_WINDOW_MS;
  else process.env.API_RATE_WINDOW_MS = origWindow;
});

describe('POST /api/saas/billing/activate rate limiting', () => {
  it('refuses the guess past the limit from one IP, with 429 and Retry-After', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(req('9.9.9.9'));
      expect(res.status).toBe(400); // rejected code, but allowed through
    }

    const blocked = await POST(req('9.9.9.9'));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('trips the IP key BEFORE any session lookup or database work', async () => {
    for (let i = 0; i < 3; i++) await POST(req('9.9.9.9'));
    resolveBillingSessionMock.mockClear();
    recordAuditMock.mockClear();

    const blocked = await POST(req('9.9.9.9'));

    expect(blocked.status).toBe(429);
    // The whole point of the early placement: the flood buys no server work.
    expect(resolveBillingSessionMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('still stops the same account when every request comes from a fresh IP', async () => {
    // Each request looks new to the IP key, so only the account key can catch this.
    for (let i = 0; i < 3; i++) {
      const res = await POST(req(`10.0.0.${i}`));
      expect(res.status).toBe(400);
    }

    const blocked = await POST(req('10.0.0.99'));
    expect(blocked.status).toBe(429);
  });

  it('does not let one account eat another account\'s budget', async () => {
    for (let i = 0; i < 3; i++) await POST(req(`10.0.0.${i}`));

    resolveBillingSessionMock.mockResolvedValue({
      session: { ...SESSION.session, account: { sub: 'acct-2', email: 'b@example.com' } },
    });
    const other = await POST(req('10.0.0.50'));
    expect(other.status).toBe(400);
  });

  it('is inert when API_RATE_LIMIT is unset (self-hosted default)', async () => {
    delete process.env.API_RATE_LIMIT;

    for (let i = 0; i < 25; i++) {
      const res = await POST(req('9.9.9.9'));
      expect(res.status).toBe(400);
    }
  });

  it('lets a valid code through and activates the plan', async () => {
    resolveActivationMock.mockReturnValue({ ok: true, plan: 'shared' });

    const res = await POST(req('9.9.9.9', 'FRIENDS-2026'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, plan: 'shared' });
    expect(tenantUpdateMock).toHaveBeenCalledOnce();
  });
});
