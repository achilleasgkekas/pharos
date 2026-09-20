import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, setAccountCookie } from '@/lib/tenancy/accountSession';
import { passwordChangeError } from '@/lib/tenancy/accountProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/password  { currentPassword, newPassword }
 *   → re-verifies the current password (scrypt), then stores a fresh hash of the new one.
 * SaaS-mode only (404 when SAAS_MODE off). A missing account and a wrong current password
 * return the same 401 (no information leak). Changing the password signs out every OTHER
 * device (#182) by bumping the account's session epoch, and re-mints THIS device's cookie with
 * the new value so the person who just typed their password is not logged out by their own
 * action — the same bargain `changeOwnPassword` strikes on the self-hosted side.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const b = await readBody(req);
    const current = strField(b, 'currentPassword');
    const next = strField(b, 'newPassword');
    if (!current || !next) {
      return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 });
    }
    const policyError = passwordChangeError(current, next);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

    await connectDB();
    const account = await Account.findById(claims.sub).select('_id email passwordHash sessionEpoch');
    if (!account || !verifyPassword(current, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const epoch = (Number(account.sessionEpoch) || 0) + 1;
    account.passwordHash = hashPassword(next);
    account.sessionEpoch = epoch;
    await account.save();

    // Order matters: the epoch is stored BEFORE this cookie is minted, so there is no instant in
    // which the new cookie names a counter the database does not have yet.
    await setAccountCookie({ sub: String(account._id), email: account.email, epoch });

    return NextResponse.json({ ok: true });
  });
}
