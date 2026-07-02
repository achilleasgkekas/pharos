import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { hashVerifyToken, isVerifyTokenValid } from '@/lib/tenancy/emailVerify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/verify/confirm  { token }
 *   → look up the account by the token's SHA-256 hash, verify it hasn't expired, then mark
 *     the email verified and clear the verify fields (single-use). UNAUTHENTICATED (the user
 *     is proving ownership via the token clicked from their inbox, not a session).
 *
 * A missing/invalid/expired token returns the same generic 400 (no distinction between
 * "unknown token" and "expired token" — nothing to leak).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const token = strField(b, 'token', '', true);
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

    await connectDB();
    const account = await Account.findOne({ verifyTokenHash: hashVerifyToken(token) }).select(
      '_id verifyTokenHash verifyTokenExpires emailVerified'
    );
    if (!account || !isVerifyTokenValid(account.verifyTokenExpires)) {
      return NextResponse.json({ error: 'This verification link is invalid or has expired' }, { status: 400 });
    }

    account.set({ emailVerified: true, verifyTokenHash: null, verifyTokenExpires: null });
    await account.save();

    return NextResponse.json({ ok: true });
  });
}
