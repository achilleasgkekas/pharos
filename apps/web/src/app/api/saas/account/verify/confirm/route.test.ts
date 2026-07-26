import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/verify/confirm is the redemption half of the email-verification flow and
// is UNAUTHENTICATED: the token clicked from the inbox IS the proof that the address belongs to
// the account, so the security surface is (a) lookup by HASH only, (b) expiry enforced, (c)
// single-use consumption, (d) one generic error for every failure mode so a caller cannot tell
// "unknown token" from "expired token". Zero route-level coverage before this file. Everything
// security-relevant runs for REAL here (hashVerifyToken/isVerifyTokenValid from
// lib/tenancy/emailVerify, readBody/strField, saasGuard), so the assertions hit the production
// hashing and expiry policy rather than stubs. Mocked seams: saasAuthGate, connectDB, Account.
// Covered here, and only what THIS route owns:
//   - the gate short-circuit passes through untouched, before the body is even read,
//   - a missing / blank / whitespace-only token is a 400 that lands before any DB work,
//   - the token is trimmed before hashing, so a copy-paste with stray whitespace still redeems,
//   - the lookup filter contains ONLY the SHA-256 hash — the plaintext never reaches Mongo,
//   - the projection pulls no email / passwordHash / profile fields,
//   - unknown / expired / missing-expiry / unparseable-expiry tokens all return the SAME generic
//     400 and never write,
//   - success: emailVerified is set and BOTH verify fields are nulled in the same patch — the
//     single-use property, so a replayed link finds nothing to redeem,
//   - the response carries no account information,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const { saasAuthGateMock, connectDBMock, accountFindOneSelect, accountFindOneMock } = vi.hoisted(() => {
  const accountFindOneSelect = vi.fn(async (_projection: string) => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindOneSelect,
    accountFindOneMock: vi.fn((_filter: Record<string, unknown>) => ({ select: accountFindOneSelect })),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findOne: accountFindOneMock } }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';
import { hashVerifyToken } from '@/lib/tenancy/emailVerify';

const TOKEN = 'a-perfectly-good-verify-token';
const INVALID = 'This verification link is invalid or has expired';

function makeReq(body: unknown = {}): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function future(msFromNow = 60_000): Date {
  return new Date(Date.now() + msFromNow);
}

