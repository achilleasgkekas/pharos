import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { readBody, strField } from '@/lib/apiBody';
import { rateLimit } from '@/lib/apiAuth';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import {
  getMfaPendingAccountId,
  clearMfaPendingCookie,
  setAccountCookie,
} from '@/lib/tenancy/accountSession';
import { verifyMfaLogin } from '@/lib/tenancy/mfaStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Login step 2 — the second factor (increment 83, completing the login-flow wiring that
 * mfaStore.ts's original doc-comment deferred as "a separate, riskier increment"). Only
 * reachable after `POST /api/saas/auth/login` has already verified the password for an
 * account with `mfaEnabled` and set the short-lived pending-MFA cookie (never a substitute for
 * that step — there is no account id in the request body, only in the signed cookie).
 *
 * POST   /api/saas/auth/mfa { code } → verify a TOTP code or a recovery code against the
 *                                       account named by the pending-MFA cookie. On success:
 *                                       clears the pending cookie, sets the REAL account
 *                                       session cookie (mirrors the no-MFA branch of
 *                                       POST /api/saas/auth/login), stamps lastLoginAt, and
 *                                       returns the same `{ account, tenants }` shape login
 *                                       does when MFA is off — so the client's post-login
 *                                       handling doesn't need a third code path.
 * DELETE /api/saas/auth/mfa          → cancel the in-progress login (clears the pending
 *                                       cookie, e.g. "use a different account" / wrong device).
 *                                       Always 200; idempotent.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const accountId = await getMfaPendingAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'no_pending_login' }, { status: 401 });
    }

    // Keyed by account id, not IP: the pending cookie already narrows the guess target to one
    // account, so an attacker spreading attempts across IPs must still be throttled per-account.
    const limited = rateLimit(`saas-mfa:${accountId}`);
    if (limited) return limited;

    const b = await readBody(req);
    const code = strField(b, 'code', '', true);
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

    await connectDB();
    const result = await verifyMfaLogin(accountId, code);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 401 : 401;
      return NextResponse.json({ error: result.reason }, { status });
    }

    const account = await Account.findById(accountId).select('_id name email');
    if (!account) return NextResponse.json({ error: 'not_found' }, { status: 401 });

    account.lastLoginAt = new Date();
    await account.save();

    await clearMfaPendingCookie();
    await setAccountCookie({ sub: accountId, email: account.email });

    return NextResponse.json({
      account: { id: accountId, email: account.email, name: account.name || '' },
      tenants: await accountTenants(accountId),
      usedRecoveryCode: result.usedRecoveryCode,
    });
  });
}

export async function DELETE() {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    await clearMfaPendingCookie();
    return NextResponse.json({ ok: true });
  });
}
