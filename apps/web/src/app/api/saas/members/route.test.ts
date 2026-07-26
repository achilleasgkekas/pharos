import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// GET/POST/PATCH/DELETE /api/saas/members is the workspace member-management surface —
// zero route-level coverage before this file (the auth/authz seam it sits on,
// resolveWorkspaceSession, already has its own dedicated tests via workspace/route.test.ts's
// idiom; the pure guard math it calls — parseRole/canAssignRole/wouldOrphanOwners/
// normalizeEmail/looksLikeEmail, lib/tenancy/members.ts — is fully unit-tested in
// members.test.ts and runs for REAL here via plain import, same for readBody/strField
// (lib/apiBody), withinSeatLimit/entitlementsFor (lib/billing/entitlements), pickBaseUrl
// (lib/billing/billingRoutes) and mintInviteToken (lib/tenancy/invites)). Mocked seams:
// resolveWorkspaceSession, Membership/Account/Invite models, sendEmail + mailerCanDeliver
// (lib/tenancy/mailer — invitedEmail/inviteEmail/inviteLinkUrl stay real, they are pure
// message builders), recordAudit (auditCtx stays real).
//   GET    - gate short-circuit passes through untouched· resolves with requireManage=false
//            (any active member may list)· forwards ?tenant=· returns {workspace, members}
//            joined from Membership+Account.
//   POST   - gate/requireManage=true· invalid email/role -> 400, zero Account lookup· only an
//            owner may mint an owner -> 403 before any Account lookup· email with NO account
//            yet -> mints an email Invite (seat-limit-aware, supersedes prior pending, audits
//            invite.sent, 201 with devToken since no mailer is configured in tests)· existing
//            active member -> 409· seat limit reached -> 409, zero write· new member -> creates
//            Membership + audits member.added + notifies (201)· removed member re-added ->
//            reactivates in place (updateOne, not create)· a mid-handler throw -> clean 500.
//   PATCH  - gate/requireManage=true· missing accountId/invalid role -> 400· only an owner may
//            promote to owner -> 403· unknown/removed target -> 404· demoting the sole owner ->
//            409 last_owner, zero write· real role change -> updateOne + audit
//            member.role_changed· mid-handler throw -> 500.
//   DELETE - gate/requireManage=true· missing accountId -> 400· unknown/already-removed target
//            -> 404· removing the sole owner -> 409 last_owner, zero write· real removal ->
//            updateOne(status: removed) + audit member.removed· mid-handler throw -> 500.

