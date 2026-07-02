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
import {
  sendEmail,
  invitedEmail,
  inviteEmail,
  inviteLinkUrl,
  mailerCanDeliver,
} from '@/lib/tenancy/mailer';
import { withinSeatLimit, entitlementsFor } from '@/lib/billing/entitlements';
import { Invite } from '@/models/Invite';
import { mintInviteToken } from '@/lib/tenancy/invites';
import { pickBaseUrl } from '@/lib/billing/billingRoutes';
import { recordAudit } from '@/lib/tenancy/audit';
import type { WorkspaceSession } from '@/lib/tenancy/workspaceSession';

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

/**
 * Mint an email invitation for an address that has NO account yet, instead of 404ing.
 * A high-entropy token (hash stored on the Invite row) is emailed as a signup link; the
 * invitee redeems it at /api/saas/invites/accept, which creates their Account + Membership.
 *
 * Seats: a pending invite reserves a future seat, so the cap counts active members PLUS
 * outstanding pending invites — you cannot invite past the plan allowance. Any existing
 * pending invite for the same (tenant, email) is superseded (revoked) so the newest link wins.
 *
 * SCAFFOLD (mirrors reset/request): when no mailer can deliver AND we are not in production,
 * the plaintext token is echoed as `devToken` so the flow is testable locally; in production
 * an unwired mailer drops it silently (no leak).
 */
async function inviteUnregistered(
  req: NextRequest,
  session: WorkspaceSession,
  email: string,
  role: OrgRole
): Promise<NextResponse> {
  const tenantId = session.ctx.tenantId!;
  const plan = String(session.tenant.plan);

  const activeCount = await Membership.countDocuments({ tenant: tenantId, status: 'active' });
  const pendingCount = await Invite.countDocuments({ tenant: tenantId, status: 'pending' });
  if (!withinSeatLimit(plan, activeCount + pendingCount)) {
    const cap = entitlementsFor(plan).maxMembers;
    return NextResponse.json(
      {
        error: `seat limit reached for the ${plan} plan (max ${cap})`,
        code: 'seat_limit',
        maxMembers: cap,
      },
      { status: 409 }
    );
  }

  // Supersede any prior outstanding invite for this address so only the newest token is live.
  await Invite.updateMany(
    { tenant: tenantId, email, status: 'pending' },
    { $set: { status: 'revoked' } }
  );

  const { token, tokenHash, expires } = mintInviteToken();
  await Invite.create({
    tenant: tenantId,
    email,
    role,
    status: 'pending',
    tokenHash,
    expires,
    invitedBy: session.account.sub,
  });

  await recordAudit(session.ctx, {
    action: 'invite.sent',
    actor: session.account.sub,
    target: email,
    meta: { role },
  });

  const canDeliver = mailerCanDeliver();
  if (canDeliver) {
    const base = pickBaseUrl(
      process.env.SAAS_PUBLIC_URL || process.env.APP_URL,
      new URL(req.url).origin
    );
    const { subject, html } = inviteEmail(inviteLinkUrl(base, token), session.workspace.slug);
    void sendEmail({ to: email, subject, html });
  }

  const canEcho = !canDeliver && process.env.NODE_ENV !== 'production';
  return NextResponse.json(
    {
      invite: { email, role, status: 'pending', expires },
      inviteByEmail: true,
      ...(canEcho ? { devToken: token } : {}),
    },
    { status: 201 }
  );
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
    // No account for this email yet → mint an email invitation (signup link) rather than
    // 404. The invitee creates their account by redeeming the token at /invites/accept.
    return inviteUnregistered(req, session, email, role);
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

  // Seat limit: adding a new member OR reactivating a removed one consumes an active seat.
  // Reject when the plan's allowance is already full (unlimited plans always pass). Counting
  // live avoids a stale snapshot; `dedicated`/self-hosted (maxMembers null) short-circuits.
  // Mirror the invite path (inviteUnregistered): a pending invite reserves a future seat, so
  // the occupancy the cap is checked against is active members PLUS outstanding pending invites.
  // Without counting pending, an add could push active+pending past the cap once those invites
  // are redeemed.
  const plan = String(session.tenant.plan);
  const activeCount = await Membership.countDocuments({ tenant: tenantId, status: 'active' });
  const pendingCount = await Invite.countDocuments({ tenant: tenantId, status: 'pending' });
  if (!withinSeatLimit(plan, activeCount + pendingCount)) {
    const cap = entitlementsFor(plan).maxMembers;
    return NextResponse.json(
      {
        error: `seat limit reached for the ${plan} plan (max ${cap})`,
        code: 'seat_limit',
        maxMembers: cap,
      },
      { status: 409 }
    );
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

  await recordAudit(session.ctx, {
    action: 'member.added',
    actor: session.account.sub,
    target: account.email,
    meta: { role, reactivated: Boolean(existing) },
  });

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
  const { lite, views } = await loadMembers(tenantId);
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

  await recordAudit(session.ctx, {
    action: 'member.role_changed',
    actor: session.account.sub,
    target: views.find((v) => v.accountId === accountId)?.email || accountId,
    meta: { from: target.role, to: role, accountId },
  });

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
  const { lite, views } = await loadMembers(tenantId);
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

  await recordAudit(session.ctx, {
    action: 'member.removed',
    actor: session.account.sub,
    target: views.find((v) => v.accountId === accountId)?.email || accountId,
    meta: { role: target.role, accountId },
  });

  return NextResponse.json({ removed: accountId });
}
