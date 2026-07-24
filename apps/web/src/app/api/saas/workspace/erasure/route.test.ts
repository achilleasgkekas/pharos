import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST/DELETE /api/saas/workspace/erasure is the ONLY place a GDPR Art. 17 erasure
// request gets scheduled or canceled for a tenant — it has zero route-level coverage today
// (grep of api/saas/**/*.test.ts: only billing/webhook, invites/accept, billing/checkout,
// billing/portal have one). The pure scheduling math (`planErasureRequest`/`planErasureCancel`/
// `erasureView`/`isErasureRequested`) already has full unit coverage in `erasure.test.ts` and
// runs for REAL here via plain import — only the session/DB/audit seams are mocked. This closes
// the gap for what the route itself is responsible for:
//   - resolveWorkspaceSession's short-circuit response is passed straight through untouched,
//   - only the owner may request/cancel (member/admin → 403),
//   - both POST and DELETE are idempotent (already-pending request / nothing-pending cancel →
//     current state, zero Tenant.updateOne, zero audit row),
//   - a real request/cancel updates Tenant + audits the correct action with the correct actor.

const { resolveWorkspaceSessionMock, tenantUpdateOneMock, recordAuditMock } = vi.hoisted(() => ({
  resolveWorkspaceSessionMock: vi.fn(),
  tenantUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
  recordAuditMock: vi.fn(async () => true),
}));

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { updateOne: tenantUpdateOneMock } }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { GET, POST, DELETE } from './route';
import { NextResponse } from 'next/server';

function makeReq(body: unknown = {}, url = 'https://app.example.com/api/saas/workspace/erasure'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(over: Record<string, unknown> = {}) {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role: 'owner', plan: 'free', status: 'active' },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: {
        erasureRequestedAt: null,
        erasureScheduledAt: null,
        erasureRequestedBy: null,
        ...over,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  tenantUpdateOneMock.mockResolvedValue({ acknowledged: true });
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — read current erasure state', () => {
  it('passes through resolveWorkspaceSession short-circuit (gate/401/403/404) untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, false, true);
  });

  it('forwards the ?tenant= slug and reads allowInactive=true (a suspended owner can still view)', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/workspace/erasure?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false, true);
  });

  it('no pending erasure → requested:false, no due/graceDaysLeft', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { erasure: { requested: boolean; due: boolean; graceDaysLeft: number | null } };
    expect(json.erasure.requested).toBe(false);
    expect(json.erasure.due).toBe(false);
    expect(json.erasure.graceDaysLeft).toBeNull();
  });

  it('pending erasure → reflects the real erasureView projection', async () => {
    const requestedAt = new Date('2026-06-01T00:00:00Z');
    const scheduledAt = new Date('2026-07-01T00:00:00Z');
    resolveWorkspaceSessionMock.mockResolvedValueOnce(
      makeSession({ erasureRequestedAt: requestedAt, erasureScheduledAt: scheduledAt, erasureRequestedBy: 'acc1' })
    );

    const res = await GET(makeReq());
    const json = (await res.json()) as { erasure: { requested: boolean; requestedBy: string | null } };
    expect(json.erasure.requested).toBe(true);
    expect(json.erasure.requestedBy).toBe('acc1');
  });
});

describe('POST — schedule erasure', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, never writes/audits', async () => {
    const blocked = NextResponse.json({ error: 'not a member of that workspace' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({}));

    expect(res).toBe(blocked);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('non-owner (admin/member) → 403, never writes/audits', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(
      makeSession() // default tenant fine, override the role below
    );
    resolveWorkspaceSessionMock.mockReset();
    resolveWorkspaceSessionMock.mockResolvedValueOnce({
      session: { ...makeSession().session, workspace: { ...makeSession().session.workspace, role: 'admin' } },
    });

    const res = await POST(makeReq({}));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/owner/);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('already pending → idempotent, returns current state, zero write/audit', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(
      makeSession({ erasureRequestedAt: new Date('2026-06-01'), erasureScheduledAt: new Date('2026-07-01') })
    );

    const res = await POST(makeReq({}));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { erasure: { requested: boolean } };
    expect(json.erasure.requested).toBe(true);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('owner, nothing pending → writes Tenant.updateOne + audits workspace.erasure_requested with the correct actor/tenant', async () => {
    const res = await POST(makeReq({}));

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'tenant1' },
      expect.objectContaining({ $set: expect.objectContaining({ erasureRequestedBy: 'acc1' }) })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({ action: 'workspace.erasure_requested', actor: 'acc1', target: 'acme' })
    );
    const json = (await res.json()) as { erasure: { requested: boolean } };
    expect(json.erasure.requested).toBe(true);
  });

  it('forwards a trimmed tenant slug from the body to resolveWorkspaceSession', async () => {
    await POST(makeReq({ tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false, true);
  });

  it('a mid-handler DB throw surfaces as a clean 500 JSON (saasGuard), not an HTML crash page', async () => {
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('boom');
  });
});

describe('DELETE — cancel erasure', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, never writes/audits', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await DELETE(makeReq());

    expect(res).toBe(blocked);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('non-owner → 403, never writes/audits', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce({
      session: { ...makeSession().session, workspace: { ...makeSession().session.workspace, role: 'member' } },
    });

    const res = await DELETE(makeReq());

    expect(res.status).toBe(403);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('nothing pending → idempotent no-op, zero write/audit', async () => {
    const res = await DELETE(makeReq());

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('owner, pending erasure → clears via Tenant.updateOne + audits workspace.erasure_canceled', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(
      makeSession({ erasureRequestedAt: new Date('2026-06-01'), erasureScheduledAt: new Date('2026-07-01'), erasureRequestedBy: 'acc1' })
    );

    const res = await DELETE(makeReq());

    expect(res.status).toBe(200);
    expect(tenantUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'tenant1' },
      { $set: { erasureRequestedAt: null, erasureScheduledAt: null, erasureRequestedBy: null } }
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({ action: 'workspace.erasure_canceled', actor: 'acc1', target: 'acme' })
    );
    const json = (await res.json()) as { erasure: { requested: boolean } };
    expect(json.erasure.requested).toBe(false);
  });

  it('a mid-handler DB throw surfaces as a clean 500 JSON (saasGuard)', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(
      makeSession({ erasureRequestedAt: new Date('2026-06-01'), erasureScheduledAt: new Date('2026-07-01') })
    );
    tenantUpdateOneMock.mockRejectedValueOnce(new Error('db down'));

    const res = await DELETE(makeReq());
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('db down');
  });
});
