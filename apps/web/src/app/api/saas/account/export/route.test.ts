import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// GET /api/saas/account/export is the GDPR Art.15/20 self-service data-export endpoint: the
// caller's own Account profile joined to its Memberships (any status) + each membership's
// Tenant display fields, assembled into a downloadable JSON attachment. Zero route-level
// coverage before this file. buildAccountExport/accountExportFilename (lib/tenancy/
// accountExport) are pure and already fully unit-tested in their own accountExport.test.ts, so
// this file mocks them and asserts only the route's OWN job: gate/auth short-circuits, the
// account/membership/tenant DB reads, the membership→tenant join (including an unresolvable
// tenant becoming `tenant: null` rather than being dropped — that's buildAccountExport's job,
// not the route's), and the response envelope (status/headers/body) built from whatever the
// mocked assembler returns.
//   - gate short-circuit passes through untouched, zero DB.
//   - no session (getCurrentAccount → null) → 401, zero DB touch.
//   - account gone (findById().select().lean() → null) → 404, zero Membership/Tenant reads.
//   - success: Membership.find({account}) selected/leaned, Tenant.find({_id:{$in:...}})
//     selected/leaned scoped to exactly the membership tenant ids, each membership joined to its
//     tenant (or null when the tenant id isn't in the Tenant result), buildAccountExport called
//     with the account doc + joined rows + a Date, and the response is the assembler's payload
//     verbatim with the attachment Content-Disposition/Content-Type/Cache-Control headers.
//   - a mid-handler throw (connectDB rejecting) → clean 500 via the real saasGuard.

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
  membershipFind,
  membershipFindSelect,
  tenantFind,
  tenantFindSelect,
  getCurrentAccountMock,
  buildAccountExportMock,
  accountExportFilenameMock,
} = vi.hoisted(() => {
  const accountFindByIdSelect = vi.fn(() => chainable(null as Record<string, unknown> | null));
  const membershipFindSelect = vi.fn(() => chainable([] as Record<string, unknown>[]));
  const tenantFindSelect = vi.fn(() => chainable([] as Record<string, unknown>[]));
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    accountFindById: vi.fn(() => ({ select: accountFindByIdSelect })),
    accountFindByIdSelect,
    membershipFind: vi.fn(() => ({ select: membershipFindSelect })),
    membershipFindSelect,
    tenantFind: vi.fn(() => ({ select: tenantFindSelect })),
    tenantFindSelect,
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    buildAccountExportMock: vi.fn((account: unknown, _memberships?: unknown, _generatedAt?: unknown) => ({
      format: 'pharos.account-export',
      account,
    })),
    accountExportFilenameMock: vi.fn((id: string) => `pharos-account-${id}.json`),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findById: accountFindById } }));
vi.mock('@/models/Membership', () => ({ Membership: { find: membershipFind } }));
vi.mock('@/models/Tenant', () => ({ Tenant: { find: tenantFind } }));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/accountExport', () => ({
  buildAccountExport: buildAccountExportMock,
  accountExportFilename: accountExportFilenameMock,
}));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  accountFindByIdSelect.mockImplementation(() =>
    chainable({ _id: 'acc1', email: 'jo@example.com', name: 'Jo', emailVerified: true }),
  );
  membershipFindSelect.mockImplementation(() => chainable([]));
  tenantFindSelect.mockImplementation(() => chainable([]));
  buildAccountExportMock.mockImplementation((account: unknown, _memberships?: unknown, _generatedAt?: unknown) => ({
    format: 'pharos.account-export',
    account,
  }));
  accountExportFilenameMock.mockImplementation((id: string) => `pharos-account-${id}.json`);
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
    it('dangling cookie (findById().select().lean() → null) → 404 "Account not found", zero Membership/Tenant reads', async () => {
      accountFindByIdSelect.mockReturnValueOnce(chainable(null));

      const res = await GET();

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Account not found');
      expect(membershipFind).not.toHaveBeenCalled();
      expect(tenantFind).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('joins memberships to tenants (unresolvable tenant → null), and calls the assembler + filename builder', async () => {
      accountFindByIdSelect.mockReturnValueOnce(
        chainable({ _id: 'acc1', email: 'jo@example.com', name: 'Jo', emailVerified: true }),
      );
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      membershipFindSelect.mockReturnValueOnce(
        chainable([
          { tenant: 't1', role: 'owner', status: 'active', createdAt },
          { tenant: 't2', role: 'member', status: 'active', createdAt }, // t2 will be unresolvable
        ]),
      );
      tenantFindSelect.mockReturnValueOnce(
        chainable([{ _id: 't1', slug: 'acme', name: 'Acme', plan: 'free', status: 'active' }]),
      );

      const res = await GET();

      expect(membershipFind).toHaveBeenCalledWith({ account: 'acc1' });
      expect(tenantFind).toHaveBeenCalledWith({ _id: { $in: ['t1', 't2'] } });

      expect(buildAccountExportMock).toHaveBeenCalledTimes(1);
      const [accountArg, joinedArg, dateArg] = buildAccountExportMock.mock.calls[0] as [unknown, unknown, unknown];
      expect(accountArg).toEqual({ _id: 'acc1', email: 'jo@example.com', name: 'Jo', emailVerified: true });
      expect(joinedArg).toEqual([
        { role: 'owner', status: 'active', createdAt, tenant: { slug: 'acme', name: 'Acme', plan: 'free', status: 'active' } },
        { role: 'member', status: 'active', createdAt, tenant: null },
      ]);
      expect(dateArg).toBeInstanceOf(Date);

      expect(accountExportFilenameMock).toHaveBeenCalledWith('acc1');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="pharos-account-acc1.json"');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const json = (await res.json()) as { format: string };
      expect(json.format).toBe('pharos.account-export');
    });

    it('no memberships → Tenant.find called with an empty $in, empty joined array', async () => {
      membershipFindSelect.mockReturnValueOnce(chainable([]));

      const res = await GET();

      expect(tenantFind).toHaveBeenCalledWith({ _id: { $in: [] } });
      expect(res.status).toBe(200);
      const [, joinedArg] = buildAccountExportMock.mock.calls[0] as [unknown, unknown, unknown];
      expect(joinedArg).toEqual([]);
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
