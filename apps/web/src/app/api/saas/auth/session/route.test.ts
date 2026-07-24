import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/auth/session is the "am I logged in" probe every SaaS page/panel calls on
// load — a wrong build here either leaks a stale/deleted account as still-logged-in, or drops
// a valid session. Zero route-level coverage before this file. getCurrentAccount (cookie
// verify) and accountTenants already have their own coverage elsewhere and are mocked here for
// determinism, not re-tested — this file is about what THIS route does with their results:
//   - saasAuthGate short-circuit passes through untouched, zero DB,
//   - no cookie (getCurrentAccount → null) → { account: null }, zero DB touch,
//   - a valid cookie but the account row is gone (deleted account, live cookie) →
//     { account: null } as well — a dangling cookie never resolves to "logged in",
//   - a valid cookie + existing account → { account, tenants } shaped from the DB doc, falling
//     back to the cookie's email when the DB doc email is blank and to '' when name is blank,
//   - a mid-handler throw (e.g. Account.findById rejecting) becomes a clean 500 JSON, not a
//     crash — same saasGuard idiom as every other SaaS route.

const {
  saasAuthGateMock,
  connectDBMock,
  accountFindById,
  accountFindByIdSelect,
  getCurrentAccountMock,
  accountTenantsMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(() => ({ lean: vi.fn(async () => null as Record<string, unknown> | null) }));
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById } }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json, no DB/env reads) — run it for real so
  // the mid-handler-throw test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});

import { GET } from './route';

function leanReturning(doc: Record<string, unknown> | null) {
  accountFindByIdSelect.mockReturnValue({ lean: vi.fn(async () => doc) });
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => null);
  accountTenantsMock.mockImplementation(async () => []);
  leanReturning(null);
});

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

describe('logged out', () => {
  it('no cookie (getCurrentAccount → null) → { account: null }, never touches the DB', async () => {
    getCurrentAccountMock.mockResolvedValueOnce(null);

    const res = await GET();

    expect(connectDBMock).not.toHaveBeenCalled();
    expect(accountFindById).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { account: unknown };
    expect(json.account).toBeNull();
  });

  it('a verified cookie whose account row no longer exists (deleted account) → { account: null } too', async () => {
    getCurrentAccountMock.mockResolvedValueOnce({ sub: 'acc1', email: 'jo@example.com' });
    leanReturning(null);

    const res = await GET();

    expect(connectDBMock).toHaveBeenCalled();
    expect(accountFindById).toHaveBeenCalledWith('acc1');
    expect(accountTenantsMock).not.toHaveBeenCalled();
    const json = (await res.json()) as { account: unknown; tenants?: unknown };
    expect(json.account).toBeNull();
    expect(json.tenants).toBeUndefined();
  });
});

describe('logged in', () => {
  it('valid cookie + existing account → { account, tenants } shaped from the DB doc', async () => {
    getCurrentAccountMock.mockResolvedValueOnce({ sub: 'acc1', email: 'jo@example.com' });
    leanReturning({ _id: 'acc1', name: 'Jo Doe', email: 'jo@example.com' });
    accountTenantsMock.mockResolvedValueOnce([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);

    const res = await GET();

    expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
    const json = (await res.json()) as { account: unknown; tenants: unknown };
    expect(json.account).toEqual({ id: 'acc1', email: 'jo@example.com', name: 'Jo Doe' });
    expect(json.tenants).toEqual([
      { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
    ]);
  });

  it('falls back to the cookie email when the DB doc has none, and to an empty name when blank', async () => {
    getCurrentAccountMock.mockResolvedValueOnce({ sub: 'acc1', email: 'cookie@example.com' });
    leanReturning({ _id: 'acc1' });

    const res = await GET();

    const json = (await res.json()) as { account: { email: string; name: string } };
    expect(json.account.email).toBe('cookie@example.com');
    expect(json.account.name).toBe('');
  });

  it('reads the id off the DB doc (not the cookie sub) in case they ever diverge', async () => {
    getCurrentAccountMock.mockResolvedValueOnce({ sub: 'acc1', email: 'jo@example.com' });
    leanReturning({ _id: 'db-id-differs', name: 'Jo', email: 'jo@example.com' });

    const res = await GET();

    const json = (await res.json()) as { account: { id: string } };
    expect(json.account.id).toBe('db-id-differs');
    expect(accountTenantsMock).toHaveBeenCalledWith('db-id-differs');
  });
});

describe('errors', () => {
  it('a mid-handler throw (Account.findById rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    getCurrentAccountMock.mockResolvedValueOnce({ sub: 'acc1', email: 'jo@example.com' });
    accountFindByIdSelect.mockReturnValue({
      lean: vi.fn(async () => {
        throw new Error('mongo blip');
      }),
    });

    const res = await GET();

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});
