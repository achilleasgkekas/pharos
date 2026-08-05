import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// GET/PATCH /api/saas/admin/tenants/[slug] is the superadmin console's single-tenant DETAIL +
// the ONE write surface it exposes (manual status/plan override) — zero route-level coverage
// today (grep of api/saas/**/*.test.ts before this file: only billing/{webhook,checkout,portal},
// invites/accept, workspace/erasure{,/purge} have one). The pure planning/gate logic already has
// full unit coverage elsewhere (`adminTenantActions.test.ts` for planAdminTenantPatch,
// `superadmin.test.ts` for the allowlist matching, `adminTenantDetail.test.ts` for the shaping) —
// this closes the gap for what the ROUTE itself is responsible for:
//   - requireSuperadmin's short-circuit response is passed straight through untouched (both
//     verbs, before any DB read),
//   - GET: unknown slug → 404, known slug → the real getTenantDetailForAdmin result verbatim,
//   - PATCH: unknown slug → 404 BEFORE the body is even read, invalid status/plan → 400 (no
//     write), idempotent no-op (same value as current) → 200 with zero Tenant.updateOne/audit,
//   - PATCH happy path writes the correct $set + audits status and/or plan changes with the
//     correct actor/target, then re-reads the detail for the response body,
//   - a mid-handler DB throw surfaces as a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  requireSuperadminMock,
  getTenantDetailForAdminMock,
  tenantFindOneMock,
  tenantUpdateOneMock,
  recordAuditMock,
} = vi.hoisted(() => ({
  requireSuperadminMock: vi.fn(),
  getTenantDetailForAdminMock: vi.fn(),
  tenantFindOneMock: vi.fn(),
  tenantUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
  recordAuditMock: vi.fn(async () => true),
}));

vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/tenancy/adminTenantDetail', () => ({
  getTenantDetailForAdmin: getTenantDetailForAdminMock,
}));
vi.mock('@/models/Tenant', () => ({
  Tenant: {
    findOne: tenantFindOneMock,
    updateOne: tenantUpdateOneMock,
  },
}));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx stays real (pure)
});

import { GET, PATCH } from './route';

function makeReq(body: unknown = {}): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function makeGate(overrides: Record<string, unknown> = {}) {
  return { account: { sub: 'op1', email: 'ops@pharos.dev', ...overrides } };
}

const DETAIL = {
  format: 'pharos.admin-tenant-detail' as const,
  version: 2 as const,
  generatedAt: '2026-07-24T00:00:00.000Z',
  tenant: { id: 'tenant1', slug: 'acme', status: 'active', plan: 'shared' },
  memberCounts: { total: 1, owner: 1, admin: 0, member: 0, active: 1, invited: 0, removed: 0 },
  members: [],
  usage: { aiCallsThisMonth: 0, storageBytes: 0 },
};

function findOneChain(doc: unknown) {
  return { select: () => ({ lean: async () => doc }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue(makeGate());
  getTenantDetailForAdminMock.mockResolvedValue(DETAIL);
  tenantFindOneMock.mockReturnValue(
    findOneChain({ _id: 'tenant1', slug: 'acme', status: 'active', plan: 'shared' })
  );
  tenantUpdateOneMock.mockResolvedValue({ acknowledged: true });
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — single-tenant detail', () => {
  it('passes through requireSuperadmin short-circuit untouched, never reads the detail', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq(), makeParams('acme'));

    expect(res).toBe(blocked);
    expect(getTenantDetailForAdminMock).not.toHaveBeenCalled();
  });

  it('unknown slug → 404', async () => {
    getTenantDetailForAdminMock.mockResolvedValueOnce(null);

    const res = await GET(makeReq(), makeParams('ghost'));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('tenant not found');
  });

  it('known slug → the real detail verbatim, no-store', async () => {
    const res = await GET(makeReq(), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(getTenantDetailForAdminMock).toHaveBeenCalledWith('acme');
    const json = await res.json();
    expect(json).toEqual(DETAIL);
  });
});

