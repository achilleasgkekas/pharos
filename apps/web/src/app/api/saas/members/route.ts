import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Membership, type MembershipDoc } from '@/models/Membership';
import { Account, type AccountDoc } from '@/models/Account';
import {
  parseRole,
  canAssignRole,
  wouldOrphanOwners,
  normalizeEmail,
  looksLikeEmail,
  type MemberLite,
  type OrgRole,
} from '@/lib/tenancy/members';
import { readBody, strField } from '@/lib/apiBody';
import { sendEmail, invitedEmail } from '@/lib/tenancy/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace member management (SaaS control plane).
 *
 * Common gating for every method (via resolveWorkspaceSession):
 *   - SAAS_MODE off       → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in       → 401
 *   - not a member        → 403 (GET) / not owner-admin → 403 (POST/PATCH/DELETE)
 *
 * Only reads/writes control-plane collections (Membership/Account/Tenant); never touches
 * a feature route, the per-tenant data database, or the self-hosted User session.
 */

type MemberView = {
  accountId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  invitedBy: string | null;
  createdAt: Date | undefined;
};

/** Load a workspace's memberships joined to account email/name for the list response. */
async function loadMembers(tenantId: string): Promise<{ views: MemberView[]; lite: MemberLite[] }> {
  const memberships = (await Membership.find({ tenant: tenantId })
    .select('account role status invitedBy createdAt')
    .lean()) as unknown as (MembershipDoc & { createdAt?: Date })[];

  const accountIds = memberships.map((m) => m.account);
  const accounts = (await Account.find({ _id: { $in: accountIds } })
    .select('email name')
    .lean()) as unknown as AccountDoc[];
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  const views: MemberView[] = memberships.map((m) => {
    const a = byId.get(String(m.account));
    return {
      accountId: String(m.account),
      email: a?.email ?? '',
      name: a?.name ?? '',
      role: String(m.role),
      status: String(m.status),
      invitedBy: m.invitedBy ? String(m.invitedBy) : null,
      createdAt: m.createdAt,
    };
  });
  const lite: MemberLite[] = memberships.map((m) => ({
    accountId: String(m.account),
    role: m.role as OrgRole,
    status: String(m.status),
  }));
  return { views, lite };
}

/** GET /api/saas/members[?tenant=<slug>] — list members. Any active member may read. */
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('tenant');
  const resolved = await resolveWorkspaceSession(slug, false);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const { views } = await loadMembers(session.ctx.tenantId!);
  return NextResponse.json({ workspace: session.workspace.slug, members: views });
}

/**
 * POST /api/saas/members — add an existing account to the workspace.
 * Body: `{ email, role?, tenant? }`. Owner/admin only. Admins cannot mint an owner.
 * Email-invite to a NOT-yet-registered address needs an email-delivery flow (deferred);
 * for now the target account must already exist (404 otherwise).
 */
export async function POST(req: NextRequest) {
  const body = await readBody(req);

  const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const email = normalizeEmail(body.email);
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: 'a valid email is required' }, { status: 400 });
  }
  const role = body.role == null ? 'member' : parseRole(body.role);
  if (!role) {
    return NextResponse.json({ error: 'role must be owner, admin, or member' }, { status: 400 });
  }
  if (!canAssignRole(session.workspace.role, role)) {
    return NextResponse.json({ error: 'only an owner may assign the owner role' }, { status: 403 });
  }

  const account = (await Account.findOne({ email }).select('_id email name').lean()) as
    | AccountDoc
    | null;
  if (!account) {
    // No account for this email yet. Inviting a brand-new user needs email delivery,
    // which is deferred (see SAAS_PROGRESS "Needs Achilleas"). Report it explicitly.
    return NextResponse.json(
      { error: 'no account exists for that email', code: 'account_not_found', inviteByEmail: false },
      { status: 404 }
    );
  }

  const tenantId = session.ctx.tenantId!;
  const existing = (await Membership.findOne({
    account: account._id,
    tenant: tenantId,
  })
    .select('status')
    .lean()) as Pick<MembershipDoc, 'status'> | null;

  if (existing && existing.status !== 'removed') {
    return NextResponse.json({ error: 'already a member of this workspace' }, { status: 409 });
  }

  if (existing) {
    // Reactivate a previously removed member with the requested role.
    await Membership.updateOne(
      { account: account._id, tenant: tenantId },
      { $set: { status: 'active', role, invitedBy: session.account.sub } }
    );
  } else {
    await Membership.create({
      account: account._id,
      tenant: tenantId,
      role,
      status: 'active',
      invitedBy: session.account.sub,
    });
  }

  // Best-effort notification that they now have workspace access (no-op unless a mailer is
  // configured). Fire-and-forget so it never delays or fails the response; sendEmail never throws.
  const { subject, html } = invitedEmail(session.workspace.slug);
  void sendEmail({ to: account.email, subject, html });

  return NextResponse.json(
    {
      member: {
        accountId: String(account._id),
        email: account.email,
        name: account.name ?? '',
        role,
        status: 'active',
      },
    },
    { status: 201 }
  );
}

/**
 * PATCH /api/saas/members — change a member's role.
 * Body: `{ accountId, role, tenant? }`. Owner/admin only. Cannot demote the last owner.
 */
export async function PATCH(req: NextRequest) {
  const body = await readBody(req);

  const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }
  const role = parseRole(body.role);
  if (!role) {
    return NextResponse.json({ error: 'role must be owner, admin, or member' }, { status: 400 });
  }
  if (!canAssignRole(session.workspace.role, role)) {
    return NextResponse.json({ error: 'only an owner may assign the owner role' }, { status: 403 });
  }

  const tenantId = session.ctx.tenantId!;
  const { lite } = await loadMembers(tenantId);
  const target = lite.find((m) => m.accountId === accountId && m.status !== 'removed');
  if (!target) {
    return NextResponse.json({ error: 'member not found' }, { status: 404 });
  }

  // Demoting the sole owner would leave the workspace ownerless.
  if (target.role === 'owner' && role !== 'owner' && wouldOrphanOwners(lite, accountId)) {
    return NextResponse.json(
      { error: 'cannot demote the last owner; promote another owner first', code: 'last_owner' },
      { status: 409 }
    );
  }

  await Membership.updateOne({ account: accountId, tenant: tenantId }, { $set: { role } });
  return NextResponse.json({ member: { accountId, role } });
}

/**
 * DELETE /api/saas/members — remove a member (soft: status → 'removed').
 * Body: `{ accountId, tenant? }`. Owner/admin only. Cannot remove the last owner.
 */
export async function DELETE(req: NextRequest) {
  const body = await readBody(req);

  const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const tenantId = session.ctx.tenantId!;
  const { lite } = await loadMembers(tenantId);
  const target = lite.find((m) => m.accountId === accountId && m.status !== 'removed');
  if (!target) {
    return NextResponse.json({ error: 'member not found' }, { status: 404 });
  }

  if (wouldOrphanOwners(lite, accountId)) {
    return NextResponse.json(
      { error: 'cannot remove the last owner; promote another owner first', code: 'last_owner' },
      { status: 409 }
    );
  }

  await Membership.updateOne({ account: accountId, tenant: tenantId }, { $set: { status: 'removed' } });
  return NextResponse.json({ removed: accountId });
}
