import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, accountTenants } from '@/lib/tenancy/saasApi';
import { setAccountCookie } from '@/lib/tenancy/accountSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/auth/login  { email, password }
 *   → verifies the Account password (scrypt), sets the account session cookie, returns the
 *     account + the tenants it can access. SaaS-mode only (404 when SAAS_MODE off).
 * A wrong email and a wrong password return the same 401 (no account enumeration).
 */
export async function POST(req: NextRequest) {
  const gate = saasAuthGate();
  if (gate) return gate;

  const b = await readBody(req);
  const email = strField(b, 'email', '', true).toLowerCase();
  const password = strField(b, 'password');
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  await connectDB();
  const account = await Account.findOne({ email }).select('_id name email passwordHash');
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const accountId = String(account._id);
  account.lastLoginAt = new Date();
  await account.save();

  await setAccountCookie({ sub: accountId, email });

  return NextResponse.json({
    account: { id: accountId, email, name: account.name || '' },
    tenants: await accountTenants(accountId),
  });
}
