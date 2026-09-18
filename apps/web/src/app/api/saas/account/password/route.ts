import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, bumpAccountSessionEpoch, setAccountCookie } from '@/lib/tenancy/accountSession';
import { passwordChangeError } from '@/lib/tenancy/accountProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/password  { currentPassword, newPassword }
 *   → re-verifies the current password (scrypt), then stores a fresh hash of the new one.
 * SaaS-mode only (404 when SAAS_MODE off). A missing account and a wrong current password
 * return the same 401 (no information leak). Bumps the session epoch to invalidate all
 * other existing sessions (P182), and re-issues the caller's cookie so they stay logged in.
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
    const account = await Account.findById(claims.sub).select('_id passwordHash email');
    if (!account || !verifyPassword(current, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    account.passwordHash = hashPassword(next);
    await account.save();

    const accountId = String(account._id);
    const epoch = await bumpAccountSessionEpoch(accountId);
    await setAccountCookie({ sub: accountId, email: account.email, epoch });

    return NextResponse.json({ ok: true });
  });
}
