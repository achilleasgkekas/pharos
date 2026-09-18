import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// GET/PATCH /api/saas/account is the logged-in self-service profile endpoint (view own
// account· update name and/or email). Zero route-level coverage before this file.
// normalizeEmail/looksLikeEmail (lib/tenancy/members) and sanitizeName (lib/tenancy/
// accountProfile) are real (trivial pure string helpers, no reason to mock — using them for
// real exercises the actual normalization the route relies on). accountTenants and
// setAccountCookie are mocked (DB-backed / cookie side-effect, not this route's concern).
//   GET   - gate short-circuit passes through untouched, zero DB· no session -> 401· account
//           gone (findById().select().lean() -> null) -> 404· success maps the lean doc to the
//           response shape, defaulting missing optional fields (email/name '' , emailVerified
//           false, lastLoginAt/createdAt null)· a mid-handler throw -> clean 500 via saasGuard.
//   PATCH - gate/auth same as GET· neither name nor email in the body -> 400 "Nothing to
//           update", zero DB touch· account gone -> 404· malformed email -> 400 BEFORE any
//           uniqueness check· email unchanged after normalization -> no Account.exists call, no
//           emailVerified reset, no cookie refresh· email changed to one already in use ->
//           Account.exists pre-check -> 409, save never called· email changed to a free one ->
//           email updated + emailVerified reset to false + the session cookie refreshed with
//           the new email· name-only update -> sanitizeName applied, cookie NOT refreshed
//           (email unchanged)· a race caught by the unique-index (save throws {code:11000}) ->
//           the SAME 409 message as the pre-check· any other save throw -> clean 500 via the
//           real saasGuard· success response always includes accountTenants(accountId).

function chainable<T>(doc: T) {
  const p = Promise.resolve(doc) as Promise<T> & { lean: () => Promise<T> };
  p.lean = () => Promise.resolve(doc);
  return p;
}

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindById,
  accountFindByIdSelect,
  accountExistsMock,
  getCurrentAccountMock,
  setAccountCookieMock,
  accountTenantsMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn((_proj: string) => Promise.resolve(null as Record<string, unknown> | null));
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    accountExistsMock: vi.fn(async () => false),
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    setAccountCookieMock: vi.fn(async () => {}),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById, exists: accountExistsMock } }));
vi.mock('@/lib/tenancy/accountSession', () => ({
  getCurrentAccount: getCurrentAccountMock,
  setAccountCookie: setAccountCookieMock,
}));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw tests exercise the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});