describe('PATCH — status/plan override', () => {
  it('passes through requireSuperadmin short-circuit untouched, never touches Tenant', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('acme'));

    expect(res).toBe(blocked);
    expect(tenantFindOneMock).not.toHaveBeenCalled();
  });

  it('unknown slug → 404 before the body is even read', async () => {
    tenantFindOneMock.mockReturnValueOnce(findOneChain(null));

    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('ghost'));

    expect(res.status).toBe(404);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('invalid status value → 400, zero write/audit', async () => {
    const res = await PATCH(makeReq({ status: 'bogus' }), makeParams('acme'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalid status/);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('invalid plan value → 400, zero write/audit', async () => {
    const res = await PATCH(makeReq({ plan: 'enterprise' }), makeParams('acme'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalid plan/);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('empty body (neither status nor plan) → 400, zero write/audit', async () => {
    const res = await PATCH(makeReq({}), makeParams('acme'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/nothing to update/);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('idempotent no-op (same status+plan as current) → 200, zero write/audit', async () => {
    const res = await PATCH(makeReq({ status: 'active', plan: 'shared' }), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
    expect(getTenantDetailForAdminMock).toHaveBeenCalledWith('acme');
  });

  it('status change writes $set + audits workspace.suspended with the operator as actor', async () => {
    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('acme'));

    expect(res.status).toBe(200);
    // The console starts the 30-day keep-window exactly like the billing webhook does. It used to
    // write `status` alone, which is how a hand-flipped workspace kept a stale `suspendedAt` and
    // could fall due for deletion the day it was suspended again.
    const [, update] = tenantUpdateOneMock.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set.status).toBe('suspended');
    expect(update.$set.suspendedAt).toBeInstanceOf(Date);
    expect(update.$set.suspendWarnEmailedAt).toBeNull();
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({
        action: 'workspace.suspended',
        actor: 'op1',
        target: 'acme',
        meta: { from: 'active', to: 'suspended', by: 'admin' },
      })
    );
    // no plan change requested → no plan.changed row
    expect(recordAuditMock).toHaveBeenCalledTimes(1);
  });

  it('plan change writes $set + audits plan.changed', async () => {
    const res = await PATCH(makeReq({ plan: 'dedicated' }), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'tenant1' },
      { $set: { plan: 'dedicated' } }
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({
        action: 'plan.changed',
        actor: 'op1',
        target: 'acme',
        meta: { from: 'shared', to: 'dedicated', by: 'admin' },
      })
    );
  });

  it('status+plan together in one request write ONE $set and audit BOTH transitions', async () => {
    const res = await PATCH(makeReq({ status: 'canceled', plan: 'free' }), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).toHaveBeenCalledTimes(1);
    const [, update] = tenantUpdateOneMock.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    // ONE write, carrying the plan, the status, and the deletion the cancel implies.
    expect(update.$set.status).toBe('canceled');
    expect(update.$set.plan).toBe('free');
    expect(update.$set.erasureScheduledAt).toBeInstanceOf(Date);
    expect(update.$set.erasureRequestedBy).toBe('system:workspace-canceled');
    expect(recordAuditMock).toHaveBeenCalledTimes(2);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'workspace.canceled' })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'plan.changed' })
    );
  });

  it('a benign status transition with no mapped audit action (e.g. trialing) still writes but skips the statusAudit row', async () => {
    tenantFindOneMock.mockReturnValueOnce(
      findOneChain({ _id: 'tenant1', slug: 'acme', status: 'active', plan: 'shared' })
    );

    const res = await PATCH(makeReq({ status: 'trialing' }), makeParams('acme'));

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'tenant1' },
      { $set: { status: 'trialing' } }
    );
    // active -> trialing isn't a recovery from suspended/canceled, so statusAuditAction is null
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('re-reads the detail for the response body after a successful write', async () => {
    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('acme'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const json = await res.json();
    expect(json).toEqual(DETAIL);
  });

  it('the tenant vanishing between the write and the re-read → 404', async () => {
    getTenantDetailForAdminMock.mockResolvedValueOnce(null);

    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('acme'));

    expect(res.status).toBe(404);
  });

  it('a mid-handler DB throw surfaces as a clean 500 JSON (saasGuard), not an HTML crash page', async () => {
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await PATCH(makeReq({ status: 'suspended' }), makeParams('acme'));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo down');
  });

  it('lowercases and trims the slug before the lookup', async () => {
    await PATCH(makeReq({ status: 'suspended' }), makeParams('  ACME  '));
    expect(tenantFindOneMock).toHaveBeenCalledWith({ slug: 'acme' });
  });
});
