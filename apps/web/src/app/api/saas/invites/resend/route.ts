import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Invite, type InviteDoc } from '@/models/Invite';
import { readBody, isObjectId } from '@/lib/apiBody';
import { mintInviteToken } from '@/lib/tenancy/invites';
import {
  sendEmail,
  inviteEmail,
  inviteLinkUrl,
  mailerCanDeliver,
} from '@/lib/tenancy/mailer';
import { pickBaseUrl } from '@/lib/billing/billingRoutes';
import { recordAudit } from '@/lib/tenancy/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dedicated invite-resend endpoint (SaaS control plane) — the one-step companion to the
 * mint (in /api/saas/members), list/revoke (/api/saas/invites) and accept
 * (/api/saas/invites/accept) steps. It re-mints a FRESH token on an existing pending
 * invite and re-sends the signup link in a single call, instead of asking the owner to POST
 * the same email through /api/saas/members again.
 *
 * Why re-mint rather than resend the old token: the token itself is never stored (only its
 * hash is), so it cannot be re-read to re-send. Re-minting also invalidates the previous
 * link — the same "newest link wins" property the members route enforces via supersede.
 * A resend targets an invite that is already pending (typically expired-but-pending: the
 * link went stale before the invitee clicked it), so it does NOT consume a new seat — the
 * pending invite already reserved one at mint time.
 *
 * Gating (via resolveWorkspaceSession):
 *   - SAAS_MODE off       → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in       → 401
 *   - not owner/admin     → 403 (resending is a management action)
 *
 * Only reads/writes the control-plane Invite collection; never touches a feature route, the
 * per-tenant data database, or the self-hosted User session. The token hash is never returned.
 */

/**
 * POST /api/saas/invites/resend  { inviteId, tenant? }
 *   → re-mint + re-send a still-pending invite. Owner/admin only. 404 if there is no pending
 *     invite with that id in this workspace (an accepted/revoked invite is not resendable —
 *     revoke-then-reinvite via the members route for those).
 *
 *     SCAFFOLD (mirrors the mint path in members): when no mailer can deliver AND we are not
 *     in production, the plaintext token is echoed as `devToken` so the flow stays testable
 *     locally; in production an unwired mailer drops it silently (no leak).
 */
export async function POST(req: NextRequest) {
  const body = await readBody(req);

  const tenantSlug = typeof body.tenant === 'string' ? body.tenant.trim() || null : null;
  const resolved = await resolveWorkspaceSession(tenantSlug, true);
  if ('response' in resolved) return resolved.response;
  const { session } = resolved;

  const inviteId = typeof body.inviteId === 'string' ? body.inviteId.trim() : '';
  if (!inviteId) {
    return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });
  }
  // Format-guard before Mongoose so a malformed id returns 400 instead of a CastError 500.
  if (!isObjectId(inviteId)) {
    return NextResponse.json({ error: 'invalid inviteId' }, { status: 400 });
  }

  const tenantId = session.ctx.tenantId!;

  // Fresh token; the row keeps its identity (invitedBy, createdAt, email, role) but gets a
  // new hash + expiry, which retires the previous link. Scoped to this workspace + pending
  // only, so one tenant cannot resend another's invite and an accepted/revoked row is left
  // alone (matchedCount 0 → 404). Return the row so we have its email to address the mail.
  const { token, tokenHash, expires } = mintInviteToken();
  const invite = (await Invite.findOneAndUpdate(
    { _id: inviteId, tenant: tenantId, status: 'pending' },
    { $set: { tokenHash, expires } },
    { new: true }
  )
    .select('email role expires')
    .lean()) as Pick<InviteDoc, 'email' | 'role' | 'expires'> | null;

  if (!invite) {
    return NextResponse.json(
      { error: 'no pending invite with that id in this workspace' },
      { status: 404 }
    );
  }

  await recordAudit(session.ctx, {
    action: 'invite.resent',
    actor: session.account.sub,
    target: String(invite.email),
    meta: { role: String(invite.role) },
  });

  const canDeliver = mailerCanDeliver();
  if (canDeliver) {
    const base = pickBaseUrl(
      process.env.SAAS_PUBLIC_URL || process.env.APP_URL,
      new URL(req.url).origin
    );
    const { subject, html } = inviteEmail(inviteLinkUrl(base, token), session.workspace.slug);
    void sendEmail({ to: invite.email, subject, html });
  }

  const canEcho = !canDeliver && process.env.NODE_ENV !== 'production';
  return NextResponse.json({
    resent: inviteId,
    invite: { email: invite.email, role: invite.role, status: 'pending', expires: invite.expires },
    ...(canEcho ? { devToken: token } : {}),
  });
}