/** A fake mongoose document: records what `.set()` wrote plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    emailVerified: false,
    verifyTokenHash: hashVerifyToken(TOKEN),
    verifyTokenExpires: future(),
    set: vi.fn(function (this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    save: vi.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  accountFindOneSelect.mockResolvedValue(null);
});

describe('POST /api/saas/account/verify/confirm — gating', () => {
  it('passes the SAAS_MODE-off 404 through untouched, before the body is read', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 }));
    const req = makeReq({ token: TOKEN });
    const jsonSpy = vi.spyOn(req, 'json' as never);

    const res = await POST(req);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'SaaS mode is not enabled' });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('passes the missing-AUTH_SECRET 500 through untouched (fail closed)', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 }));

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'AUTH_SECRET is not configured' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('consults the gate exactly once per request', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: TOKEN }));

    expect(saasAuthGateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/saas/account/verify/confirm — token validation', () => {
  const bad: Array<[string, unknown]> = [
    ['missing token', {}],
    ['empty string', { token: '' }],
    ['whitespace only', { token: '   ' }],
    ['null', { token: null }],
    ['false', { token: false }],
    ['unparseable body (readBody swallows the throw)', undefined],
  ];

  for (const [label, body] of bad) {
    it(`rejects ${label} with 400 and zero DB work`, async () => {
      const req =
        body === undefined
          ? ({
              json: async () => {
                throw new Error('not json');
              },
            } as unknown as NextRequest)
          : makeReq(body);

      const res = await POST(req);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'token is required' });
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(accountFindOneMock).not.toHaveBeenCalled();
    });
  }

  it('trims the token before hashing, so a copy-paste with stray whitespace still redeems', async () => {
    const account = makeAccount();
    accountFindOneSelect.mockResolvedValue(account);

    const res = await POST(makeReq({ token: `  ${TOKEN}\n` }));

    expect(res.status).toBe(200);
    expect(accountFindOneMock.mock.calls[0][0]).toEqual({ verifyTokenHash: hashVerifyToken(TOKEN) });
  });
});

describe('POST /api/saas/account/verify/confirm — lookup', () => {
  it('queries by the SHA-256 hash ONLY — the plaintext token never reaches Mongo', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: TOKEN }));

    const filter = accountFindOneMock.mock.calls[0][0];
    expect(filter).toEqual({ verifyTokenHash: hashVerifyToken(TOKEN) });
    expect(Object.keys(filter)).toEqual(['verifyTokenHash']);
    expect(JSON.stringify(filter)).not.toContain(TOKEN);
  });

  it('projects only the four fields it needs — no email, passwordHash or profile data', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: TOKEN }));

    expect(accountFindOneSelect).toHaveBeenCalledWith('_id verifyTokenHash verifyTokenExpires emailVerified');
    const projection = accountFindOneSelect.mock.calls[0][0];
    expect(projection).not.toMatch(/passwordHash|email\b|name/);
  });
});

describe('POST /api/saas/account/verify/confirm — generic failure (nothing to leak)', () => {
  const cases: Array<[string, Record<string, unknown> | null]> = [
    ['an unknown token (no row)', null],
    ['a token that expired an hour ago', { verifyTokenExpires: new Date(Date.now() - 60 * 60 * 1000) }],
    ['a token that expired 1ms ago', { verifyTokenExpires: new Date(Date.now() - 1) }],
    ['a null expiry (already consumed)', { verifyTokenExpires: null }],
    ['an undefined expiry', { verifyTokenExpires: undefined }],
    ['an unparseable expiry', { verifyTokenExpires: new Date('not-a-date') }],
  ];

  for (const [label, over] of cases) {
    it(`returns the same generic 400 for ${label}, with zero writes`, async () => {
      const account = over === null ? null : makeAccount(over);
      accountFindOneSelect.mockResolvedValue(account);

      const res = await POST(makeReq({ token: TOKEN }));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: INVALID });
      if (account) {
        expect(account.set).not.toHaveBeenCalled();
        expect(account.save).not.toHaveBeenCalled();
      }
    });
  }

  it('gives a byte-identical body for an unknown token and an expired one', async () => {
    accountFindOneSelect.mockResolvedValue(null);
    const unknown = await (await POST(makeReq({ token: TOKEN }))).text();

    accountFindOneSelect.mockResolvedValue(makeAccount({ verifyTokenExpires: new Date(Date.now() - 1000) }));
    const expired = await (await POST(makeReq({ token: TOKEN }))).text();

    expect(unknown).toBe(expired);
  });

  it('accepts an expiry stored as an ISO string (mongoose-hydrated or raw driver row)', async () => {
    accountFindOneSelect.mockResolvedValue(
      makeAccount({ verifyTokenExpires: future(120_000).toISOString() as unknown as Date })
    );

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/saas/account/verify/confirm — consumption', () => {
  it('marks the email verified and nulls BOTH verify fields in one patch (single-use)', async () => {
    const account = makeAccount();
    accountFindOneSelect.mockResolvedValue(account);

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(account.set).toHaveBeenCalledTimes(1);
    expect(account.set).toHaveBeenCalledWith({
      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpires: null,
    });
    expect(account.emailVerified).toBe(true);
    expect(account.verifyTokenHash).toBeNull();
    expect(account.verifyTokenExpires).toBeNull();
    expect(account.save).toHaveBeenCalledTimes(1);
  });

  it('leaves a replay with nothing to find: the consumed row no longer matches the hash', async () => {
    const account = makeAccount();
    accountFindOneSelect.mockResolvedValue(account);
    await POST(makeReq({ token: TOKEN }));

    // Second click of the same link — the hash was cleared, so the lookup misses.
    accountFindOneSelect.mockResolvedValue(null);
    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: INVALID });
  });

  it('is harmless for an already-verified account holding a live token', async () => {
    const account = makeAccount({ emailVerified: true });
    accountFindOneSelect.mockResolvedValue(account);

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(account.emailVerified).toBe(true);
    expect(account.verifyTokenHash).toBeNull();
  });

  it('returns exactly {"ok":true} — no account id, email or verification metadata', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const res = await POST(makeReq({ token: TOKEN }));

    expect(await res.text()).toBe('{"ok":true}');
  });
});

describe('POST /api/saas/account/verify/confirm — failure shaping', () => {
  it('turns a lookup throw into a clean 500 JSON, not an HTML crash page', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('mongo unreachable'));

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'mongo unreachable' });
  });

  it('turns a save throw into a clean 500 JSON', async () => {
    accountFindOneSelect.mockResolvedValue(
      makeAccount({
        save: vi.fn(async () => {
          throw new Error('write concern failed');
        }),
      })
    );

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'write concern failed' });
  });

  it('falls back to "Server error" when the thrown error carries no message', async () => {
    accountFindOneSelect.mockRejectedValue(new Error(''));

    const res = await POST(makeReq({ token: TOKEN }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Server error' });
  });

  it('truncates a huge error message at 200 chars so no internal dump reaches the client', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('x'.repeat(5000)));

    const body = (await (await POST(makeReq({ token: TOKEN }))).json()) as { error: string };

    expect(body.error).toHaveLength(200);
  });
});
