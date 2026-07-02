import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Invite, type InviteDoc } from '@/models/Invite';
import { readBody } from '@/lib/apiBody';
import { inviteView, parseInviteStatusFilter, inviteStatusQuery } from '@/lib/tenancy/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outstanding-invite lifecycle management (SaaS control plane) — the companion to the
 * mint step in /api/saas/members (which creates pending invites for not-yet-registered
 * emails) and /api/saas/invites/accept (which redeems them). This route lets an owner/admin
 * SEE and REVOKE the invites that are still hanging.
 *
 * Gating (via resolveWorkspaceSession):
 *   - SAAS_MODE off       → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in       → 401
 *   - not owner/admin     → 403 (both listing and revoking are management actions)
 *
 * Only reads/writes the control-plane Invite collection; never touches a feature route,
 * the per-tenant data database, or the self-hosted User session. The token hash is never
 * returned (inviteView omits it by construction).
 */

/**
 * GET /api/saas/invites[?tenant=<slug>][?status=pending|accepted|revoked|all]
 *   → list the workspace's invitations (email/role/expiry/expired-flag), newest first.
 *     Owner/admin only. `expired` distinguishes still-redeemable links from stale pending
 *     rows past their TTL.
 *
 *     `?status` defaults to 'pending' (unchanged behaviour for callers that omit it); an
 *     unknown value falls back to 'pending'. 'accepted'/'revoked' give an audit view of the
 *     lifecycle, and 'all' spans every status.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('tenant');
  const filter = parseInviteStatusFilter(url.searchParams.get('status'));
  const resolved = await resolveWorkspaceSession(slug, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const invites = (await Invite.find({
    tenant: session.ctx.tenantId!,
    ...inviteStatusQuery(filter),
  })
    .select('email role status expires createdAt')
    .sort({ createdAt: -1 })
    .lean()) as unknown as (InviteDoc & { createdAt?: Date })[];

  return NextResponse.json({
    workspace: session.workspace.slug,
    status: filter,
    invites: invites.map((inv) => inviteView(inv)),
  });
}

/**
 * DELETE /api/saas/invites  { inviteId, tenant? }
 *   → revoke a pending invitation so its signup link can no longer be redeemed. Owner/admin
 *     only. Idempotent-ish: revoking an already-non-pending invite returns 404 (nothing
 *     outstanding to revoke). Scoped to the caller's own workspace, so one tenant cannot
 *     touch another's invites.
 */
export async function DELETE(req: NextRequest) {
  const body = await readBody(req);

  const tenantSlug = typeof body.tenant === 'string' ? body.tenant.trim() || null : null;
  const resolved = await resolveWorkspaceSession(tenantSlug, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const inviteId = typeof body.inviteId === 'string' ? body.inviteId.trim() : '';
  if (!inviteId) {
    return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
  }

  // Revoke only within this workspace and only if still pending — a fresh mint or an
  // accepted/revoked row is left untouched.
  const res = await Invite.updateOne(
    { _id: inviteId, tenant: session.ctx.tenantId!, status: 'pending' },
    { $set: { status: 'revoked' } }
  );

  if (res.matchedCount === 0) {
    return NextResponse.json(
      { error: 'no pending invite with that id in this workspace' },
      { status: 404 }
    );
  }

  return NextResponse.json({ revoked: inviteId });
}
