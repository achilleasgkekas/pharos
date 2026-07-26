import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/reset/request is the UNAUTHENTICATED forgot-password entry point, and
// the one SaaS route whose whole contract is what it must NOT reveal: the body is always the
// same regardless of whether the email is registered (anti-enumeration), and the response is
// padded to a fixed floor so the existence-dependent DB write cannot be timed either (D6).
// Zero route-level coverage before this file. The pieces that make the flow REDEEMABLE run for
// real here (mintResetToken/hashResetToken from lib/tenancy/passwordReset, normalizeEmail/
// looksLikeEmail from lib/tenancy/members, pickBaseUrl, resetEmail/resetLinkUrl — pure builders,
// readBody/strField, and saasGuard), so the assertions hit production code rather than stubs.
// Mocked seams: saasAuthGate, connectDB, the Account model, sendEmail + mailerCanDeliver (the
// only side-effecting mailer bits), and settleMinResponseTime (mocked so the suite does not
// sleep out a 500ms floor per case; its own arithmetic is unit-tested in resetTiming.test.ts).
// Covered here, and only what THIS route owns:
//   - the gate short-circuit passes through untouched, before any DB work or timing floor,
//   - a malformed email is a 400 that depends only on the input, so it is NOT floored (the
//     documented exemption) and never touches the DB,
//   - the lookup email is normalized (trimmed + lowercased) before it reaches the DB,
//   - registered and unregistered emails return a BYTE-IDENTICAL body once a mailer is wired —
//     the anti-enumeration invariant — and BOTH are padded to the floor,
//   - the persisted value is only the HASH, and that hash actually matches the token handed out
//     (the property that makes the emailed link redeemable), with a ~1h expiry,
//   - the dev-token scaffold: unwired mailer + non-production echoes devToken; in PRODUCTION it
//     drops silently (fail closed) while still persisting the token,
//   - the outbound email is fire-and-forget: a rejecting OR never-settling sendEmail must not
//     fail or stall the response (that is what keeps mail latency out of the timed path),
//   - SAAS_PUBLIC_URL wins over the request origin when building the link,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindOneSelect,
  accountFindOneMock,
  sendEmailMock,
  mailerCanDeliverMock,
  settleMinResponseTimeMock,
} = vi.hoisted(() => {
  const accountFindOneSelect = vi.fn(async (_projection: string) => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindOneSelect,
    accountFindOneMock: vi.fn((_filter: Record<string, unknown>) => ({ select: accountFindOneSelect })),
    // Typed param so `mock.calls[0][0]` is the message, not an empty tuple.
    sendEmailMock: vi.fn(async (_msg: { to: string; subject: string; html: string }) => ({
      delivered: true,
      provider: 'smtp' as const,
    })),
    mailerCanDeliverMock: vi.fn(() => false),
    settleMinResponseTimeMock: vi.fn(async (_startedAt: number) => {}),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findOne: accountFindOneMock } }));