const {
  resolveWorkspaceSessionMock,
  membershipFindLean,
  membershipFindSelect,
  membershipFindMock,
  membershipFindOneLean,
  membershipFindOneSelect,
  membershipFindOneMock,
  membershipCountDocumentsMock,
  membershipUpdateOneMock,
  membershipCreateMock,
  accountFindLean,
  accountFindSelect,
  accountFindMock,
  accountFindOneLean,
  accountFindOneSelect,
  accountFindOneMock,
  inviteCountDocumentsMock,
  inviteUpdateManyMock,
  inviteCreateMock,
  sendEmailMock,
  mailerCanDeliverMock,
  recordAuditMock,
} = vi.hoisted(() => {
  const membershipFindLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const membershipFindSelect = vi.fn(() => ({ lean: membershipFindLean }));
  const membershipFindOneLean = vi.fn(async () => null as Record<string, unknown> | null);
  const membershipFindOneSelect = vi.fn(() => ({ lean: membershipFindOneLean }));
  const accountFindLean = vi.fn(async () => [] as Array<Record<string, unknown>>);
  const accountFindSelect = vi.fn(() => ({ lean: accountFindLean }));
  const accountFindOneLean = vi.fn(async () => null as Record<string, unknown> | null);
  const accountFindOneSelect = vi.fn(() => ({ lean: accountFindOneLean }));
  return {
    resolveWorkspaceSessionMock: vi.fn(),
    membershipFindLean,
    membershipFindSelect,
    membershipFindMock: vi.fn(() => ({ select: membershipFindSelect })),
    membershipFindOneLean,
    membershipFindOneSelect,
    membershipFindOneMock: vi.fn(() => ({ select: membershipFindOneSelect })),
    membershipCountDocumentsMock: vi.fn(async () => 0),
    membershipUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
    membershipCreateMock: vi.fn(async () => ({})),
    accountFindLean,
    accountFindSelect,
    accountFindMock: vi.fn(() => ({ select: accountFindSelect })),
    accountFindOneLean,
    accountFindOneSelect,
    accountFindOneMock: vi.fn(() => ({ select: accountFindOneSelect })),
    inviteCountDocumentsMock: vi.fn(async () => 0),
    inviteUpdateManyMock: vi.fn(async () => ({ acknowledged: true })),
    inviteCreateMock: vi.fn(async () => ({})),
    sendEmailMock: vi.fn(async () => ({ delivered: false, provider: 'none' as const })),
    mailerCanDeliverMock: vi.fn(() => false),
    recordAuditMock: vi.fn(async () => true),
  };
});

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/models/Membership', () => ({
  Membership: {
    find: membershipFindMock,
    findOne: membershipFindOneMock,
    countDocuments: membershipCountDocumentsMock,
    updateOne: membershipUpdateOneMock,
    create: membershipCreateMock,
  },
}));
vi.mock('@/models/Account', () => ({
  Account: { find: accountFindMock, findOne: accountFindOneMock },
}));
vi.mock('@/models/Invite', () => ({
  Invite: {
    countDocuments: inviteCountDocumentsMock,
    updateMany: inviteUpdateManyMock,
    create: inviteCreateMock,
  },
}));
vi.mock('@/lib/tenancy/mailer', async () => {
  // invitedEmail/inviteEmail/inviteLinkUrl are pure message builders — run for real.
  const actual = await vi.importActual<typeof import('@/lib/tenancy/mailer')>('@/lib/tenancy/mailer');
  return { ...actual, sendEmail: sendEmailMock, mailerCanDeliver: mailerCanDeliverMock };
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { GET, POST, PATCH, DELETE } from './route';

function makeReq(body: unknown = {}, url = 'https://app.example.com/api/saas/members'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(role = 'owner', plan = 'shared') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 't1', slug: 'acme', name: 'Acme', role, plan, status: 'active' },
      ctx: { tenantId: 't1', isDefault: false },
      tenant: { _id: 't1', slug: 'acme', name: 'Acme', plan, status: 'active' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  membershipFindLean.mockResolvedValue([]);
  membershipFindOneLean.mockResolvedValue(null);
  membershipCountDocumentsMock.mockResolvedValue(0);
  membershipUpdateOneMock.mockResolvedValue({ acknowledged: true });
  membershipCreateMock.mockResolvedValue({});
  accountFindLean.mockResolvedValue([]);
  accountFindOneLean.mockResolvedValue(null);
  inviteCountDocumentsMock.mockResolvedValue(0);
  inviteUpdateManyMock.mockResolvedValue({ acknowledged: true });
  inviteCreateMock.mockResolvedValue({});
  sendEmailMock.mockResolvedValue({ delivered: false, provider: 'none' });
  mailerCanDeliverMock.mockReturnValue(false);
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — list members', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, zero Membership read', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, false);
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('forwards the ?tenant= slug', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/members?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', false);
  });

  it('returns {workspace, members} joined from Membership + Account', async () => {
    membershipFindLean.mockResolvedValueOnce([
      { account: 'acc2', role: 'member', status: 'active', invitedBy: null, createdAt: new Date('2026-01-05') },
    ]);
    accountFindLean.mockResolvedValueOnce([{ _id: 'acc2', email: 'bob@example.com', name: 'Bob' }]);

    const res = await GET(makeReq());
    const json = (await res.json()) as { workspace: string; members: Array<Record<string, unknown>> };

    expect(json.workspace).toBe('acme');
    expect(json.members).toEqual([
      {
        accountId: 'acc2',
        email: 'bob@example.com',
        name: 'Bob',
        role: 'member',
        status: 'active',
        invitedBy: null,
        createdAt: '2026-01-05T00:00:00.000Z',
      },
    ]);
  });

  it('a mid-handler throw becomes a clean 500 JSON via saasGuard', async () => {
    membershipFindLean.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('db down');
  });
});

