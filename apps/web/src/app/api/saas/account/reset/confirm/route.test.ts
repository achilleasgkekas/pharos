import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/reset/confirm is the redemption half of the forgot-password flow and
// the only UNAUTHENTICATED route that can overwrite a password: the presented token IS the
// proof of ownership, so the whole security surface is (a) lookup by HASH only, (b) expiry
// enforced, (c) single-use consumption, (d) one generic error for every failure mode so a
// caller cannot tell "unknown token" from "expired token". Zero route-level coverage before
// this file. Everything security-relevant runs for REAL here (hashResetToken/isResetTokenValid/
// resetPasswordError from lib/tenancy/passwordReset, readBody/strField, saasGuard), so the
// assertions hit the production policy and hashing rather than stubs. Mocked seams: saasAuthGate,
// connectDB, the Account model, and hashPassword (determinism — it has its own coverage).
// Covered here, and only what THIS route owns:
//   - the gate short-circuit passes through untouched, before the body is even read,
//   - validation ORDER: a missing token beats the password policy, and both land before any DB,
//   - the lookup filter contains ONLY the SHA-256 hash — the plaintext token never reaches Mongo,
//   - the projection pulls no password/email/profile fields,
//   - unknown / expired / missing-expiry / unparseable-expiry tokens all return the SAME generic
//     400 and never write,
//   - success: the stored hash comes from hashPassword (never the raw password) and BOTH reset
//     fields are nulled in the same patch — the single-use property,
//   - the response carries no account information,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const { saasAuthGateMock, connectDBMock, accountFindOneSelect, accountFindOneMock, hashPasswordMock } =
  vi.hoisted(() => {
    const accountFindOneSelect = vi.fn(async (_projection: string) => null as Record<string, unknown> | null);
    return {
      saasAuthGateMock: vi.fn(() => null as NextResponse | null),
      connectDBMock: vi.fn(async () => {}),
      accountFindOneSelect,
      accountFindOneMock: vi.fn((_filter: Record<string, unknown>) => ({ select: accountFindOneSelect })),
      hashPasswordMock: vi.fn((plain: string) => `hashed:${plain}`),
    };
  });