vi.mock('@/lib/tenancy/mailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/mailer')>('@/lib/tenancy/mailer');
  // resetEmail/resetLinkUrl stay real — pure builders with their own tests.
  return { ...actual, sendEmail: sendEmailMock, mailerCanDeliver: mailerCanDeliverMock };
});
vi.mock('@/lib/tenancy/resetTiming', () => ({ settleMinResponseTime: settleMinResponseTimeMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';
import { hashResetToken, RESET_TTL_MS } from '@/lib/tenancy/passwordReset';

function makeReq(
  body: unknown = {},
  url = 'https://app.example.com/api/saas/account/reset/request'
): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

/** A fake mongoose document: records what `.set()` wrote plus a spyable `.save()`. */
function makeAccount() {
  const doc = {
    _id: 'acc1',
    resetTokenHash: null as string | null,
    resetTokenExpires: null as Date | null,
    set: vi.fn(function (this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    save: vi.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
  };
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  saasAuthGateMock.mockReturnValue(null);
  accountFindOneSelect.mockResolvedValue(null);
  mailerCanDeliverMock.mockReturnValue(false);
  sendEmailMock.mockResolvedValue({ delivered: true, provider: 'smtp' as const });
  // No public-URL env by default, so the link falls back to the request origin.
  vi.stubEnv('SAAS_PUBLIC_URL', '');
  vi.stubEnv('APP_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/saas/account/reset/request — gating', () => {
  it('passes the SAAS_MODE-off 404 through untouched, before any body read or DB work', async () => {
    saasAuthGateMock.mockReturnValue(NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 }));
    const req = makeReq({ email: 'user@example.com' });
    const jsonSpy = vi.spyOn(req, 'json' as never);

    const res = await POST(req);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'SaaS mode is not enabled' });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindOneMock).not.toHaveBeenCalled();
    expect(settleMinResponseTimeMock).not.toHaveBeenCalled();
  });

  it('passes the AUTH_SECRET-unset 500 through untouched', async () => {
    saasAuthGateMock.mockReturnValue(
      NextResponse.json({ error: 'AUTH_SECRET is not configured' }, { status: 500 })
    );

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'AUTH_SECRET is not configured' });
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('consults the gate exactly once per request', async () => {
    await POST(makeReq({ email: 'user@example.com' }));
    expect(saasAuthGateMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/saas/account/reset/request — email validation', () => {
  it.each([
    ['missing', {}],
    ['blank', { email: '   ' }],
    ['no @', { email: 'not-an-email' }],
    ['no domain dot', { email: 'user@example' }],
    ['spaces inside', { email: 'a b@example.com' }],
    ['numeric', { email: 12345 }],
    ['plain object', { email: { at: 'example.com' } }],
    ['null', { email: null }],
  ])('rejects a %s email with 400 and never touches the DB', async (_label, body) => {
    const res = await POST(makeReq(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'A valid email is required' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('does NOT apply the timing floor to a malformed-email 400 (input-only, leaks nothing)', async () => {
    await POST(makeReq({ email: 'nope' }));
    expect(settleMinResponseTimeMock).not.toHaveBeenCalled();
  });

  it('normalizes the email (trim + lowercase) before it reaches the DB', async () => {
    await POST(makeReq({ email: '  USER@Example.COM  ' }));

    expect(accountFindOneMock).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(accountFindOneSelect).toHaveBeenCalledWith('_id');
  });
});

describe('POST /api/saas/account/reset/request — anti-enumeration', () => {
  it('answers an UNREGISTERED email with a bare { ok: true } and no write', async () => {
    accountFindOneSelect.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'ghost@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns a BYTE-IDENTICAL body for registered and unregistered emails when a mailer is wired', async () => {
    mailerCanDeliverMock.mockReturnValue(true);

    accountFindOneSelect.mockResolvedValue(null);
    const missBody = await (await POST(makeReq({ email: 'ghost@example.com' }))).text();

    accountFindOneSelect.mockResolvedValue(makeAccount());
    const hitBody = await (await POST(makeReq({ email: 'user@example.com' }))).text();

    expect(hitBody).toBe(missBody);
    expect(hitBody).toBe(JSON.stringify({ ok: true }));
  });

  it('pads BOTH branches to the response floor, using the handler start time', async () => {
    const before = Date.now();

    accountFindOneSelect.mockResolvedValue(null);
    await POST(makeReq({ email: 'ghost@example.com' }));
    expect(settleMinResponseTimeMock).toHaveBeenCalledTimes(1);

    accountFindOneSelect.mockResolvedValue(makeAccount());
    await POST(makeReq({ email: 'user@example.com' }));
    expect(settleMinResponseTimeMock).toHaveBeenCalledTimes(2);

    for (const [startedAt] of settleMinResponseTimeMock.mock.calls) {
      expect(typeof startedAt).toBe('number');
      expect(startedAt).toBeGreaterThanOrEqual(before);
      expect(startedAt).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe('POST /api/saas/account/reset/request — token minting', () => {
  it('persists only the HASH, and that hash matches the token handed out', async () => {
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ email: 'user@example.com' }));
    const body = (await res.json()) as { ok: boolean; devToken: string };

    expect(doc.set).toHaveBeenCalledTimes(1);
    expect(doc.save).toHaveBeenCalledTimes(1);
    const patch = doc.set.mock.calls[0][0] as { resetTokenHash: string; resetTokenExpires: Date };
    // The redeemability property: confirm looks the account up BY this hash.
    expect(patch.resetTokenHash).toBe(hashResetToken(body.devToken));
    // The plaintext token itself is never written to the row.
    expect(JSON.stringify(patch)).not.toContain(body.devToken);
  });

  it('sets an expiry one TTL into the future', async () => {
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);
    const before = Date.now();

    await POST(makeReq({ email: 'user@example.com' }));

    const { resetTokenExpires } = doc.set.mock.calls[0][0] as { resetTokenExpires: Date };
    expect(resetTokenExpires).toBeInstanceOf(Date);
    expect(resetTokenExpires.getTime()).toBeGreaterThanOrEqual(before + RESET_TTL_MS);
    expect(resetTokenExpires.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS);
  });

  it('mints a DIFFERENT token on every request for the same account', async () => {
    accountFindOneSelect.mockResolvedValue(makeAccount());
    const first = (await (await POST(makeReq({ email: 'user@example.com' }))).json()) as { devToken: string };
    accountFindOneSelect.mockResolvedValue(makeAccount());
    const second = (await (await POST(makeReq({ email: 'user@example.com' }))).json()) as { devToken: string };

    expect(first.devToken).toBeTruthy();
    expect(second.devToken).not.toBe(first.devToken);
  });

  it('never mints or writes for an unregistered email', async () => {
    accountFindOneSelect.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'ghost@example.com' }));

    expect(await res.json()).not.toHaveProperty('devToken');
  });
});

describe('POST /api/saas/account/reset/request — delivery and the dev-token scaffold', () => {
  it('unwired mailer + non-production: echoes devToken and sends nothing', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const body = (await (await POST(makeReq({ email: 'user@example.com' }))).json()) as {
      ok: boolean;
      devToken?: string;
    };

    expect(body.ok).toBe(true);
    expect(typeof body.devToken).toBe('string');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('unwired mailer + PRODUCTION: drops the token silently but still persists it (fail closed)', async () => {
    mailerCanDeliverMock.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'production');
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ email: 'user@example.com' }));

    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
    // The row still carries a live token — only the ECHO is suppressed.
    expect((doc.set.mock.calls[0][0] as { resetTokenHash: string }).resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('wired mailer: emails the token-bearing link to that address and does NOT echo devToken', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    const doc = makeAccount();
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ email: 'user@example.com' }));

    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const msg = sendEmailMock.mock.calls[0][0];
    expect(msg.to).toBe('user@example.com');
    expect(msg.subject).toBe('Reset your Pharos password');
    // The link carries a token whose hash is exactly what was persisted.
    const token = decodeURIComponent(/\/reset\?token=([^"]+)/.exec(msg.html)![1]);
    expect((doc.set.mock.calls[0][0] as { resetTokenHash: string }).resetTokenHash).toBe(hashResetToken(token));
  });

  it('prefers SAAS_PUBLIC_URL over the request origin when building the link', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    vi.stubEnv('SAAS_PUBLIC_URL', 'https://pharos.example.io/');
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ email: 'user@example.com' }, 'https://internal.local/api/saas/account/reset/request'));

    expect(sendEmailMock.mock.calls[0][0].html).toContain('https://pharos.example.io/reset?token=');
  });

  it('falls back to the request origin when no public URL env is set', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    accountFindOneSelect.mockResolvedValue(makeAccount());

    await POST(makeReq({ email: 'user@example.com' }, 'https://app.example.com/api/saas/account/reset/request'));

    expect(sendEmailMock.mock.calls[0][0].html).toContain('https://app.example.com/reset?token=');
  });

  it('a REJECTING sendEmail does not fail the response (fire-and-forget)', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    sendEmailMock.mockRejectedValue(new Error('smtp exploded'));
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('a NEVER-SETTLING sendEmail does not stall the response (mail latency stays out of the timed path)', async () => {
    mailerCanDeliverMock.mockReturnValue(true);
    let release!: () => void;
    sendEmailMock.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ delivered: true, provider: 'smtp' as const });
      }) as ReturnType<typeof sendEmailMock>
    );
    accountFindOneSelect.mockResolvedValue(makeAccount());

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    release(); // let the dangling promise settle so the test does not leak it
  });
});

describe('POST /api/saas/account/reset/request — failures', () => {
  it('turns a lookup throw into a clean { error } 500', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('mongo down'));

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'mongo down' });
  });

  it('turns a save throw into a clean { error } 500', async () => {
    const doc = makeAccount();
    doc.save.mockRejectedValue(new Error('write failed'));
    accountFindOneSelect.mockResolvedValue(doc);

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'write failed' });
  });

  it('falls back to a generic message when the thrown error carries none', async () => {
    accountFindOneSelect.mockRejectedValue(new Error(''));

    const res = await POST(makeReq({ email: 'user@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Server error' });
  });

  it('truncates a huge error message so no internal dump reaches the client', async () => {
    accountFindOneSelect.mockRejectedValue(new Error('x'.repeat(5000)));

    const res = await POST(makeReq({ email: 'user@example.com' }));
    const body = (await res.json()) as { error: string };

    expect(body.error).toHaveLength(200);
  });
});
