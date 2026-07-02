import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { Membership, type MembershipDoc } from '@/models/Membership';
import { Invite, type InviteDoc } from '@/models/Invite';
import { hashPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, accountTenants } from '@/lib/tenancy/saasApi';
import { setAccountCookie } from '@/lib/tenancy/accountSession';
import { hashInviteToken, isInviteValid } from '@/lib/tenancy/invites';
import type { OrgRole } from '@/lib/tenancy/members';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same minimal policy as the signup route.
const MIN_PASSWORD = 8;

/**
 * POST /api/saas/invites/accept  { token, password?, name? }
 *   → redeem a workspace invitation minted by /api/saas/members for an email that had no
 *     account. The token is looked up by hash; if valid (pending + unexpired) it creates
 *     (or reuses) the Account for the invited email, mints an active Membership with the
 *     invited role, marks the invite accepted, and logs the account in.
 *
 * `password` is required only when the account does not yet exist (the invite's whole point).
 * If an account for the invited email already exists (they signed up meanwhile), the token
 * still just adds/reactivates their membership — no password needed, none accepted.
 *
 * UNAUTHENTICATED by design (the invitee has no session yet). SaaS-mode only (404 when off);
 * never touches the self-hosted User/bearer path.
 */
export async function POST(req: NextRequest) {
  const gate = saasAuthGate();
  if (gate) return gate;

  const b = await readBody(req);
  const token = strField(b, 'token', '', true);
  if (!token) return NextResponse.json({ error: 'An invite token is required' }, { status: 400 });

  await connectDB();

  const invite = (await Invite.findOne({ tokenHash: hashInviteToken(token) })) as InviteDoc | null;
  if (!invite || !isInviteValid(invite.status, invite.expires)) {
    return NextResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 410 });
  }

  const email = String(invite.email);
  const role = String(invite.role) as OrgRole;
  const tenantId = invite.tenant;

  // Reuse the account if it exists (they may have signed up between invite and accept);
  // otherwise create it, which requires a password.
  let account = await Account.findOne({ email }).select('_id email name');
  if (!account) {
    const password = strField(b, 'password');
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD} characters`, code: 'password_required' },
        { status: 400 }
      );
    }
    const name = strField(b, 'name', '', true);
    try {
      account = await Account.create({ email, name, passwordHash: hashPassword(password) });
    } catch (e) {
      // Race: someone created the account concurrently — fall back to reusing it.
      if ((e as { code?: number }).code === 11000) {
        account = await Account.findOne({ email }).select('_id email name');
      } else {
        throw e;
      }
    }
  }
  if (!account) {
    return NextResponse.json({ error: 'Could not resolve the invited account' }, { status: 500 });
  }

  const accountId = String(account._id);

  // Create or (re)activate the membership with the invited role. Idempotent: accepting an
  // invite twice, or for an already-active member, leaves a single active membership.
  const existing = (await Membership.findOne({ account: accountId, tenant: tenantId })
    .select('status')
    .lean()) as Pick<MembershipDoc, 'status'> | null;
  if (existing) {
    await Membership.updateOne(
      { account: accountId, tenant: tenantId },
      { $set: { status: 'active', role, invitedBy: invite.invitedBy ?? null } }
    );
  } else {
    await Membership.create({
      account: accountId,
      tenant: tenantId,
      role,
      status: 'active',
      invitedBy: invite.invitedBy ?? null,
    });
  }

  // Consume the invite so the token cannot be replayed.
  await Invite.updateOne(
    { _id: invite._id },
    { $set: { status: 'accepted', acceptedBy: accountId, acceptedAt: new Date() } }
  );

  await setAccountCookie({ sub: accountId, email });

  return NextResponse.json(
    {
      account: { id: accountId, email, name: account.name || '' },
      tenants: await accountTenants(accountId),
    },
    { status: 201 }
  );
}
