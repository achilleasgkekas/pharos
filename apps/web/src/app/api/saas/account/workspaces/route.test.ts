import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// POST/DELETE /api/saas/account/workspaces is the self-serve "create another workspace" /
// "leave a workspace" pair from /account — zero route-level coverage before this file.
// readBody/strField (lib/apiBody) and wouldOrphanOwners (lib/tenancy/members) are real pure
// helpers, exercised for real. Mocked seams: connectDB, Membership (countDocuments/find/
// updateOne), saasAuthGate + accountTenants (saasGuard stays real, same idiom as account/
// route.test.ts), getCurrentAccount, provisionTenant, getTenantContext, recordAudit (auditCtx
// stays real/pure).
//   POST   - gate short-circuit passes through untouched, zero DB· no session -> 401· blank/
//            over-length name -> 400, zero DB· workspace-count-cap reached -> 400, provisionTenant
//            never called· success -> provisionTenant + audit(workspace.created) + 201 with
//            {tenant, tenants}.
//   DELETE - gate/auth same as POST· missing tenant slug -> 400· unknown workspace (getTenantContext
//            -> null/no tenantId) -> 404· caller not a member of that workspace -> 404· caller is
//            the last active owner -> 409 last_owner, updateOne never called· success -> membership
//            marked removed + audit(member.left) + 200 with {left, tenants}· a mid-handler throw ->
//            clean 500 via the real saasGuard.

const {
  saasAuthGateMock,
  connectDBMock,
  membershipCountDocuments,
  membershipFind,
  membershipFindSelect,
  membershipFindSelectLean,
  membershipUpdateOneMock,
  getCurrentAccountMock,
  accountTenantsMock,
  provisionTenantMock,
  getTenantContextMock,
  recordAuditMock,
} = vi.hoisted(() => {
  const membershipFindSelectLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const membershipFindSelect = vi.fn(() => ({ lean: membershipFindSelectLean }));
  return {
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    connectDBMock: vi.fn(async () => {}),
    membershipCountDocuments: vi.fn(async () => 0),
    membershipFind: vi.fn(() => ({ select: membershipFindSelect })),
    membershipFindSelect,
    membershipFindSelectLean,
    membershipUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
    getCurrentAccountMock: vi.fn(async () => null as { sub: string; email: string } | null),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
    provisionTenantMock: vi.fn(async () => ({
      tenantId: 't1',
      slug: 'acme',
      name: 'Acme',
      dbName: 'tenant_acme',
      plan: 'free',
      status: 'trialing',
    })),
    getTenantContextMock: vi.fn(async () => null as { tenantId: string | null; slug: string } | null),
    recordAuditMock: vi.fn(async () => true),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Membership', () => ({
  Membership: {
    countDocuments: membershipCountDocuments,
    find: membershipFind,
    updateOne: membershipUpdateOneMock,
  },
}));
vi.mock('@/lib/tenancy/accountSession', () => ({ getCurrentAccount: getCurrentAccountMock }));
vi.mock('@/lib/tenancy/provision', () => ({ provisionTenant: provisionTenantMock }));
vi.mock('@/lib/tenancy/context', () => ({ getTenantContext: getTenantContextMock }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  // saasGuard is pure (try/catch + NextResponse.json) — run it for real so the mid-handler-throw
  // test exercises the actual production error-shaping logic.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock };
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx stays real (pure)
});

import { POST, DELETE } from './route';

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  saasAuthGateMock.mockReturnValue(null);
  connectDBMock.mockImplementation(async () => {});
  membershipCountDocuments.mockResolvedValue(0);
  membershipFindSelectLean.mockResolvedValue([]);
  membershipUpdateOneMock.mockResolvedValue({ acknowledged: true });
  getCurrentAccountMock.mockImplementation(async () => ({ sub: 'acc1', email: 'jo@example.com' }));
  accountTenantsMock.mockResolvedValue([
    { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'trialing' },
  ]);
  provisionTenantMock.mockResolvedValue({
    tenantId: 't1',
    slug: 'acme',
    name: 'Acme',
    dbName: 'tenant_acme',
    plan: 'free',
    status: 'trialing',
  });
  getTenantContextMock.mockResolvedValue({ tenantId: 't1', slug: 'acme' });
  recordAuditMock.mockResolvedValue(true);
});

