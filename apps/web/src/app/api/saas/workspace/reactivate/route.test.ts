import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/saas/workspace/reactivate is the complement of DELETE /api/saas/workspace (soft
// cancel): an owner reverses their own cancel and flips the tenant back to `active`. Zero
// route-level coverage before this file. The pure guards (`canReactivateWorkspace`/
// `reactivateStatusError`/`workspaceView`) already have full unit coverage in workspace.test.ts
// and run for REAL here via plain import — only the session/DB/audit seams are mocked. This
// covers what the route itself is responsible for:
//   - resolveWorkspaceSession's short-circuit response is passed straight through untouched,
//   - resolves with (slug, false, true) — allowInactive so a canceled tenant is reachable at
//     all, then the route enforces its OWN stricter owner-only gate,
//   - non-owner (admin/member) → 403 before any status check/write,
//   - only a `canceled` status may reactivate; active/suspended/trialing/pending/unknown all
//     map to their distinct 409 messages, zero write/audit,
//   - a real reactivate → $set status active, audits workspace.reactivated with from/to, live
//     member count in the response,
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

import { POST } from './route';
import { NextResponse } from 'next/server';

function makeReq(
  body: unknown = {},
  url = 'https://app.example.com/api/saas/workspace/reactivate'
): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(status = 'canceled', role = 'owner') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role, plan: 'free', status },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: {
        _id: 'tenant1',
        slug: 'acme',
        name: 'Acme',
        plan: 'free',
        status,
        tier: 'shared',
        customDomain: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
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

describe('POST /api/saas/workspace/reactivate', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before the role check', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq());

    expect(res).toBe(blocked);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it('resolves with (slug, false, true) — allowInactive so the canceled tenant is reachable, and forwards the trimmed tenant field', async () => {
    await POST(makeReq({ tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false, true);
  });

  it('empty/blank tenant field resolves as null', async () => {
    await POST(makeReq({ tenant: '   ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, false, true);
  });

  it('admin (not owner) → 403, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('canceled', 'admin'));

    const res = await POST(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/owner/i);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('member (not owner) → 403, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('canceled', 'member'));

    const res = await POST(makeReq());

    expect(res.status).toBe(403);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
  });

  it.each([
    ['active', /already active/i],
    ['trialing', /already active/i],
    ['suspended', /resolving billing/i],
    ['pending', /still being set up/i],
    ['weird-unknown-status', /cannot be reactivated/i],
  ])('owner, status=%s → 409 with the matching message, zero write/audit', async (status, msgPattern) => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession(status, 'owner'));

    const res = await POST(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(json.error).toMatch(msgPattern);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('owner, canceled workspace → $set status active, audit workspace.reactivated with from/to, live member count', async () => {
    countDocumentsMock.mockResolvedValueOnce(5);

    const res = await POST(makeReq());
    const json = (await res.json()) as { workspace: { status: string; memberCount: number; slug: string } };

    expect(tenantUpdateOneMock).toHaveBeenCalledWith({ _id: 'tenant1' }, { $set: { status: 'active' } });
    expect(countDocumentsMock).toHaveBeenCalledWith({ tenant: 'tenant1', status: 'active' });
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      {
        action: 'workspace.reactivated',
        actor: 'acc1',
        target: 'acme',
        meta: { field: 'status', from: 'canceled', to: 'active' },
      }
    );
    expect(json.workspace.status).toBe('active');
    expect(json.workspace.memberCount).toBe(5);
    expect(json.workspace.slug).toBe('acme');
  });

  it('mid-handler throw → clean 500 JSON (saasGuard), not an HTML crash', async () => {
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await POST(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});