import { GET, PATCH } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** A fake mongoose document: has the fields the PATCH route reads plus a spyable `.save()`. */
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: 'acc1',
    email: 'jo@example.com',
    name: 'Jo',
    emailVerified: true,
    save: vi.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  setAccountCookieMock.mockImplementation(async () => {});
  accountExistsMock.mockResolvedValue(false);
  accountTenantsMock.mockResolvedValue([{ tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' }]);
  accountFindByIdSelect.mockImplementation(() => chainable(makeAccount()));
});

describe('GET', () => {
  describe('gate', () => {
    it('saasAuthGate short-circuit (SAAS_MODE off / AUTH_SECRET missing) passes through untouched, zero DB', async () => {
      const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
      saasAuthGateMock.mockReturnValue(blocked);

      const res = await GET();

      expect(res).toBe(blocked);
      expect(getCurrentAccountMock).not.toHaveBeenCalled();
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('not authenticated', () => {
    it('no session cookie (getCurrentAccount → null) → 401 "Not authenticated", zero DB touch', async () => {
      getCurrentAccountMock.mockResolvedValueOnce(null);

      const res = await GET();

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Not authenticated');
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(accountFindById).not.toHaveBeenCalled();
    });
  });

  describe('account gone', () => {
    it('dangling cookie (findById().select().lean() → null) → 404 "Account not found"', async () => {
      accountFindByIdSelect.mockReturnValueOnce(chainable(null));

      const res = await GET();

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Account not found');
    });
  });

  describe('success', () => {
    it('maps a fully-populated lean doc verbatim', async () => {
      const lastLoginAt = new Date('2026-07-01T00:00:00.000Z');
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      accountFindByIdSelect.mockReturnValueOnce(
        chainable({ _id: 'acc1', email: 'jo@example.com', name: 'Jo', emailVerified: true, lastLoginAt, createdAt }),
      );

      const res = await GET();

      expect(accountFindById).toHaveBeenCalledWith('acc1');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { account: Record<string, unknown> };
      expect(json.account).toEqual({
        id: 'acc1',
        email: 'jo@example.com',
        name: 'Jo',
        emailVerified: true,
        lastLoginAt: lastLoginAt.toISOString(),
        createdAt: createdAt.toISOString(),
      });
    });

    it('defaults missing optional fields (email/name → "", emailVerified → false, dates → null)', async () => {
      accountFindByIdSelect.mockReturnValueOnce(chainable({ _id: 'acc1' }));

      const res = await GET();

      const json = (await res.json()) as { account: Record<string, unknown> };
      expect(json.account).toEqual({
        id: 'acc1',
        email: '',
        name: '',
        emailVerified: false,
        lastLoginAt: null,
        createdAt: null,
      });
    });
  });

  describe('errors', () => {
    it('a mid-handler throw (connectDB rejecting) becomes a clean 500 JSON via saasGuard', async () => {
      connectDBMock.mockRejectedValueOnce(new Error('db down'));

      const res = await GET();

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('db down');
    });
  });
});

describe('PATCH', () => {
  describe('gate', () => {
    it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
      const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
      saasAuthGateMock.mockReturnValue(blocked);

      const res = await PATCH(makeReq({ name: 'New' }));

      expect(res).toBe(blocked);
      expect(getCurrentAccountMock).not.toHaveBeenCalled();
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('not authenticated', () => {
    it('no session cookie → 401 "Not authenticated", zero DB touch', async () => {
      getCurrentAccountMock.mockResolvedValueOnce(null);

      const res = await PATCH(makeReq({ name: 'New' }));

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Not authenticated');
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('neither name nor email present → 400 "Nothing to update", zero DB touch', async () => {
      const res = await PATCH(makeReq({ unrelated: 'x' }));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Nothing to update');
      expect(connectDBMock).not.toHaveBeenCalled();
    });

    it('malformed email → 400 "A valid email is required" BEFORE any uniqueness check', async () => {
      const res = await PATCH(makeReq({ email: 'not-an-email' }));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('A valid email is required');
      expect(accountExistsMock).not.toHaveBeenCalled();
    });
  });

  describe('account gone', () => {
    it('dangling cookie (findById().select() → null) → 404 "Account not found"', async () => {
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(null));

      const res = await PATCH(makeReq({ name: 'New' }));

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Account not found');
    });
  });

  describe('email unchanged', () => {
    it('email normalizes to the same value already on the account → no uniqueness check, no cookie refresh, no emailVerified reset', async () => {
      const account = makeAccount({ email: 'jo@example.com', emailVerified: true });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));

      const res = await PATCH(makeReq({ email: '  Jo@Example.com  ' }));

      expect(res.status).toBe(200);
      expect(accountExistsMock).not.toHaveBeenCalled();
      expect(account.emailVerified).toBe(true);
      expect(setAccountCookieMock).not.toHaveBeenCalled();
      expect(account.save).toHaveBeenCalled();
    });
  });

  describe('email changed, already taken', () => {
    it('Account.exists finds another account with the new email → 409, save never called', async () => {
      const account = makeAccount({ email: 'jo@example.com' });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));
      accountExistsMock.mockResolvedValueOnce(true);

      const res = await PATCH(makeReq({ email: 'taken@example.com' }));

      expect(res.status).toBe(409);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('An account with this email already exists');
      expect(accountExistsMock).toHaveBeenCalledWith({ email: 'taken@example.com', _id: { $ne: 'acc1' } });
      expect(account.save).not.toHaveBeenCalled();
      expect(setAccountCookieMock).not.toHaveBeenCalled();
    });
  });

  describe('email changed, success', () => {
    it('updates the email, resets emailVerified, refreshes the session cookie, and returns tenants', async () => {
      const account = makeAccount({ email: 'jo@example.com', emailVerified: true });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));
      accountExistsMock.mockResolvedValueOnce(false);

      const res = await PATCH(makeReq({ email: 'new@example.com' }));

      expect(account.email).toBe('new@example.com');
      expect(account.emailVerified).toBe(false);
      expect(account.save).toHaveBeenCalled();
      expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', epoch: 0, email: 'new@example.com' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { account: Record<string, unknown>; tenants: unknown[] };
      expect(json.account).toEqual({ id: 'acc1', email: 'new@example.com', name: 'Jo' });
      expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
      expect(json.tenants).toEqual([{ tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' }]);
    });
  });

  describe('name-only update', () => {
    it('sanitizes (trims) the name, saves, but does NOT refresh the session cookie (email unchanged)', async () => {
      const account = makeAccount({ name: 'Old Name' });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));

      const res = await PATCH(makeReq({ name: '  New Name  ' }));

      expect(account.name).toBe('New Name');
      expect(account.save).toHaveBeenCalled();
      expect(setAccountCookieMock).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe('errors', () => {
    it('save() throws a duplicate-key race (code 11000) → the SAME 409 message as the pre-check', async () => {
      const account = makeAccount({
        email: 'jo@example.com',
        save: vi.fn(async () => {
          throw { code: 11000 };
        }),
      });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));
      accountExistsMock.mockResolvedValueOnce(false);

      const res = await PATCH(makeReq({ email: 'new@example.com' }));

      expect(res.status).toBe(409);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('An account with this email already exists');
      expect(setAccountCookieMock).not.toHaveBeenCalled();
    });

    it('any other save() throw becomes a clean 500 JSON via the real saasGuard', async () => {
      const account = makeAccount({
        save: vi.fn(async () => {
          throw new Error('mongo blip');
        }),
      });
      accountFindByIdSelect.mockReturnValueOnce(Promise.resolve(account));

      const res = await PATCH(makeReq({ name: 'New' }));

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('mongo blip');
    });
  });
});
