import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { rateLimit, clientIp } from '@/lib/apiAuth';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import { setAccountCookie, setMfaPendingCookie } from '@/lib/tenancy/accountSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/auth/login  { email, password }
 *   → verifies the Account password (scrypt). If the account has MFA enabled (increment 83),
 *     this does NOT hand out a session yet: it sets a short-lived pending-MFA cookie and
 *     returns `{ mfaRequired: true }` — the client must then call `POST /api/saas/auth/mfa`
 *     with a TOTP/recovery code before it gets a real session. Otherwise it sets the account
 *     session cookie directly, same as before, and returns the account + tenants it can
 *     access. SaaS-mode only (404 when SAAS_MODE off).
 * A wrong email and a wrong password return the same 401 (no account enumeration).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const limited = rateLimit(`saas-login:${clientIp(req)}`);
    if (limited) return limited;

    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const email = strField(b, 'email', '', true).toLowerCase();
    const password = strField(b, 'password');
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }

    await connectDB();
    const account = await Account.findOne({ email }).select('_id name email passwordHash mfaEnabled');
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const accountId = String(account._id);

    if (account.mfaEnabled) {
      // lastLoginAt is stamped once the second factor also checks out (see mfa/route.ts) — a
      // correct password alone is not yet a completed login.
      await setMfaPendingCookie(accountId);
      return NextResponse.json({ mfaRequired: true });
    }

    account.lastLoginAt = new Date();
    await account.save();

    await setAccountCookie({ sub: accountId, email });

    return NextResponse.json({
      account: { id: accountId, email, name: account.name || '' },
      tenants: await accountTenants(accountId),
    });
  });
}
