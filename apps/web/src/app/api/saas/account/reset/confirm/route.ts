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
 *   → verifies the time-limited reset token, saves the new password, clears the token.
 * SaaS-mode only (404 when SAAS_MODE off).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    // A raw unauthenticated endpoint accepting arbitrary strings (token/password).
    // The token is a 64-char hex string, but limiting is still necessary to bound
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
      sessionEpoch: (account.sessionEpoch || 0) + 1,
    });
    await account.save();

    return NextResponse.json({ ok: true });
  });
}
