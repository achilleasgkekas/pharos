import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/verify/request mints an email-verification token for the CALLER'S OWN
// account. It is the AUTHENTICATED sibling of reset/request, and that difference drives the whole
// contract: because the target address comes from the session (never from the body), there is no
// enumeration surface, so this route deliberately has NO anti-enumeration timing floor and MAY
// answer differently for an already-verified account. Zero route-level coverage before this file.
// The pieces that make the emailed link REDEEMABLE run for real here (mintVerifyToken/
// hashVerifyToken/VERIFY_TTL_MS from lib/tenancy/emailVerify, verifyEmail/verifyLinkUrl,
// pickBaseUrl, saasGuard), so the assertions hit production crypto and builders rather than stubs.
// Mocked seams: saasAuthGate, getCurrentAccount, connectDB, the Account model, and the two
// side-effecting mailer bits (sendEmail + mailerCanDeliver).
// Covered here, and only what THIS route owns:
//   - the gate short-circuit passes through untouched, before the session or DB is touched,
//   - no session → 401 and a dangling cookie (missing row) → 404, both with zero minting,
//   - an already-verified account short-circuits: no token minted, no save, no email,
//   - the projection pulls no passwordHash / profile fields,
//   - the persisted value is only the HASH, and that hash actually matches the token handed out,
//     with a 24h expiry (VERIFY_TTL_MS, four times the reset TTL) and a fresh token per call,
//   - the dev-token scaffold: unwired mailer + non-production echoes devToken; in PRODUCTION it
//     drops silently (fail closed) while still persisting the token,
//   - a wired mailer sends to the SESSION account's address with a link whose token hashes to the
//     stored value, and no devToken leaks into the body,
//   - SAAS_PUBLIC_URL beats APP_URL beats the request origin when building the link,
//   - unlike reset/request the send is AWAITED, so a failing mailer surfaces as a 500 while the
//     token stays persisted — pinned here so the asymmetry is a decision, not a drift,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  saasAuthGateMock,
  getCurrentAccountMock,
  connectDBMock,
  accountFindByIdSelect,
  accountFindByIdMock,
  sendEmailMock,
  mailerCanDeliverMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(async (_projection: string) => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindByIdSelect,
    accountFindByIdMock: vi.fn((_id: string) => ({ select: accountFindByIdSelect })),
    // Typed param so `mock.calls[0][0]` is the message, not an empty tuple.
    sendEmailMock: vi.fn(async (_msg: { to: string; subject: string; html: string }) => ({
      delivered: true,
      provider: 'smtp' as const,
    })),
    mailerCanDeliverMock: vi.fn(() => false),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindByIdMock } }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/mailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/mailer')>('@/lib/tenancy/mailer');
  // verifyEmail/verifyLinkUrl stay real — pure builders with their own tests.
  return { ...actual, sendEmail: sendEmailMock, mailerCanDeliver: mailerCanDeliverMock };
});
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';
import { hashVerifyToken, VERIFY_TTL_MS } from '@/lib/tenancy/emailVerify';

const SESSION = { sub: 'acc1', email: 'owner@example.com' };

function makeReq(url = 'https://app.example.com/api/saas/account/verify/request'): NextRequest {
  return { url } as unknown as NextRequest;
}

