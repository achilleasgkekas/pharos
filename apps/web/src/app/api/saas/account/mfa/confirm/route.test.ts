import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST /api/saas/account/mfa/confirm is step 2 of TOTP enrollment: verifies `code` against the
// pending secret POST /api/saas/account/mfa (step 1) created, and on success activates MFA +
// returns a fresh batch of plaintext recovery codes ONCE. confirmMfaEnrollment itself already has
// unit coverage in mfaStore.test.ts and is mocked here for determinism — this file is about what
// THIS route does with its result:
//   gate short-circuit passes through untouched, zero DB· no session -> 401, zero DB touch·
//   missing/blank code -> 400 "code is required" BEFORE connectDB (validated ahead of the DB
//   round-trip, same idiom as the sibling mfa route's password checks)· confirmMfaEnrollment's
//   ok:false reasons map to 404 (not_found) / 503 (crypto_unavailable) / 400 (no_pending,
//   invalid_code — anything else falls through to the same 400)· success returns
//   {enabled:true, recoveryCodes} verbatim· a mid-handler throw becomes a clean 500 JSON via the
//   real saasGuard.

const { saasAuthGateMock, connectDBMock, getCurrentAccountMock, confirmMfaEnrollmentMock } = vi.hoisted(() => {
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    confirmMfaEnrollmentMock: vi.fn(
      async () =>
        ({ ok: true, recoveryCodes: ['aaaa-1111', 'bbbb-2222'] }) as
          | { ok: true; recoveryCodes: string[] }
          | { ok: false; reason: 'no_pending' | 'invalid_code' | 'crypto_unavailable' | 'not_found' },
    ),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/mfaStore', () => ({ confirmMfaEnrollment: confirmMfaEnrollmentMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) - run it for real so the
  // mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { POST } from './route';

function makeReq(body: unknown = {}): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  confirmMfaEnrollmentMock.mockResolvedValue({ ok: true, recoveryCodes: ['aaaa-1111', 'bbbb-2222'] });
});

describe('POST', () => {
  it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
    const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res).toBe(blocked);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('no session cookie -> 401 "Not authenticated", zero DB touch', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Not authenticated');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(confirmMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('missing code -> 400 "code is required" BEFORE connectDB', async () => {
    const res = await POST(makeReq({}));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('code is required');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(confirmMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('blank/whitespace-only code -> the same 400, BEFORE connectDB', async () => {
    const res = await POST(makeReq({ code: '   ' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('code is required');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(confirmMfaEnrollmentMock).not.toHaveBeenCalled();
  });

  it('trims the code before passing it to confirmMfaEnrollment', async () => {
    const res = await POST(makeReq({ code: '  123456  ' }));

    expect(confirmMfaEnrollmentMock).toHaveBeenCalledWith('acc1', '123456');
    expect(res.status).toBe(200);
  });

  it('confirmMfaEnrollment ok:false reason "not_found" -> 404', async () => {
    confirmMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
  });

  it('confirmMfaEnrollment ok:false reason "crypto_unavailable" -> 503', async () => {
    confirmMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'crypto_unavailable' });

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('crypto_unavailable');
  });

  it('confirmMfaEnrollment ok:false reason "no_pending" -> 400 (no enrollment in progress)', async () => {
    confirmMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'no_pending' });

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('no_pending');
  });

  it('confirmMfaEnrollment ok:false reason "invalid_code" -> 400 (account state untouched)', async () => {
    confirmMfaEnrollmentMock.mockResolvedValueOnce({ ok: false, reason: 'invalid_code' });

    const res = await POST(makeReq({ code: '000000' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_code');
  });

  it('success -> 200 {enabled:true, recoveryCodes} verbatim', async () => {
    confirmMfaEnrollmentMock.mockResolvedValueOnce({ ok: true, recoveryCodes: ['x1-x1', 'y2-y2', 'z3-z3'] });

    const res = await POST(makeReq({ code: '123456' }));

    expect(confirmMfaEnrollmentMock).toHaveBeenCalledWith('acc1', '123456');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enabled: boolean; recoveryCodes: string[] };
    expect(json).toEqual({ enabled: true, recoveryCodes: ['x1-x1', 'y2-y2', 'z3-z3'] });
  });

  it('a mid-handler throw (confirmMfaEnrollment rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    confirmMfaEnrollmentMock.mockImplementationOnce(async () => {
      throw new Error('mongo blip');
    });

    const res = await POST(makeReq({ code: '123456' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});
