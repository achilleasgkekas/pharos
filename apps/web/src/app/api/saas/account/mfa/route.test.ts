import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// GET/POST/DELETE /api/saas/account/mfa is the logged-in self-service TOTP enrollment endpoint
// (view status / begin-or-restart enrollment / disable). Zero route-level coverage before this
// file. totp/recoveryCodes/secretCrypto and the mfaStore pure planners already have their own
// unit coverage elsewhere and are mocked here for determinism — this file is about what THIS
// route does with mfaStore's results:
//   GET  - gate short-circuit passes through untouched, zero DB· no session -> 401· account gone
//          (describeMfaStatus -> null) -> 404· success spreads the status + cryptoReady flag.
//   POST - gate/auth same as GET· account gone -> 404, mfaEnrollRequiresReauth never called·
//          first-time enroll (mfaEnabled=false) skips the password check entirely· re-enroll
//          (mfaEnabled=true) requires a password field (400 if missing) and re-verifies it (401
//          "Invalid credentials" if wrong, beginMfaEnrollment never called on either failure)·
//          beginMfaEnrollment's ok:false reasons map to 404 (not_found) / 503
//          (crypto_unavailable)· success returns {secret, uri} verbatim.
//   DELETE - gate/auth same· missing password -> 400 BEFORE connectDB (validated ahead of the DB
//          round-trip)· a missing account row and a wrong password both collapse to the SAME 401
//          "Invalid credentials" (no information leak), disableMfa never called on either· success
//          calls disableMfa and returns {enabled:false}· a mid-handler throw becomes a clean 500
//          JSON via the real saasGuard.

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindById,
  accountFindByIdSelect,
  getCurrentAccountMock,
  verifyPasswordMock,
  secretCryptoReadyMock,
  beginMfaEnrollmentMock,
  disableMfaMock,
  describeMfaStatusMock,
  mfaEnrollRequiresReauthMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(async () => null as Record<string, unknown> | null);
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    verifyPasswordMock: vi.fn(() => true),
    secretCryptoReadyMock: vi.fn(() => true),
    beginMfaEnrollmentMock: vi.fn(
      async () => ({ ok: true, secret: 'SECRET123', uri: 'otpauth://totp/x' }) as
        | { ok: true; secret: string; uri: string }
        | { ok: false; reason: 'crypto_unavailable' | 'not_found' },
    ),
    disableMfaMock: vi.fn(async () => true),
    describeMfaStatusMock: vi.fn(
      async () => ({ enabled: false, pending: false }) as { enabled: boolean; pending: boolean } | null,
    ),
    mfaEnrollRequiresReauthMock: vi.fn((mfaEnabled: boolean) => mfaEnabled),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById } }));
vi.mock('@/lib/auth', () => ({ verifyPassword: verifyPasswordMock, assertCanWrite: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/secretCrypto', () => ({ secretCryptoReady: secretCryptoReadyMock }));
vi.mock('@/lib/tenancy/mfaStore', () => ({
  beginMfaEnrollment: beginMfaEnrollmentMock,
  disableMfa: disableMfaMock,
  describeMfaStatus: describeMfaStatusMock,
  mfaEnrollRequiresReauth: mfaEnrollRequiresReauthMock,
}));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) - run it for real so the
  // mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { GET, POST, DELETE } from './route';

function makeReq(body: unknown = {}): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A fake mongoose document: has the field the route reads. */
function makeAccount(over: Record<string, unknown> = {}) {
  return { _id: 'acc1', passwordHash: 'old-hash', mfaEnabled: false, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  verifyPasswordMock.mockReturnValue(true);
  secretCryptoReadyMock.mockReturnValue(true);
  beginMfaEnrollmentMock.mockResolvedValue({ ok: true, secret: 'SECRET123', uri: 'otpauth://totp/x' });
  disableMfaMock.mockResolvedValue(true);
  describeMfaStatusMock.mockResolvedValue({ enabled: false, pending: false });
  mfaEnrollRequiresReauthMock.mockImplementation((mfaEnabled: boolean) => mfaEnabled);
  accountFindByIdSelect.mockResolvedValue(makeAccount());
});

describe('GET', () => {
  it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await GET();

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no session cookie -> 401 "Not authenticated", zero DB touch', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('describeMfaStatus -> null (account gone) -> 404', async () => {
    describeMfaStatusMock.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Account not found');
  });

  it('success spreads the status + cryptoReady flag', async () => {
    describeMfaStatusMock.mockResolvedValueOnce({ enabled: true, pending: false });
    secretCryptoReadyMock.mockReturnValueOnce(true);

    const res = await GET();

    expect(describeMfaStatusMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enabled: boolean; pending: boolean; cryptoReady: boolean };
    expect(json).toEqual({ enabled: true, pending: false, cryptoReady: true });
  });
});

