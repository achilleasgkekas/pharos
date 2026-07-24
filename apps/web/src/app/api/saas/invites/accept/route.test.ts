import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hashInviteToken } from '@/lib/tenancy/invites';

// POST /api/saas/invites/accept is the ONLY unauthenticated SaaS route that mints an Account +
// active Membership from nothing but a mailed token — a bug here either lets an invite be
// replayed/misapplied, or silently drops the invitee's role. It got a try/catch in increment 85
// (WEB_DEBT P2, unexpected throw → clean 500 instead of Next's HTML 500 page) but had zero
// route-level coverage (grep of api/saas/**/*.test.ts: only billing/webhook has one). This
// closes that gap for what the route itself is responsible for (not the already-unit-tested
// pure helpers in lib/tenancy/invites.ts, which run for real here via importActual-equivalent
// plain import — only the DB/session/audit seams are mocked):
//   - the token-required / invite-not-found / invite-expired-or-consumed short-circuits,
//   - the "no account yet needs a password" vs "account already exists, no password needed"
//     branch,
//   - the create-vs-reuse Membership branch (idempotent accept),
//   - the concurrent-account-creation race fallback (duplicate key 11000),
//   - that a mid-handler DB throw surfaces as a clean 500 JSON (so it isn't swallowed to 200).

const {
  connectDBMock,
  accountFindOne,
  accountFindOneSelect,
  accountCreateMock,
  membershipFindOne,
  membershipFindOneSelect,
  membershipFindOneLean,
  membershipUpdateOneMock,
  membershipCreateMock,
  inviteFindOne,
  inviteUpdateOneMock,
  hashPasswordMock,
  saasAuthGateMock,
  accountTenantsMock,
  setAccountCookieMock,
  recordAuditMock,
} = vi.hoisted(() => {
  const accountFindOneSelect = vi.fn(async () => null as Record<string, unknown> | null);
  const membershipFindOneLean = vi.fn(async () => null as Record<string, unknown> | null);
  return {
    connectDBMock: vi.fn(async () => {}),
    accountFindOne: vi.fn(() => ({ select: accountFindOneSelect })),
    accountFindOneSelect,
    accountCreateMock: vi.fn(
      async (doc: Record<string, unknown>): Promise<Record<string, unknown>> => ({ _id: 'acc-new', ...doc })
    ),
    membershipFindOne: vi.fn(() => ({ select: membershipFindOneSelect })),
    membershipFindOneSelect: vi.fn(() => ({ lean: membershipFindOneLean })),
    membershipFindOneLean,
    membershipUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
    membershipCreateMock: vi.fn(async () => ({})),
    inviteFindOne: vi.fn(async () => null as Record<string, unknown> | null),
    inviteUpdateOneMock: vi.fn(async () => ({ acknowledged: true })),
    hashPasswordMock: vi.fn((plain: string) => `hashed:${plain}`),
    saasAuthGateMock: vi.fn(() => null as NextResponse | null),
    accountTenantsMock: vi.fn(async () => [] as unknown[]),
    setAccountCookieMock: vi.fn(async () => {}),
    recordAuditMock: vi.fn(async () => true),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Account', () => ({ Account: { findOne: accountFindOne, create: accountCreateMock } }));
vi.mock('@/models/Membership', () => ({
  Membership: { findOne: membershipFindOne, updateOne: membershipUpdateOneMock, create: membershipCreateMock },
}));
vi.mock('@/models/Invite', () => ({ Invite: { findOne: inviteFindOne, updateOne: inviteUpdateOneMock } }));
vi.mock('@/lib/auth', () => ({ hashPassword: hashPasswordMock }));
vi.mock('@/lib/tenancy/saasApi', () => ({ saasAuthGate: saasAuthGateMock, accountTenants: accountTenantsMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({ setAccountCookie: setAccountCookieMock }));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx stays real (pure)
});

import { POST } from './route';

const GOOD_TOKEN = 'good-invite-token';

/** Fresh fake Invite row — real hashInviteToken so the route's hash lookup matches. */
function makeInvite(over: Record<string, unknown> = {}) {
  return {
    _id: 'inv1',
    tenant: 'tenant1',
    email: 'invitee@example.com',
    role: 'member',
    status: 'pending',
    tokenHash: hashInviteToken(GOOD_TOKEN),
    expires: new Date(Date.now() + 60 * 60 * 1000),
    invitedBy: null,
    ...over,
  };
}

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  saasAuthGateMock.mockReturnValue(null);
  accountFindOneSelect.mockImplementation(async () => null);
  accountCreateMock.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: 'acc-new', ...doc }));
  membershipFindOneLean.mockImplementation(async () => null);
  membershipUpdateOneMock.mockImplementation(async () => ({ acknowledged: true }));
  membershipCreateMock.mockImplementation(async () => ({}));
  inviteFindOne.mockImplementation(async () => null);
  inviteUpdateOneMock.mockImplementation(async () => ({ acknowledged: true }));
  hashPasswordMock.mockImplementation((plain: string) => `hashed:${plain}`);
  accountTenantsMock.mockImplementation(async () => []);
  setAccountCookieMock.mockImplementation(async () => {});
  recordAuditMock.mockImplementation(async () => true);
});

