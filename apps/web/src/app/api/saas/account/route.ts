import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { readBody } from '@/lib/apiBody';
import { saasAuthGate, accountTenants } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, setAccountCookie } from '@/lib/tenancy/accountSession';
import { normalizeEmail, looksLikeEmail } from '@/lib/tenancy/members';
import { sanitizeName } from '@/lib/tenancy/accountProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET   /api/saas/account                    → the caller's own account profile.
 * PATCH /api/saas/account { name?, email? }  → update the display name and/or email.
 * SaaS-mode only (404 when SAAS_MODE off). Operates on the caller's own Account session;
 * does not touch the self-hosted User/bearer path.
 */
export async function GET() {
  const gate = saasAuthGate();
  if (gate) return gate;

  const claims = await getCurrentAccount();
  if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await connectDB();
  const account = await Account.findById(claims.sub)
    .select('_id email name emailVerified lastLoginAt createdAt')
    .lean();
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const a = account as {
    _id: unknown;
    email?: string;
    name?: string;
    emailVerified?: boolean;
    lastLoginAt?: Date;
    createdAt?: Date;
  };
  return NextResponse.json({
    account: {
      id: String(a._id),
      email: a.email || '',
      name: a.name || '',
      emailVerified: !!a.emailVerified,
      lastLoginAt: a.lastLoginAt || null,
      createdAt: a.createdAt || null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const gate = saasAuthGate();
  if (gate) return gate;

  const claims = await getCurrentAccount();
  if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const b = await readBody(req);
  const hasName = Object.prototype.hasOwnProperty.call(b, 'name');
  const hasEmail = Object.prototype.hasOwnProperty.call(b, 'email');
  if (!hasName && !hasEmail) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await connectDB();
  const account = await Account.findById(claims.sub).select('_id email name emailVerified');
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let emailChanged = false;
  if (hasEmail) {
    const email = normalizeEmail(b.email);
    if (!looksLikeEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (email !== account.email) {
      // Uniqueness pre-check + a race-safe fallback on the unique index (11000) below.
      if (await Account.exists({ email, _id: { $ne: account._id } })) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      account.email = email;
      account.emailVerified = false; // a new address must be re-verified once a mailer exists
      emailChanged = true;
    }
  }

  if (hasName) account.name = sanitizeName(b.name);

  try {
    await account.save();
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    throw e;
  }

  const accountId = String(account._id);
  // If the email changed, refresh the session cookie so its `email` claim stays accurate.
  if (emailChanged) await setAccountCookie({ sub: accountId, email: account.email });

  return NextResponse.json({
    account: { id: accountId, email: account.email, name: account.name || '' },
    tenants: await accountTenants(accountId),
  });
}