describe('POST', () => {
  it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq({}));

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no session cookie -> 401 "Not authenticated", zero DB touch', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({}));

    expect(res.status).toBe(401);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('account not found -> 404, mfaEnrollRequiresReauth never called', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(null);

    const res = await POST(makeReq({}));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Account not found');
    expect(mfaEnrollRequiresReauthMock).not.toHaveBeenCalled();
    expect(beginMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('first-time enroll (mfaEnabled=false) skips the password check entirely', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ mfaEnabled: false }));

    const res = await POST(makeReq({}));

    expect(mfaEnrollRequiresReauthMock).toHaveBeenCalledWith(false);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(beginMfaEnrollmentMock).toHaveBeenCalledWith('acc1', 'jo@example.com');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { secret: string; uri: string };
    expect(json).toEqual({ secret: 'SECRET123', uri: 'otpauth://totp/x' });
  });

  it('re-enroll (mfaEnabled=true) missing password -> 400, beginMfaEnrollment never called', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ mfaEnabled: true }));

    const res = await POST(makeReq({}));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('password is required');
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(beginMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('re-enroll wrong password -> 401 "Invalid credentials", beginMfaEnrollment never called', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ mfaEnabled: true, passwordHash: 'old-hash' }));
    verifyPasswordMock.mockReturnValueOnce(false);

    const res = await POST(makeReq({ password: 'wrong' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(verifyPasswordMock).toHaveBeenCalledWith('wrong', 'old-hash');
    expect(beginMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('re-enroll correct password -> beginMfaEnrollment runs, success', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ mfaEnabled: true, passwordHash: 'old-hash' }));

    const res = await POST(makeReq({ password: 'right-pw' }));

    expect(verifyPasswordMock).toHaveBeenCalledWith('right-pw', 'old-hash');
    expect(beginMfaEnrollmentMock).toHaveBeenCalledWith('acc1', 'jo@example.com');
    expect(res.status).toBe(200);
  });

  it('beginMfaEnrollment ok:false reason "not_found" -> 404', async () => {
    beginMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const res = await POST(makeReq({}));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
  });

  it('beginMfaEnrollment ok:false reason "crypto_unavailable" -> 503', async () => {
    beginMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'crypto_unavailable' });

    const res = await POST(makeReq({}));

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('crypto_unavailable');
  });
});

describe('DELETE', () => {
  it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await DELETE(makeReq({ password: 'x' }));

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no session cookie -> 401 "Not authenticated", zero DB touch', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await DELETE(makeReq({ password: 'x' }));

    expect(res.status).toBe(401);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing password -> 400 BEFORE connectDB', async () => {
    const res = await DELETE(makeReq({}));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('password is required');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindById).not.toHaveBeenCalled();
  });

  it('dangling cookie (account row gone) -> 401 "Invalid credentials"', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(null);

    const res = await DELETE(makeReq({ password: 'right-pw' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(disableMfaMock).not.toHaveBeenCalled();
  });

  it('wrong password -> the SAME 401 "Invalid credentials", disableMfa never called', async () => {
    verifyPasswordMock.mockReturnValueOnce(false);
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ passwordHash: 'old-hash' }));

    const res = await DELETE(makeReq({ password: 'wrong-pw' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid credentials');
    expect(verifyPasswordMock).toHaveBeenCalledWith('wrong-pw', 'old-hash');
    expect(disableMfaMock).not.toHaveBeenCalled();
  });

  it('success calls disableMfa and returns {enabled:false}', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ passwordHash: 'old-hash' }));

    const res = await DELETE(makeReq({ password: 'right-pw' }));

    expect(disableMfaMock).toHaveBeenCalledWith('acc1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enabled: boolean };
    expect(json).toEqual({ enabled: false });
  });

  it('a mid-handler throw (disableMfa rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    accountFindByIdSelect.mockResolvedValueOnce(makeAccount({ passwordHash: 'old-hash' }));
    disableMfaMock.mockImplementationOnce(async () => {
      throw new Error('mongo blip');
    });

    const res = await DELETE(makeReq({ password: 'right-pw' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});