describe('gate + validation', () => {
  it('returns whatever saasAuthGate returns (SAAS_MODE off / AUTH_SECRET missing), never touches the DB', async () => {
    const blocked = NextResponse.json({ error: 'nope' }, { status: 404 });
    saasAuthGateMock.mockReturnValue(blocked);
    const res = await POST(makeReq({ token: GOOD_TOKEN }));
    expect(res).toBe(blocked);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('missing token → 400, never touches the DB', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('unknown token (no matching invite hash) → 410', async () => {
    inviteFindOne.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ token: 'bogus' }));
    expect(res.status).toBe(410);
  });

  it('expired invite → 410', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite({ expires: new Date(Date.now() - 1000) }));
    const res = await POST(makeReq({ token: GOOD_TOKEN }));
    expect(res.status).toBe(410);
  });

  it('already-accepted invite → 410 (no replay)', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite({ status: 'accepted' }));
    const res = await POST(makeReq({ token: GOOD_TOKEN }));
    expect(res.status).toBe(410);
  });
});

describe('no existing account (fresh invitee)', () => {
  it('password too short → 400 password_required, nothing created', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ token: GOOD_TOKEN, password: 'short' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('password_required');
    expect(accountCreateMock).not.toHaveBeenCalled();
  });

  it('valid password → creates account + membership, consumes invite, audits, sets cookie, 201', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce(null);
    accountCreateMock.mockResolvedValueOnce({ _id: 'acc1', email: 'invitee@example.com', name: 'Jo' });
    membershipFindOneLean.mockResolvedValueOnce(null);
    accountTenantsMock.mockResolvedValueOnce([
      { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role: 'member', plan: 'free', status: 'active' },
    ]);

    const res = await POST(makeReq({ token: GOOD_TOKEN, password: 'longenough', name: 'Jo' }));

    expect(accountFindOne).toHaveBeenCalledWith({ email: 'invitee@example.com' });
    expect(hashPasswordMock).toHaveBeenCalledWith('longenough');
    expect(accountCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'invitee@example.com', name: 'Jo', passwordHash: 'hashed:longenough' })
    );
    expect(membershipCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acc1', tenant: 'tenant1', role: 'member', status: 'active' })
    );
    expect(membershipUpdateOneMock).not.toHaveBeenCalled();
    expect(inviteUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'inv1' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'accepted', acceptedBy: 'acc1' }) })
    );
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant1' }),
      expect.objectContaining({ action: 'invite.accepted', actor: 'acc1', target: 'invitee@example.com' })
    );
    expect(setAccountCookieMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'invitee@example.com' });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { account: unknown; tenants: unknown };
    expect(json.account).toEqual({ id: 'acc1', email: 'invitee@example.com', name: 'Jo' });
    expect(json.tenants).toEqual([
      { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role: 'member', plan: 'free', status: 'active' },
    ]);
  });

  it('concurrent account creation (duplicate key 11000) falls back to the now-existing account', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect
      .mockResolvedValueOnce(null) // first lookup: no account yet
      .mockResolvedValueOnce({ _id: 'acc4', email: 'invitee@example.com', name: 'Race' }); // post-race fallback
    accountCreateMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    membershipFindOneLean.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ token: GOOD_TOKEN, password: 'longenough' }));

    expect(res.status).toBe(201);
    const json = (await res.json()) as { account: { id: string } };
    expect(json.account.id).toBe('acc4');
  });

  it('account still unresolved after the race fallback → 500', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    accountCreateMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));

    const res = await POST(makeReq({ token: GOOD_TOKEN, password: 'longenough' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/could not resolve/i);
  });

  it('a non-duplicate account-creation error propagates as a clean 500 (not swallowed)', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce(null);
    accountCreateMock.mockRejectedValueOnce(new Error('mongo blip'));

    const res = await POST(makeReq({ token: GOOD_TOKEN, password: 'longenough' }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo blip');
  });
});

describe('account already exists (signed up between invite and accept)', () => {
  it('no password required at all — reuses the account, creates a fresh membership', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce({ _id: 'acc2', email: 'invitee@example.com', name: 'Already' });
    membershipFindOneLean.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ token: GOOD_TOKEN })); // no password field at all

    expect(accountCreateMock).not.toHaveBeenCalled();
    expect(membershipCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acc2', tenant: 'tenant1', status: 'active' })
    );
    expect(res.status).toBe(201);
  });

  it('an existing (e.g. removed) membership is reactivated via updateOne, not re-created', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce({ _id: 'acc3', email: 'invitee@example.com', name: '' });
    membershipFindOneLean.mockResolvedValueOnce({ status: 'removed' });

    const res = await POST(makeReq({ token: GOOD_TOKEN }));

    expect(membershipUpdateOneMock).toHaveBeenCalledWith(
      { account: 'acc3', tenant: 'tenant1' },
      { $set: expect.objectContaining({ status: 'active', role: 'member' }) }
    );
    expect(membershipCreateMock).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
  });

  it('accepting twice is idempotent — second accept still 201s via the reactivate branch', async () => {
    inviteFindOne.mockResolvedValueOnce(makeInvite());
    accountFindOneSelect.mockResolvedValueOnce({ _id: 'acc5', email: 'invitee@example.com', name: '' });
    membershipFindOneLean.mockResolvedValueOnce({ status: 'active' });

    const res = await POST(makeReq({ token: GOOD_TOKEN }));

    expect(membershipUpdateOneMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(201);
  });
});

describe('unexpected failure', () => {
  it('a mid-handler DB throw surfaces as a clean 500 JSON, not a swallowed 200', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('mongo down'));
    const res = await POST(makeReq({ token: GOOD_TOKEN }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('mongo down');
  });
});
