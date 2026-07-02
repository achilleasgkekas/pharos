import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { hashResetToken, isResetTokenValid, resetPasswordError } from '@/lib/tenancy/passwordReset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/reset/confirm  { token, newPassword }
 *   → look up the account by the token's SHA-256 hash, verify it hasn't expired, then set a
 *     fresh password hash and clear the reset fields (single-use). UNAUTHENTICATED (the user
 *     is proving ownership via the token, not a session).
 *
 * A missing/invalid/expired token returns the same generic 400 (no distinction between
 * "unknown token" and "expired token" — nothing to leak). Enforces the reset password
 * policy before touching the DB.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const token = strField(b, 'token', '', true);
    const newPassword = strField(b, 'newPassword');
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    const policyError = resetPasswordError(newPassword);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

    await connectDB();
    const account = await Account.findOne({ resetTokenHash: hashResetToken(token) }).select(
      '_id resetTokenHash resetTokenExpires'
    );
    if (!account || !isResetTokenValid(account.resetTokenExpires)) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
    }

    account.set({
      passwordHash: hashPassword(newPassword),
      resetTokenHash: null,
      resetTokenExpires: null,
    });
    await account.save();

    // Existing account sessions are not force-expired here (consistent with the password-change
    // route); the new hash takes effect on the next login.
    return NextResponse.json({ ok: true });
  });
}
