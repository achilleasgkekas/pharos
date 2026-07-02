import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { passwordChangeError } from '@/lib/tenancy/accountProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/password  { currentPassword, newPassword }
 *   → re-verifies the current password (scrypt), then stores a fresh hash of the new one.
 * SaaS-mode only (404 when SAAS_MODE off). A missing account and a wrong current password
 * return the same 401 (no information leak). The session cookie is left intact — the
 * new hash verifies on the next login; existing sessions are not force-expired here.
 */
export async function POST(req: NextRequest) {
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
  const account = await Account.findById(claims.sub).select('_id passwordHash');
  if (!account || !verifyPassword(current, account.passwordHash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  account.passwordHash = hashPassword(next);
  await account.save();

  return NextResponse.json({ ok: true });
}
