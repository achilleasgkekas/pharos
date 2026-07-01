import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { saasAuthGate, accountTenants } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/auth/session → the current account + its tenants, or { account: null }
 * when logged out. SaaS-mode only (404 when SAAS_MODE off). Reads the cookie, then confirms
 * the account still exists (a deleted account with a live cookie resolves to logged-out).
 */
export async function GET() {
  const gate = saasAuthGate();
  if (gate) return gate;

  const claims = await getCurrentAccount();
  if (!claims) return NextResponse.json({ account: null });

  await connectDB();
  const account = await Account.findById(claims.sub).select('_id name email').lean();
  if (!account) return NextResponse.json({ account: null });

  const accountId = String((account as { _id: unknown })._id);
  return NextResponse.json({
    account: {
      id: accountId,
      email: (account as { email?: string }).email || claims.email,
      name: (account as { name?: string }).name || '',
    },
    tenants: await accountTenants(accountId),
  });
}
