import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// GET/DELETE /api/saas/invites is the outstanding-invite lifecycle surface (list + revoke) that
// backs the Invitations panel — zero route-level coverage before this file. The pure pieces it
// leans on run for REAL here via plain import (parseInviteStatusFilter/inviteStatusQuery/
// inviteView/collectInviteAccountIds from lib/tenancy/invites, readBody/isObjectId from
// lib/apiBody — all already unit-tested in their own files). Mocked seams: resolveWorkspaceSession
// (the auth/authz gate, tested via workspace/route.test.ts's idiom), the Invite + Account models,
// and recordAudit (auditCtx stays real). What this file covers is only the route's own job:
//   GET    - gate short-circuit passes through untouched, before any query· resolves with
//            requireManage=true (listing invites is a management action)· forwards ?tenant=·
//            ?status defaults to pending / falls back to pending on garbage / 'all' drops the
//            status constraint entirely· scopes every query to the caller's own tenant· sorts
//            newest-first· resolves inviter+accepter identities in ONE batched $in lookup and
//            skips the lookup entirely when nothing references an account (no N+1, no empty $in)·
//            a blank Account name falls back to null· never returns the token hash.
//   DELETE - gate/requireManage=true· forwards the trimmed tenant body field (blank → null)·
//            missing inviteId → 400, malformed inviteId → 400 (CastError guard), both before any
//            write· revoke is scoped to {tenant, status:'pending'} so one workspace cannot touch
//            another's invites and an accepted/revoked row is left alone (→ 404, zero audit)·
//            success audits invite.revoked with the email as target and the role as meta.
//   both   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  resolveWorkspaceSessionMock,
  inviteFindLean,
  inviteFindSort,
  inviteFindSelect,
  inviteFindMock,
  inviteUpdateLean,
  inviteUpdateSelect,
  inviteFindOneAndUpdateMock,
  accountFindLean,
  accountFindSelect,
  accountFindMock,
  recordAuditMock,
} = vi.hoisted(() => {
  const inviteFindLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const inviteFindSort = vi.fn(() => ({ lean: inviteFindLean }));
  const inviteFindSelect = vi.fn(() => ({ sort: inviteFindSort }));
  const inviteUpdateLean = vi.fn(async () => null as Record<string, unknown> | null);
  const inviteUpdateSelect = vi.fn(() => ({ lean: inviteUpdateLean }));
  const accountFindLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const accountFindSelect = vi.fn(() => ({ lean: accountFindLean }));
  return {
    resolveWorkspaceSessionMock: vi.fn(),
    inviteFindLean,
    inviteFindSort,
    inviteFindSelect,
    inviteFindMock: vi.fn(() => ({ select: inviteFindSelect })),
    inviteUpdateLean,
    inviteUpdateSelect,
    inviteFindOneAndUpdateMock: vi.fn(() => ({ select: inviteUpdateSelect })),
    accountFindLean,
    accountFindSelect,
    accountFindMock: vi.fn(() => ({ select: accountFindSelect })),
    recordAuditMock: vi.fn(async () => true),
  };
});

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/models/Invite', () => ({
  Invite: { find: inviteFindMock, findOneAndUpdate: inviteFindOneAndUpdateMock },
}));
vi.mock('@/models/Account', () => ({ Account: { find: accountFindMock } }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { GET, DELETE } from './route';

const VALID_ID = 'a'.repeat(24);

function makeReq(body: unknown = {}, url = 'https://app.example.com/api/saas/invites'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(role = 'owner') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role, plan: 'free', status: 'active' },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: { _id: 'tenant1', slug: 'acme', name: 'Acme' },
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  inviteFindLean.mockResolvedValue([]);
  inviteUpdateLean.mockResolvedValue(null);
  accountFindLean.mockResolvedValue([]);
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — list outstanding invites', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any query', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(inviteFindMock).not.toHaveBeenCalled();
    expect(accountFindMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the ?tenant= slug', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/invites?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('defaults to the pending filter, scoped to the caller own tenant, newest first', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { workspace: string; status: string };

    expect(inviteFindMock).toHaveBeenCalledWith({ tenant: 'tenant1', status: 'pending' });
    expect(inviteFindSort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(json.workspace).toBe('acme');
    expect(json.status).toBe('pending');
  });

  it('?status=all drops the status constraint entirely', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/invites?status=all'));
    expect(inviteFindMock).toHaveBeenCalledWith({ tenant: 'tenant1' });
  });

  it('?status=accepted narrows to that lifecycle stage', async () => {
    const res = await GET(makeReq(undefined, 'https://app.example.com/api/saas/invites?status=accepted'));
    const json = (await res.json()) as { status: string };

    expect(inviteFindMock).toHaveBeenCalledWith({ tenant: 'tenant1', status: 'accepted' });
    expect(json.status).toBe('accepted');
  });

  it('an unknown ?status falls back to pending (never an unfiltered listing)', async () => {
    const res = await GET(makeReq(undefined, 'https://app.example.com/api/saas/invites?status=bogus'));
    const json = (await res.json()) as { status: string };

    expect(inviteFindMock).toHaveBeenCalledWith({ tenant: 'tenant1', status: 'pending' });
    expect(json.status).toBe('pending');
  });

  it('zero invites → skips the Account lookup entirely (no empty $in query)', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { invites: unknown[] };

    expect(accountFindMock).not.toHaveBeenCalled();
    expect(json.invites).toEqual([]);
  });

  it('resolves inviter + accepter identities in ONE batched $in lookup (never N+1)', async () => {
    inviteFindLean.mockResolvedValueOnce([
      { _id: 'i1', email: 'a@x.com', role: 'member', status: 'accepted', invitedBy: 'acc1', acceptedBy: 'acc2' },
      { _id: 'i2', email: 'b@x.com', role: 'admin', status: 'accepted', invitedBy: 'acc1', acceptedBy: 'acc3' },
    ]);
    accountFindLean.mockResolvedValueOnce([
      { _id: 'acc1', email: 'owner@example.com', name: 'Owner One' },
      { _id: 'acc2', email: 'joiner@example.com', name: 'Joiner Two' },
    ]);

    const res = await GET(makeReq());
    const json = (await res.json()) as {
      invites: { inviterEmail: string | null; inviterName: string | null; accepterEmail: string | null }[];
    };

    expect(accountFindMock).toHaveBeenCalledTimes(1);
    expect(accountFindMock).toHaveBeenCalledWith({ _id: { $in: ['acc1', 'acc2', 'acc3'] } });
    expect(json.invites[0].inviterEmail).toBe('owner@example.com');
    expect(json.invites[0].inviterName).toBe('Owner One');
    expect(json.invites[0].accepterEmail).toBe('joiner@example.com');
    // acc3 has no Account row (deleted mid-flight) → nulls, not a crash.
    expect(json.invites[1].accepterEmail).toBeNull();
  });

  it('a blank Account display name resolves to null so the UI can fall back to the email', async () => {
    inviteFindLean.mockResolvedValueOnce([
      { _id: 'i1', email: 'a@x.com', role: 'member', status: 'pending', invitedBy: 'acc1' },
    ]);
    accountFindLean.mockResolvedValueOnce([{ _id: 'acc1', email: 'owner@example.com', name: '   ' }]);

    const res = await GET(makeReq());
    const json = (await res.json()) as { invites: { inviterEmail: string; inviterName: string | null }[] };

    expect(json.invites[0].inviterEmail).toBe('owner@example.com');
    expect(json.invites[0].inviterName).toBeNull();
  });

  it('flags a pending invite past its TTL as expired, a fresh one as live', async () => {
    const now = Date.now();
    inviteFindLean.mockResolvedValueOnce([
      { _id: 'stale', email: 'a@x.com', role: 'member', status: 'pending', expires: new Date(now - DAY) },
      { _id: 'live', email: 'b@x.com', role: 'member', status: 'pending', expires: new Date(now + DAY) },
    ]);

    const res = await GET(makeReq());
    const json = (await res.json()) as { invites: { id: string; expired: boolean }[] };

    expect(json.invites.find((i) => i.id === 'stale')?.expired).toBe(true);
    expect(json.invites.find((i) => i.id === 'live')?.expired).toBe(false);
  });

  it('never returns the token hash — neither projected nor serialized', async () => {
    inviteFindLean.mockResolvedValueOnce([
      { _id: 'i1', email: 'a@x.com', role: 'member', status: 'pending', tokenHash: 'super-secret-hash' },
    ]);

    const res = await GET(makeReq());
    const body = JSON.stringify(await res.json());

    expect(inviteFindSelect).toHaveBeenCalledWith(expect.not.stringContaining('tokenHash'));
    expect(body).not.toContain('super-secret-hash');
    expect(body).not.toContain('tokenHash');
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    inviteFindLean.mockRejectedValueOnce(new Error('mongo down'));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});

