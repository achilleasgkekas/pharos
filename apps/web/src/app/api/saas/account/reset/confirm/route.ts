import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { hashPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { rateLimit, clientIp } from '@/lib/apiAuth';
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
    // This one takes a reset TOKEN and sets a password. Unlimited, it is an offline-speed guessing
    // machine against that token, aimed at the one operation that hands over an account outright.
    // The token is long and hashed, so guessing is already impractical — but "impractical" is a
    // property of the token, and a limit is a property we control. Cheap to add, and it also caps
    // the damage if a future token format is ever shortened.
    const limited = rateLimit(`saas-reset-confirm:${clientIp(req)}`);
    if (limited) return limited;

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
      '_id resetTokenHash resetTokenExpires sessionEpoch'
    );
    if (!account || !isResetTokenValid(account.resetTokenExpires)) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
    }

    account.set({
      passwordHash: hashPassword(newPassword),
      resetTokenHash: null,
      resetTokenExpires: null,
      // Every existing session dies here (#193). A reset is the one flow where you must assume
      // someone else is holding a live cookie — that is usually WHY it is being used — so
      // leaving those sessions valid handed the account back to them, new password and all.
      // No cookie is re-minted: this request is unauthenticated (the token is the proof, not a
      // session), so the person is sent to the login page to use the password they just chose.
      sessionEpoch: (Number(account.sessionEpoch) || 0) + 1,
    });
    await account.save();

    return NextResponse.json({ ok: true });
  });
}