const rateLimitMock = vi.fn<(key: string) => NextResponse | null>(() => null);
const clientIpMock = vi.fn(() => '1.2.3.4');
vi.mock('@/lib/apiAuth', () => ({
  rateLimit: (k: string) => rateLimitMock(k),
  clientIp: () => clientIpMock(),
}));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findOne: accountFindOneMock } }));
vi.mock('@/lib/auth', () => ({ hashPassword: hashPasswordMock, assertCanWrite: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/accountSession', () => ({}));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';
import { hashResetToken } from '@/lib/tenancy/passwordReset';

const TOKEN = 'a-perfectly-good-reset-token';
const GOOD_PASSWORD = 'brand-new-secret';
const INVALID = 'This reset link is invalid or has expired';

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
    resetTokenHash: hashResetToken(TOKEN),
    resetTokenExpires: future(),
    sessionEpoch: 5,
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

describe('POST /api/saas/account/reset/confirm — gating', () => {
  it('passes the SAAS_MODE-off 404 through untouched, before the body is read', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 }));
    const req = makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD });
    const jsonSpy = vi.spyOn(req, 'json' as never);

    const res = await POST(req);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'SaaS mode is not enabled' });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('passes the AUTH_SECRET-unset 500 through untouched', async () => {
    saasAuthGateMock.mockReturnValue(
      NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 })
    );

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(500);
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('consults the gate exactly once per request', async () => {
    await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));
    expect(saasAuthGateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/saas/account/reset/confirm — validation', () => {
  it.each([
    ['missing', {}],
    ['blank', { token: '   ' }],
    ['null', { token: null }],
  ])('rejects a %s token with 400 and never touches the DB', async (_label, body) => {
    const res = await POST(makeReq({ ...body, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'token is required' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('checks the token BEFORE the password policy when both are bad', async () => {
    const res = await POST(makeReq({ newPassword: 'short' }));

    await expect(res.json()).resolves.toEqual({ error: 'token is required' });
  });

  it.each([
    ['missing', {}],
    ['too short', { newPassword: 'abc' }],
    ['one char under the minimum', { newPassword: '1234567' }],
    ['empty string', { newPassword: '' }],
  ])('rejects a %s password with the policy 400, before any DB work', async (_label, body) => {
    const res = await POST(makeReq({ token: TOKEN, ...body }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Password must be at least 8 characters' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindOneMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it('accepts a password of exactly the minimum length', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const res = await POST(makeReq({ token: TOKEN, newPassword: '12345678' }));

    expect(res.status).toBe(200);
    expect(hashPasswordMock).toHaveBeenCalledWith('12345678');
  });

  it('trims surrounding whitespace off the token before hashing it', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: `  ${TOKEN}  `, newPassword: GOOD_PASSWORD }));

    expect(accountFindOneMock).toHaveBeenCalledWith({ resetTokenHash: hashResetToken(TOKEN) });
  });
});

describe('POST /api/saas/account/reset/confirm — lookup', () => {
  it('looks the account up by HASH only — the plaintext token never reaches Mongo', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    const filter = accountFindOneMock.mock.calls[0][0];
    expect(filter).toEqual({ resetTokenHash: hashResetToken(TOKEN) });
    expect(JSON.stringify(filter)).not.toContain(TOKEN);
  });

  it('projects only the fields it needs (no passwordHash / email / profile)', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(accountFindOneSelect).toHaveBeenCalledWith('_id resetTokenHash resetTokenExpires sessionEpoch');
  });

  it('returns the generic 400 for an UNKNOWN token, with no write', async () => {
    accountFindOneSelect.mockResolvedValue(null);

    const res = await POST(makeReq({ token: 'never-minted', newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: INVALID });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it.each([
    ['expired an hour ago', new Date(Date.now() - 3_600_000)],
    ['expired one ms ago', new Date(Date.now() - 1)],
    ['null expiry (already consumed)', null],
    ['undefined expiry', undefined],
    ['unparseable expiry', new Date('not-a-date')],
  ])('returns the SAME generic 400 for a token with %s, and never writes', async (_label, resetTokenExpires) => {
    const doc = makeAccount({ resetTokenExpires });
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(400);
    // Byte-identical to the unknown-token error: nothing distinguishes the two failure modes.
    await expect(res.json()).resolves.toEqual({ error: INVALID });
    expect(doc.set).not.toHaveBeenCalled();
    expect(doc.save).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it('accepts an expiry stored as an ISO string rather than a Date', async () => {
    const doc = makeAccount({ resetTokenExpires: future(120_000).toISOString() });
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/saas/account/reset/confirm — consumption', () => {
  it('stores the HASHED password, never the plaintext', async () => {
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);

    await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(hashPasswordMock).toHaveBeenCalledWith(GOOD_PASSWORD);
    const patch = doc.set.mock.calls[0][0] as Record<string, unknown>;
    // What lands on the row is hashPassword's output, not the string the caller sent.
    expect(patch.passwordHash).toBe(`hashed:${GOOD_PASSWORD}`);
    expect(patch.passwordHash).not.toBe(GOOD_PASSWORD);
  });

  it('clears BOTH reset fields in the same patch — the token is single-use', async () => {
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);

    await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(doc.set).toHaveBeenCalledTimes(1);
    expect(doc.set.mock.calls[0][0]).toEqual({
      passwordHash: `hashed:${GOOD_PASSWORD}`,
      resetTokenHash: null,
      resetTokenExpires: null,
      sessionEpoch: 6,
    });
    expect(doc.save).toHaveBeenCalledTimes(1);
    // The in-memory doc reflects the consumption, so a replay finds nothing to redeem.
    expect(doc.resetTokenHash).toBeNull();
    expect(doc.resetTokenExpires).toBeNull();
  });

  it('answers with a bare { ok: true } that carries no account information', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ ok: true }));
  });
});

describe('POST /api/saas/account/reset/confirm — failures', () => {
  it('turns a lookup throw into a clean { error } 500', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('mongo down'));

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'mongo down' });
  });

  it('turns a save throw into a clean { error } 500', async () => {
    const doc = makeAccount();
    doc.save.mockRejectedValue(new Error('write failed'));
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'write failed' });
  });

  it('falls back to a generic message when the thrown error carries none', async () => {
    accountFindOneSelect.mockRejectedValue(new Error(''));

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));

    await expect(res.json()).resolves.toEqual({ error: 'Server error' });
  });

  it('truncates a huge error message so no internal dump reaches the client', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('y'.repeat(5000)));

    const res = await POST(makeReq({ token: TOKEN, newPassword: GOOD_PASSWORD }));
    const body = (await res.json()) as { error: string };

    expect(body.error).toHaveLength(200);
  });
});

// ── abuse limit ─────────────────────────────────────────────────────────────────────────────
// Takes a reset token and hands over the account; a limit caps guessing regardless of token length.
describe('rate limiting', () => {
  it('a limited caller gets the limiter response and NOTHING else runs', async () => {
    const limited = NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    rateLimitMock.mockReturnValueOnce(limited);

    const res = await POST(makeReq({ token: 'tok', password: 'password123' }));

    expect(res.status).toBe(429);
    // Before the mode gate and before any DB work: a blocked request must not cost us a query,
    // an email, or a row.
    expect(saasAuthGateMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('is keyed per client IP and per endpoint, so one endpoint cannot exhaust another', async () => {
    await POST(makeReq({ token: 'tok', password: 'password123' }));

    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    const key = rateLimitMock.mock.calls[0][0];
    expect(key).toContain('1.2.3.4');
    expect(key).toMatch(/^saas-reset-confirm:/);
  });
});