describe('POST — add a member', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, zero Account lookup', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await POST(makeReq({ email: 'x@example.com' }));

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('forwards the trimmed tenant body field', async () => {
    await POST(makeReq({ email: 'x@example.com', tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('invalid email → 400, zero Account lookup', async () => {
    const res = await POST(makeReq({ email: 'not-an-email' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('a valid email is required');
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('invalid role → 400, zero Account lookup', async () => {
    const res = await POST(makeReq({ email: 'bob@example.com', role: 'superadmin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('role must be owner, admin, or member');
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  it('an admin (not owner) trying to mint an owner → 403, zero Account lookup', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('admin'));

    const res = await POST(makeReq({ email: 'bob@example.com', role: 'owner' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toBe('only an owner may assign the owner role');
    expect(accountFindOneMock).not.toHaveBeenCalled();
  });

  describe('email has no account yet → mints an invite', () => {
    it('seat limit reached (free plan, 1 active) → 409 seat_limit, zero Invite.create', async () => {
      resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('owner', 'free'));
      membershipCountDocumentsMock.mockResolvedValueOnce(1);

      const res = await POST(makeReq({ email: 'new@example.com' }));
      const json = (await res.json()) as { code: string; maxMembers: number };

      expect(res.status).toBe(409);
      expect(json.code).toBe('seat_limit');
      expect(json.maxMembers).toBe(1);
      expect(inviteCreateMock).not.toHaveBeenCalled();
    });

    it('mints an Invite, supersedes prior pending, audits invite.sent, 201 with devToken', async () => {
      const res = await POST(makeReq({ email: 'New@Example.com  '.trim() }));
      const json = (await res.json()) as {
        invite: { email: string; role: string; status: string };
        inviteByEmail: boolean;
        devToken?: string;
      };

      expect(inviteUpdateManyMock).toHaveBeenCalledWith(
        { tenant: 't1', email: 'new@example.com', status: 'pending' },
        { $set: { status: 'revoked' } }
      );
      expect(inviteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant: 't1',
          email: 'new@example.com',
          role: 'member',
          status: 'pending',
          invitedBy: 'acc1',
        })
      );
      expect(recordAuditMock).toHaveBeenCalledWith(
        { tenantId: 't1', isDefault: false },
        expect.objectContaining({ action: 'invite.sent', actor: 'acc1', target: 'new@example.com' })
      );
      // no mailer configured in tests (mailerCanDeliver mocked false) → dev-mode echoes the token
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(res.status).toBe(201);
      expect(json.inviteByEmail).toBe(true);
      expect(json.invite).toEqual(
        expect.objectContaining({ email: 'new@example.com', role: 'member', status: 'pending' })
      );
      expect(typeof json.devToken).toBe('string');
    });
  });

  it('already an active member → 409, zero create/updateOne', async () => {
    accountFindOneLean.mockResolvedValueOnce({ _id: 'acc2', email: 'bob@example.com', name: 'Bob' });
    membershipFindOneLean.mockResolvedValueOnce({ status: 'active' });

    const res = await POST(makeReq({ email: 'bob@example.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(json.error).toBe('already a member of this workspace');
    expect(membershipCreateMock).not.toHaveBeenCalled();
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
  });

  it('seat limit reached for a brand-new member → 409, zero create', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('owner', 'free'));
    accountFindOneLean.mockResolvedValueOnce({ _id: 'acc2', email: 'bob@example.com', name: 'Bob' });
    membershipCountDocumentsMock.mockResolvedValueOnce(1);

    const res = await POST(makeReq({ email: 'bob@example.com' }));
    const json = (await res.json()) as { code: string; maxMembers: number };

    expect(res.status).toBe(409);
    expect(json.code).toBe('seat_limit');
    expect(json.maxMembers).toBe(1);
    expect(membershipCreateMock).not.toHaveBeenCalled();
  });

  it('new member → creates Membership, audits member.added, notifies, 201', async () => {
    accountFindOneLean.mockResolvedValueOnce({ _id: 'acc2', email: 'bob@example.com', name: 'Bob' });

    const res = await POST(makeReq({ email: 'bob@example.com', role: 'admin' }));
    const json = (await res.json()) as { member: Record<string, unknown> };

    expect(membershipCreateMock).toHaveBeenCalledWith({
      account: 'acc2',
      tenant: 't1',
      role: 'admin',
      status: 'active',
      invitedBy: 'acc1',
    });
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 't1', isDefault: false },
      expect.objectContaining({
        action: 'member.added',
        actor: 'acc1',
        target: 'bob@example.com',
        meta: { role: 'admin', reactivated: false },
      })
    );
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'bob@example.com' }));
    expect(res.status).toBe(201);
    expect(json.member).toEqual({
      accountId: 'acc2',
      email: 'bob@example.com',
      name: 'Bob',
      role: 'admin',
      status: 'active',
    });
  });

  it('a previously-removed member → reactivated in place (updateOne), not re-created', async () => {
    accountFindOneLean.mockResolvedValueOnce({ _id: 'acc2', email: 'bob@example.com', name: 'Bob' });
    membershipFindOneLean.mockResolvedValueOnce({ status: 'removed' });

    const res = await POST(makeReq({ email: 'bob@example.com', role: 'member' }));

    expect(membershipUpdateOneMock).toHaveBeenCalledWith(
      { account: 'acc2', tenant: 't1' },
      { $set: { status: 'active', role: 'member', invitedBy: 'acc1' } }
    );
    expect(membershipCreateMock).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 't1', isDefault: false },
      expect.objectContaining({ meta: { role: 'member', reactivated: true } })
    );
    expect(res.status).toBe(201);
  });

  it('a mid-handler throw (Account.findOne rejecting) becomes a clean 500 JSON via saasGuard', async () => {
    accountFindOneLean.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(makeReq({ email: 'bob@example.com' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('db down');
  });
});

describe('PATCH — change a member role', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, zero Membership read', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'admin' }));

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('missing accountId → 400, zero Membership read', async () => {
    const res = await PATCH(makeReq({ role: 'admin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('accountId is required');
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('invalid role → 400', async () => {
    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'superadmin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('role must be owner, admin, or member');
  });

  it('an admin (not owner) trying to promote to owner → 403, zero Membership read', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession('admin'));

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'owner' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(json.error).toBe('only an owner may assign the owner role');
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('unknown target account → 404, zero write', async () => {
    membershipFindLean.mockResolvedValueOnce([{ account: 'acc1', role: 'owner', status: 'active' }]);

    const res = await PATCH(makeReq({ accountId: 'ghost', role: 'admin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe('member not found');
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
  });

  it('already-removed target → 404, zero write', async () => {
    membershipFindLean.mockResolvedValueOnce([{ account: 'acc2', role: 'member', status: 'removed' }]);

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'admin' }));

    expect(res.status).toBe(404);
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
  });

  it('demoting the sole active owner → 409 last_owner, zero write/audit', async () => {
    membershipFindLean.mockResolvedValueOnce([{ account: 'acc2', role: 'owner', status: 'active' }]);

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'member' }));
    const json = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(409);
    expect(json.code).toBe('last_owner');
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('real role change → updateOne + audit member.role_changed with from/to', async () => {
    membershipFindLean.mockResolvedValueOnce([
      { account: 'acc2', role: 'member', status: 'active' },
      { account: 'acc1', role: 'owner', status: 'active' },
    ]);
    accountFindLean.mockResolvedValueOnce([{ _id: 'acc2', email: 'carol@example.com', name: 'Carol' }]);

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'admin' }));
    const json = (await res.json()) as { member: { accountId: string; role: string } };

    expect(membershipUpdateOneMock).toHaveBeenCalledWith(
      { account: 'acc2', tenant: 't1' },
      { $set: { role: 'admin' } }
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 't1', isDefault: false },
      {
        action: 'member.role_changed',
        actor: 'acc1',
        target: 'carol@example.com',
        meta: { from: 'member', to: 'admin', accountId: 'acc2' },
      }
    );
    expect(json.member).toEqual({ accountId: 'acc2', role: 'admin' });
  });

  it('a mid-handler throw becomes a clean 500 JSON via saasGuard', async () => {
    membershipFindLean.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH(makeReq({ accountId: 'acc2', role: 'admin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('db down');
  });
});

describe('DELETE — remove a member', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, zero Membership read', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await DELETE(makeReq({ accountId: 'acc2' }));

    expect(res).toBe(blocked);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('missing accountId → 400, zero Membership read', async () => {
    const res = await DELETE(makeReq({}));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('accountId is required');
    expect(membershipFindMock).not.toHaveBeenCalled();
  });

  it('unknown target account → 404, zero write', async () => {
    membershipFindLean.mockResolvedValueOnce([{ account: 'acc1', role: 'owner', status: 'active' }]);

    const res = await DELETE(makeReq({ accountId: 'ghost' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe('member not found');
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
  });

  it('removing the sole active owner → 409 last_owner, zero write/audit', async () => {
    membershipFindLean.mockResolvedValueOnce([{ account: 'acc2', role: 'owner', status: 'active' }]);

    const res = await DELETE(makeReq({ accountId: 'acc2' }));
    const json = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(409);
    expect(json.code).toBe('last_owner');
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('real removal → updateOne(status: removed) + audit member.removed', async () => {
    membershipFindLean.mockResolvedValueOnce([
      { account: 'acc2', role: 'member', status: 'active' },
      { account: 'acc1', role: 'owner', status: 'active' },
    ]);
    accountFindLean.mockResolvedValueOnce([{ _id: 'acc2', email: 'carol@example.com', name: 'Carol' }]);

    const res = await DELETE(makeReq({ accountId: 'acc2' }));
    const json = (await res.json()) as { removed: string };

    expect(membershipUpdateOneMock).toHaveBeenCalledWith(
      { account: 'acc2', tenant: 't1' },
      { $set: { status: 'removed' } }
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 't1', isDefault: false },
      {
        action: 'member.removed',
        actor: 'acc1',
        target: 'carol@example.com',
        meta: { role: 'member', accountId: 'acc2' },
      }
    );
    expect(json.removed).toBe('acc2');
  });

  it('a mid-handler throw becomes a clean 500 JSON via saasGuard', async () => {
    membershipFindLean.mockRejectedValueOnce(new Error('db down'));

    const res = await DELETE(makeReq({ accountId: 'acc2' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('db down');
  });
});
