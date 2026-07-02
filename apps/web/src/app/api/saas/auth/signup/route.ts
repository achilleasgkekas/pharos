import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import { setAccountCookie } from '@/lib/tenancy/accountSession';
import { provisionTenant } from '@/lib/tenancy/provision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Minimal password policy — enough to block empties/typos without being annoying.
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/saas/auth/signup  { email, password, name?, workspace? }
 *   → creates a global Account (scrypt-hashed password), provisions a first Tenant with an
 *     owner Membership, sets the account session cookie, and returns the account + tenants.
 * SaaS-mode only (404 when SAAS_MODE off). Does not touch the self-hosted User/bearer path.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const email = strField(b, 'email', '', true).toLowerCase();
    const password = strField(b, 'password');
    const name = strField(b, 'name', '', true);
    const workspace = strField(b, 'workspace', '', true);

    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
    }

    await connectDB();

    // Uniqueness pre-check + a race-safe fallback on the unique index (11000).
    if (await Account.exists({ email })) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    let account;
    try {
      account = await Account.create({ email, name, passwordHash: hashPassword(password) });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      throw e;
    }

    const accountId = String(account._id);
    await provisionTenant({
      accountId,
      workspaceName: workspace || name || email.split('@')[0],
    });

    await setAccountCookie({ sub: accountId, email });

    return NextResponse.json(
      {
        account: { id: accountId, email, name: account.name || '' },
        tenants: await accountTenants(accountId),
      },
      { status: 201 }
    );
  });
}