describe('POST (create another workspace)', () => {
  describe('gate', () => {
    it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
      const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
      saasAuthGateMock.mockReturnValue(blocked);

      const res = await POST(makeReq({ name: 'New Space' }));

      expect(res).toBe(blocked);
      expect(getCurrentAccountMock).not.toHaveBeenCalled();
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('not authenticated', () => {
    it('no session cookie → 401 "Not authenticated", zero DB touch', async () => {
      getCurrentAccountMock.mockResolvedValueOnce(null);

      const res = await POST(makeReq({ name: 'New Space' }));

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Not authenticated');
      expect(connectDBMock).not.toHaveBeenCalled();
      expect(provisionTenantMock).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('blank name → 400, zero DB touch', async () => {
      const res = await POST(makeReq({ name: '   ' }));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('A workspace name is required');
      expect(connectDBMock).not.toHaveBeenCalled();
    });

    it('name over 80 chars → 400 "too long", provisionTenant never called', async () => {
      const res = await POST(makeReq({ name: 'x'.repeat(81) }));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Workspace name is too long');
      expect(provisionTenantMock).not.toHaveBeenCalled();
    });
  });

  describe('workspace cap', () => {
    it('20 active memberships already → 400 "limit reached", provisionTenant never called', async () => {
      membershipCountDocuments.mockResolvedValueOnce(20);

      const res = await POST(makeReq({ name: 'New Space' }));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Workspace limit reached for this account');
      expect(membershipCountDocuments).toHaveBeenCalledWith({ account: 'acc1', status: 'active' });
      expect(provisionTenantMock).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('provisions the tenant, audits workspace.created, and returns {tenant, tenants} with 201', async () => {
      const res = await POST(makeReq({ name: '  New Space  ' }));

      expect(provisionTenantMock).toHaveBeenCalledWith({ accountId: 'acc1', workspaceName: 'New Space' });
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1' }),
        expect.objectContaining({
          action: 'workspace.created',
          actor: 'acc1',
          target: 'acme',
          meta: { name: 'Acme', selfServe: true },
        })
      );
      expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
      expect(res.status).toBe(201);
      const json = (await res.json()) as { tenant: unknown; tenants: unknown[] };
      expect(json.tenant).toEqual({
        tenantId: 't1',
        slug: 'acme',
        name: 'Acme',
        dbName: 'tenant_acme',
        plan: 'free',
        status: 'trialing',
      });
      expect(json.tenants).toEqual([
        { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'trialing' },
      ]);
    });
  });

  describe('errors', () => {
    it('a mid-handler throw (provisionTenant rejecting) becomes a clean 500 JSON via saasGuard', async () => {
      provisionTenantMock.mockRejectedValueOnce(new Error('slug collision'));

      const res = await POST(makeReq({ name: 'New Space' }));

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('slug collision');
    });
  });
});

describe('DELETE (leave a workspace)', () => {
  describe('gate', () => {
    it('saasAuthGate short-circuit passes through untouched, zero DB', async () => {
      const blocked = NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
      saasAuthGateMock.mockReturnValue(blocked);

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res).toBe(blocked);
      expect(getCurrentAccountMock).not.toHaveBeenCalled();
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('not authenticated', () => {
    it('no session cookie → 401 "Not authenticated", zero DB touch', async () => {
      getCurrentAccountMock.mockResolvedValueOnce(null);

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Not authenticated');
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('missing tenant slug → 400, zero DB touch', async () => {
      const res = await DELETE(makeReq({}));

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('A workspace is required');
      expect(connectDBMock).not.toHaveBeenCalled();
    });
  });

  describe('unknown workspace', () => {
    it('getTenantContext → null → 404 "workspace not found"', async () => {
      getTenantContextMock.mockResolvedValueOnce(null);

      const res = await DELETE(makeReq({ tenant: 'ghost' }));

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('workspace not found');
      expect(membershipFind).not.toHaveBeenCalled();
    });

    it('getTenantContext resolves but tenantId is null → 404 "workspace not found"', async () => {
      getTenantContextMock.mockResolvedValueOnce({ tenantId: null, slug: 'ghost' });

      const res = await DELETE(makeReq({ tenant: 'ghost' }));

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('workspace not found');
    });
  });

  describe('not a member', () => {
    it('caller has no active membership in that workspace → 404', async () => {
      membershipFindSelectLean.mockResolvedValueOnce([
        { account: 'someone-else', role: 'owner', status: 'active' },
      ]);

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('you are not a member of that workspace');
      expect(membershipUpdateOneMock).not.toHaveBeenCalled();
    });
  });

  describe('last owner', () => {
    it('caller is the sole active owner → 409 last_owner, updateOne never called', async () => {
      membershipFindSelectLean.mockResolvedValueOnce([{ account: 'acc1', role: 'owner', status: 'active' }]);

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res.status).toBe(409);
      const json = (await res.json()) as { error: string; code: string };
      expect(json.code).toBe('last_owner');
      expect(membershipUpdateOneMock).not.toHaveBeenCalled();
      expect(recordAuditMock).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('a co-owner leaves → membership removed, audited, 200 with {left, tenants}', async () => {
      membershipFindSelectLean.mockResolvedValueOnce([
        { account: 'acc1', role: 'owner', status: 'active' },
        { account: 'acc2', role: 'owner', status: 'active' },
      ]);

      const res = await DELETE(makeReq({ tenant: 'ACME' }));

      expect(getTenantContextMock).toHaveBeenCalledWith({ slug: 'acme' });
      expect(membershipUpdateOneMock).toHaveBeenCalledWith(
        { account: 'acc1', tenant: 't1' },
        { $set: { status: 'removed' } }
      );
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1' }),
        expect.objectContaining({
          action: 'member.left',
          actor: 'acc1',
          target: 'jo@example.com',
          meta: { role: 'owner', slug: 'acme' },
        })
      );
      expect(accountTenantsMock).toHaveBeenCalledWith('acc1');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { left: string; tenants: unknown[] };
      expect(json.left).toBe('acme');
      expect(json.tenants).toEqual([
        { tenantId: 't1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'trialing' },
      ]);
    });

    it('a plain member (non-owner) can leave without hitting the orphan-owner guard', async () => {
      membershipFindSelectLean.mockResolvedValueOnce([
        { account: 'acc1', role: 'member', status: 'active' },
        { account: 'acc2', role: 'owner', status: 'active' },
      ]);

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res.status).toBe(200);
      expect(membershipUpdateOneMock).toHaveBeenCalledWith(
        { account: 'acc1', tenant: 't1' },
        { $set: { status: 'removed' } }
      );
    });
  });

  describe('errors', () => {
    it('a mid-handler throw (connectDB rejecting) becomes a clean 500 JSON via saasGuard', async () => {
      connectDBMock.mockRejectedValueOnce(new Error('db down'));

      const res = await DELETE(makeReq({ tenant: 'acme' }));

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('db down');
    });
  });
});
