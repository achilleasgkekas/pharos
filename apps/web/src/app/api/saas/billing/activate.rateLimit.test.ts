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
// So these cover the properties the limiter exists for:
//   1. the IP key trips BEFORE resolveBillingSession, i.e. a flood cannot make the server
//      do database work on its behalf;
//   2. the account key trips even when the IP changes every request;
//   3. the paywall is guarded even on a deployment that never set the general API_RATE_LIMIT,
//      because this endpoint has its own budget and its own default.

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

const ENV_KEYS = [
  'API_RATE_LIMIT',
  'API_RATE_WINDOW_MS',
  'SAAS_ACTIVATE_RATE_LIMIT',
  'SAAS_ACTIVATE_RATE_WINDOW_MS',
] as const;
const orig = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  rateStore.clear();
  vi.clearAllMocks();
  resolveBillingSessionMock.mockResolvedValue(SESSION);
  resolveActivationMock.mockReturnValue({ ok: false, reason: 'unknown-code' });
  // The general budget is deliberately left UNSET in most cases: this route must not depend
  // on it. Where a case needs a specific activation budget it sets it itself.
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SAAS_ACTIVATE_RATE_LIMIT = '3';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (orig[k] === undefined) delete process.env[k];
    else process.env[k] = orig[k];
  }
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

  it('guards the paywall even when the general API_RATE_LIMIT was never set', async () => {
    // The whole point of a dedicated budget: a deployment that forgot the general limiter
    // still cannot be brute-forced for a paid plan. Default is 5 per hour.
    delete process.env.SAAS_ACTIVATE_RATE_LIMIT;
    expect(process.env.API_RATE_LIMIT).toBeUndefined();

    for (let i = 0; i < 5; i++) {
      const res = await POST(req('9.9.9.9'));
      expect(res.status).toBe(400);
    }

    const blocked = await POST(req('9.9.9.9'));
    expect(blocked.status).toBe(429);
  });

  it('holds the door shut for a full hour by default, not a minute', async () => {
    delete process.env.SAAS_ACTIVATE_RATE_LIMIT;
    for (let i = 0; i < 5; i++) await POST(req('9.9.9.9'));

    const blocked = await POST(req('9.9.9.9'));
    // 30/min would let a script have ~43k tries a day; 5/hour is the point of the change.
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(60 * 50);
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('can be switched off deliberately, with an explicit 0', async () => {
    process.env.SAAS_ACTIVATE_RATE_LIMIT = '0';

    for (let i = 0; i < 25; i++) {
      const res = await POST(req('9.9.9.9'));
      expect(res.status).toBe(400);
    }
  });

  it('falls back to the default when the env value is a typo, never to off', async () => {
    process.env.SAAS_ACTIVATE_RATE_LIMIT = 'ten';

    for (let i = 0; i < 5; i++) {
      const res = await POST(req('9.9.9.9'));
      expect(res.status).toBe(400);
    }
    const blocked = await POST(req('9.9.9.9'));
    expect(blocked.status).toBe(429);
  });

  it('lets a valid code through and activates the plan', async () => {
    resolveActivationMock.mockReturnValue({ ok: true, plan: 'shared' });

    const res = await POST(req('9.9.9.9', 'FRIENDS-2026'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, plan: 'shared' });
    expect(tenantUpdateMock).toHaveBeenCalledOnce();
  });
});