/** A fake mongoose document: records what `.set()` wrote plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    email: 'owner@example.com',
    emailVerified: false,
    verifyTokenHash: null as string | null,
    verifyTokenExpires: null as Date | null,
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
  vi.unstubAllEnvs();
  saasAuthGateMock.mockReturnValue(null);
  getCurrentAccountMock.mockResolvedValue(SESSION);
  accountFindByIdSelect.mockResolvedValue(null);
  mailerCanDeliverMock.mockReturnValue(false);
  sendEmailMock.mockResolvedValue({ delivered: true, provider: 'smtp' as const });
  // No public-URL env by default, so the link falls back to the request origin.
  vi.stubEnv('SAAS_PUBLIC_URL', '');
  vi.stubEnv('APP_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/saas/account/verify/request — gating', () => {
  it('passes the SAAS_MODE-off 404 through untouched, before the session or DB is touched', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 }));

    const res = await POST(makeReq());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'SaaS mode is not enabled' });
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindByIdMock).not.toHaveBeenCalled();
  });

  it('passes the missing-AUTH_SECRET 500 through untouched (fail closed)', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 }));

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'AUTH_SECRET is not configured' });
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });

  it('consults the gate exactly once per request', async () => {
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq());

    expect(saasAuthGateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/saas/account/verify/request — caller identity', () => {
  it('rejects an unauthenticated caller with 401 and never touches the DB', async () => {
    getCurrentAccountMock.mockResolvedValue(null);

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Not authenticated' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindByIdMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('looks the account up by the SESSION subject, never by anything caller-supplied', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc-from-cookie', email: 'owner@example.com' });
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq());

    expect(accountFindByIdMock).toHaveBeenCalledTimes(1);
    expect(accountFindByIdMock).toHaveBeenCalledWith('acc-from-cookie');
  });

  it('projects only the three fields it needs — no passwordHash or profile data', async () => {
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq());

    expect(accountFindByIdSelect).toHaveBeenCalledWith('_id email emailVerified');
    const projection = accountFindByIdSelect.mock.calls[0][0];
    expect(projection).not.toMatch(/passwordHash|verifyTokenHash|name/);
  });

  it('returns 404 for a dangling cookie (valid session, deleted account) and mints nothing', async () => {
    accountFindByIdSelect.mockResolvedValue(null);

    const res = await POST(makeReq());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Account not found' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/saas/account/verify/request — already verified', () => {
  it('short-circuits with alreadyVerified and mints no token, no save, no email', async () => {
    const account = makeAccount({ emailVerified: true });
    accountFindByIdSelect.mockResolvedValue(account);

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, alreadyVerified: true });
    expect(account.set).not.toHaveBeenCalled();
    expect(account.save).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(account.verifyTokenHash).toBeNull();
  });

  it('leaks no devToken on the already-verified path even with an unwired mailer', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');
    accountFindByIdSelect.mockResolvedValue(makeAccount({ emailVerified: true }));

    const body = (await (await POST(makeReq())).json()) as Record<string, unknown>;

    expect(body.devToken).toBeUndefined();
  });

  it('answers differently for verified vs unverified — the authenticated route has nothing to hide', async () => {
    accountFindByIdSelect.mockResolvedValue(makeAccount({ emailVerified: true }));
    const verified = await (await POST(makeReq())).text();

    accountFindByIdSelect.mockResolvedValue(makeAccount({ emailVerified: false }));
    const unverified = await (await POST(makeReq())).text();

    // Intentional: unlike reset/request (anti-enumeration), the caller already owns this account.
    expect(verified).not.toBe(unverified);
  });
});

describe('POST /api/saas/account/verify/request — minting', () => {
  it('persists only the HASH, and that hash matches the token handed to the user', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);

    const body = (await (await POST(makeReq())).json()) as { devToken: string };

    expect(typeof body.devToken).toBe('string');
    expect(body.devToken.length).toBeGreaterThan(20);
    // The redeemability property: confirm() re-hashes what the user presents and looks it up.
    expect(account.verifyTokenHash).toBe(hashVerifyToken(body.devToken));
    // The plaintext must not be anywhere on the row.
    expect(JSON.stringify(account)).not.toContain(body.devToken);
    expect(account.save).toHaveBeenCalledTimes(1);
  });

  it('writes both verify fields in a single patch', async () => {
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);

    await POST(makeReq());

    expect(account.set).toHaveBeenCalledTimes(1);
    expect(Object.keys(account.set.mock.calls[0][0]).sort()).toEqual(['verifyTokenExpires', 'verifyTokenHash']);
  });

  it('sets a 24h expiry (VERIFY_TTL_MS) — deliberately longer than the reset TTL', async () => {
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);
    const before = Date.now();

    await POST(makeReq());

    const expires = account.verifyTokenExpires as unknown as Date;
    expect(expires).toBeInstanceOf(Date);
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + VERIFY_TTL_MS);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + VERIFY_TTL_MS);
    expect(VERIFY_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('mints a fresh token on every call (a re-request invalidates nothing but repeats nothing)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    accountFindByIdSelect.mockResolvedValue(makeAccount());
    const first = (await (await POST(makeReq())).json()) as { devToken: string };

    accountFindByIdSelect.mockResolvedValue(makeAccount());
    const second = (await (await POST(makeReq())).json()) as { devToken: string };

    expect(first.devToken).not.toBe(second.devToken);
  });
});

describe('POST /api/saas/account/verify/request — dev-token scaffold', () => {
  it('echoes devToken when no mailer is wired and we are not in production', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    const body = (await (await POST(makeReq())).json()) as Record<string, unknown>;

    expect(body.ok).toBe(true);
    expect(typeof body.devToken).toBe('string');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('drops the token silently in PRODUCTION with no mailer, but still persists it (fail closed)', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);

    const body = (await (await POST(makeReq())).json()) as Record<string, unknown>;

    expect(body).toEqual({ ok: true });
    expect(body.devToken).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
    // Half a flow is still a whole row: the token is stored so a later mailer wiring can resend.
    expect(account.verifyTokenHash).toEqual(expect.any(String));
    expect(account.save).toHaveBeenCalledTimes(1);
  });

  it('never echoes devToken once a mailer is wired, even outside production', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('NODE_ENV', 'development');
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    const body = (await (await POST(makeReq())).json()) as Record<string, unknown>;

    expect(body).toEqual({ ok: true });
    expect(body.devToken).toBeUndefined();
  });
});

describe('POST /api/saas/account/verify/request — outbound email', () => {
  it('sends to the SESSION account address with a link whose token hashes to the stored value', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    const account = makeAccount({ email: 'real-owner@example.com' });
    accountFindByIdSelect.mockResolvedValue(account);

    await POST(makeReq());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const msg = sendEmailMock.mock.calls[0][0];
    expect(msg.to).toBe('real-owner@example.com');
    expect(msg.subject).toBe('Verify your Pharos email');

    const link = /href="([^"]+)"/.exec(msg.html)?.[1] as string;
    const token = new URL(link).searchParams.get('token') as string;
    expect(hashVerifyToken(token)).toBe(account.verifyTokenHash);
  });

  it('builds the link on the request origin when no public-URL env is set', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq('https://tenant.pharos.app/api/saas/account/verify/request'));

    const link = /href="([^"]+)"/.exec(sendEmailMock.mock.calls[0][0].html)?.[1] as string;
    expect(link.startsWith('https://tenant.pharos.app/account/verify?token=')).toBe(true);
  });

  it('prefers SAAS_PUBLIC_URL over both APP_URL and the request origin', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('SAAS_PUBLIC_URL', 'https://public.example.com');
    vi.stubEnv('APP_URL', 'https://app-url.example.com');
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq('https://origin.example.com/api/saas/account/verify/request'));

    const link = /href="([^"]+)"/.exec(sendEmailMock.mock.calls[0][0].html)?.[1] as string;
    expect(link.startsWith('https://public.example.com/account/verify?token=')).toBe(true);
  });

  it('falls back to APP_URL when SAAS_PUBLIC_URL is unset', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('SAAS_PUBLIC_URL', '');
    vi.stubEnv('APP_URL', 'https://app-url.example.com');
    accountFindByIdSelect.mockResolvedValue(makeAccount());

    await POST(makeReq('https://origin.example.com/api/saas/account/verify/request'));

    const link = /href="([^"]+)"/.exec(sendEmailMock.mock.calls[0][0].html)?.[1] as string;
    expect(link.startsWith('https://app-url.example.com/account/verify?token=')).toBe(true);
  });

  it('percent-encodes the token in the link so base64url stays intact', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);

    await POST(makeReq());

    const link = /href="([^"]+)"/.exec(sendEmailMock.mock.calls[0][0].html)?.[1] as string;
    const raw = link.split('token=')[1];
    expect(hashVerifyToken(decodeURIComponent(raw))).toBe(account.verifyTokenHash);
  });

  it('AWAITS the send: a failing mailer surfaces as a 500 while the token stays persisted', async () => {
    // Deliberate asymmetry with reset/request, which fires-and-forgets. Pinned so a future change
    // to either route is a decision rather than a silent drift.
    mailerCanDeliverMock.mockReturnValue(true);
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const account = makeAccount();
    accountFindByIdSelect.mockResolvedValue(account);

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'smtp down' });
    expect(account.save).toHaveBeenCalledTimes(1);
    expect(account.verifyTokenHash).toEqual(expect.any(String));
  });
});

describe('POST /api/saas/account/verify/request — failure shaping', () => {
  it('turns a lookup throw into a clean 500 JSON, not an HTML crash page', async () => {
    accountFindByIdSelect.mockRejectedValue(new Error('mongo unreachable'));

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'mongo unreachable' });
  });

  it('turns a save throw into a clean 500 JSON', async () => {
    const account = makeAccount({
      save: vi.fn(async () => {
        throw new Error('write concern failed');
      }),
    });
    accountFindByIdSelect.mockResolvedValue(account);

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'write concern failed' });
  });

  it('falls back to "Server error" when the thrown error carries no message', async () => {
    accountFindByIdSelect.mockRejectedValue(new Error(''));

    const res = await POST(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Server error' });
  });

  it('truncates a huge error message at 200 chars so no internal dump reaches the client', async () => {
    accountFindByIdSelect.mockRejectedValue(new Error('x'.repeat(5000)));

    const body = (await (await POST(makeReq())).json()) as { error: string };

    expect(body.error).toHaveLength(200);
  });
});
