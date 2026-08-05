import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH/DELETE /api/saas/workspace is the "General" tab of workspace self-service — read
// details, rename the display name, soft-cancel the workspace. Zero route-level coverage today
// (grep of api/saas/**/*.test.ts before this file: only billing/*, invites/accept, admin/
// tenants/[slug], workspace/erasure*). The pure helpers (`sanitizeWorkspaceName`/
// `workspaceNameError`/`canCancelWorkspace`/`workspaceView`) already have full unit coverage in
// `workspace.test.ts` and run for REAL here via plain import — only the session/DB/audit seams
// are mocked. This closes the gap for what the route itself is responsible for:
//   - resolveWorkspaceSession's short-circuit response is passed straight through untouched,
//   - GET/DELETE resolve with (slug, false, true) — any active member may read/attempt-cancel,
//     the owner-only gate for DELETE is enforced by the route itself, not the session resolver,
//   - PATCH resolves with requireManage=true (owner/admin only) and forwards the trimmed
//     ?tenant body field (empty → null),
//   - PATCH/DELETE are idempotent (unchanged name / already-canceled → current view, zero
//     Tenant.updateOne, zero audit row),
//   - a real rename/cancel updates Tenant + audits the correct action/actor/meta,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const { resolveWorkspaceSessionMock, tenantUpdateOneMock, countDocumentsMock, recordAuditMock } =
  vi.hoisted(() => ({
    resolveWorkspaceSessionMock: vi.fn(),
    tenantUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
    countDocumentsMock: vi.fn(async () => 3),
    recordAuditMock: vi.fn(async () => true),
  }));

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { updateOne: tenantUpdateOneMock } }));
vi.mock('@/models/Membership', () => ({ Membership: { countDocuments: countDocumentsMock } }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { GET, PATCH, DELETE } from './route';
import { NextResponse } from 'next/server';

function makeReq(
  body: unknown = {},
  url = 'https://app.example.com/api/saas/workspace'
): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(over: Record<string, unknown> = {}, role = 'owner') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role, plan: 'free', status: 'active' },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: {
        _id: 'tenant1',
        slug: 'acme',
        name: 'Acme',
        plan: 'free',
        status: 'active',
        tier: 'shared',
        customDomain: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...over,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  tenantUpdateOneMock.mockResolvedValue({ acknowledged: true });
  countDocumentsMock.mockResolvedValue(3);
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — read workspace details', () => {
  it('passes through resolveWorkspaceSession short-circuit (gate/401/403/404) untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, false, true);
  });

  it('forwards the ?tenant= slug and reads allowInactive=true (a suspended owner can still view)', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/workspace?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false, true);
  });

  it('returns the workspace view with the live active-member count', async () => {
    countDocumentsMock.mockResolvedValueOnce(7);

    const res = await GET(makeReq());
    const json = (await res.json()) as { workspace: { memberCount: number; slug: string; role: string } };

    expect(countDocumentsMock).toHaveBeenCalledWith({ tenant: 'tenant1', status: 'active' });
    expect(json.workspace.memberCount).toBe(7);
    expect(json.workspace.slug).toBe('acme');
    expect(json.workspace.role).toBe('owner');
  });
});

describe('PATCH — rename the workspace', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any read/write', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await PATCH(makeReq({ name: 'New Name' }));

    expect(res).toBe(blocked);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true (owner/admin only) and forwards the trimmed tenant field', async () => {
    await PATCH(makeReq({ name: 'New Name', tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('empty/blank tenant field resolves as null (defaults to the caller session tenant)', async () => {
    await PATCH(makeReq({ name: 'New Name', tenant: '   ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('blank name (after sanitize) → 400, zero write/audit', async () => {
    const res = await PATCH(makeReq({ name: '   ' }));

    expect(res.status).toBe(400);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('name unchanged (identical to current, after sanitize) → 200, zero write/audit', async () => {
    const res = await PATCH(makeReq({ name: 'Acme' }));
    const json = (await res.json()) as { workspace: { name: string } };

    expect(res.status).toBe(200);
    expect(json.workspace.name).toBe('Acme');
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('real rename → $set the new name, audit workspace.updated with actor/target/meta', async () => {
    const res = await PATCH(makeReq({ name: 'New Acme  Name' }));
    const json = (await res.json()) as { workspace: { name: string } };

    expect(tenantUpdateOneMock).toHaveBeenCalledWith({ _id: 'tenant1' }, { $set: { name: 'New Acme Name' } });
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      {
        action: 'workspace.updated',
        actor: 'acc1',
        target: 'acme',
        meta: { field: 'name', from: 'Acme', to: 'New Acme Name' },
      }
    );
    expect(json.workspace.name).toBe('New Acme Name');
  });

  it('mid-handler DB throw → clean 500 JSON (saasGuard), not an HTML crash', async () => {
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await PATCH(makeReq({ name: 'New Name' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});

describe('DELETE — soft-cancel the workspace', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before the role check', async () => {
    const blocked = NextResponse.json({ error: 'not a member' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await DELETE(makeReq());

    expect(res).toBe(blocked);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('resolves with (slug, false, true) — any active member may reach the route-level owner check', async () => {
    await DELETE(makeReq(undefined, 'https://app.example.com/api/saas/workspace?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false, true);
  });

  it('admin (not owner) → 403, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({}, 'admin'));

    const res = await DELETE(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/owner/i);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('member (not owner) → 403, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({}, 'member'));

    const res = await DELETE(makeReq());

    expect(res.status).toBe(403);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('already canceled → idempotent 200 no-op, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({ status: 'canceled' }, 'owner'));

    const res = await DELETE(makeReq());
    const json = (await res.json()) as { workspace: { status: string } };

    expect(res.status).toBe(200);
    expect(json.workspace.status).toBe('canceled');
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('owner, active workspace → cancels AND schedules the deletion it implies, 30 days out', async () => {
    // A cancel used to write `status` alone, which left the workspace in a state with no exit:
    // nothing scheduled its deletion, so it lived forever. It now carries the same 30-day window
    // the Terms promise, stamped at cancel time so the owner can be shown a date.
    const before = Date.now();
    const res = await DELETE(makeReq());
    const json = (await res.json()) as { workspace: { status: string } };

    expect(tenantUpdateOneMock).toHaveBeenCalledTimes(1);
    const [filter, update] = tenantUpdateOneMock.mock.calls[0] as unknown as [unknown, { $set: Record<string, unknown> }];
    expect(filter).toEqual({ _id: 'tenant1' });
    expect(update.$set.status).toBe('canceled');
    expect(update.$set.erasureRequestedBy).toBe('system:workspace-canceled');
    const scheduled = update.$set.erasureScheduledAt as Date;
    const days = (scheduled.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      {
        action: 'workspace.canceled',
        actor: 'acc1',
        target: 'acme',
        // The date the owner is owed rides on the row that records the cancel.
        meta: {
          field: 'status',
          from: 'active',
          to: 'canceled',
          erasureScheduledAt: scheduled.toISOString(),
        },
      }
    );
    expect(json.workspace.status).toBe('canceled');
  });

  it('mid-handler DB throw → clean 500 JSON (saasGuard)', async () => {
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await DELETE(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});