describe('DELETE — revoke a pending invite', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any write', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await DELETE(makeReq({ inviteId: VALID_ID }));

    expect(res).toBe(blocked);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the trimmed tenant body field', async () => {
    await DELETE(makeReq({ inviteId: VALID_ID, tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('blank tenant field resolves as null', async () => {
    await DELETE(makeReq({ inviteId: VALID_ID, tenant: '   ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('missing inviteId → 400, zero write', async () => {
    const res = await DELETE(makeReq({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/inviteId is required/i);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('malformed inviteId → 400 before Mongoose (CastError guard), zero write', async () => {
    const res = await DELETE(makeReq({ inviteId: 'not-an-object-id' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid inviteId/i);
    expect(inviteFindOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('no pending invite with that id in this workspace → 404, zero audit', async () => {
    inviteUpdateLean.mockResolvedValueOnce(null);

    const res = await DELETE(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/no pending invite/i);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('success → scoped to {tenant, pending}, sets revoked, audits invite.revoked', async () => {
    inviteUpdateLean.mockResolvedValueOnce({ email: 'invitee@example.com', role: 'admin' });

    const res = await DELETE(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { revoked: string };

    expect(inviteFindOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: VALID_ID, tenant: 'tenant1', status: 'pending' },
      { $set: { status: 'revoked' } }
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      {
        action: 'invite.revoked',
        actor: 'acc1',
        target: 'invitee@example.com',
        meta: { role: 'admin' },
      }
    );
    expect(json.revoked).toBe(VALID_ID);
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    inviteUpdateLean.mockRejectedValueOnce(new Error('mongo down'));

    const res = await DELETE(makeReq({ inviteId: VALID_ID }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});
