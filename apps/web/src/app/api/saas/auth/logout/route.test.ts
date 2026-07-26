import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// POST /api/saas/auth/logout is the one call that ends a SaaS session — if it silently no-ops,
// a shared-machine user stays logged in after clicking "Sign out". Zero route-level coverage
// before this file. `clearAccountCookie` (the cookie-store delete) is mocked at the module
// boundary; `saasGuard` is pure and runs for REAL. This file covers what the ROUTE owns:
//   - the gate short-circuits (SAAS_MODE off → 404, AUTH_SECRET unset → 500) pass through
//     UNTOUCHED and, critically, the cookie is never touched before the gate decides,
//   - a passing gate clears the cookie exactly once, with no arguments, and returns { ok: true },
//   - it is idempotent: a second logout with no session left still succeeds (the UI must never
//     get an error for "already signed out"),
//   - a throw from the cookie store becomes a clean { error } 500 JSON (the saasGuard wrap),
//     not an HTML crash page mid-logout.

const { saasAuthGateMock, clearAccountCookieMock } = vi.hoisted(() => ({
  saasAuthGateMock: vi.fn((): NextResponse | null => null),
  clearAccountCookieMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/tenancy/accountSession', () => ({ clearAccountCookie: clearAccountCookieMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, zero env/DB reads) — run the real one so
  // the mid-throw test exercises production error shaping. Only the gate is stubbed.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  clearAccountCookieMock.mockResolvedValue(undefined);
});

describe('gate short-circuit', () => {
  it('SAAS_MODE off → the gate 404 passes through untouched, cookie never cleared', async () => {
    saasAuthGateMock.mockReturnValue(
      NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 }),
    );
    const res = await POST();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'SaaS mode is not enabled' });
    expect(clearAccountCookieMock).not.toHaveBeenCalled();
  });

  it('AUTH_SECRET unset → the gate 500 passes through untouched, cookie never cleared', async () => {
    saasAuthGateMock.mockReturnValue(
      NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 }),
    );
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'AUTH_SECRET is not configured' });
    expect(clearAccountCookieMock).not.toHaveBeenCalled();
  });

  it('the gate is consulted before any cookie work, exactly once per request', async () => {
    await POST();
    expect(saasAuthGateMock).toHaveBeenCalledTimes(1);
  });
});

describe('logout', () => {
  it('clears the account cookie exactly once and returns { ok: true }', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(clearAccountCookieMock).toHaveBeenCalledTimes(1);
  });

  it('clears the cookie with no arguments (nothing tenant- or account-specific to pass)', async () => {
    await POST();
    expect(clearAccountCookieMock).toHaveBeenCalledWith();
  });

  it('is idempotent: a second logout with no session left still returns 200 ok', async () => {
    const first = await POST();
    const second = await POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true });
    expect(clearAccountCookieMock).toHaveBeenCalledTimes(2);
  });

  it('a throw from the cookie store becomes a clean 500 JSON, not an HTML crash page', async () => {
    clearAccountCookieMock.mockRejectedValueOnce(new Error('cookies() outside request scope'));
    const res = await POST();
    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({
      error: 'cookies() outside request scope',
    });
  });
});
