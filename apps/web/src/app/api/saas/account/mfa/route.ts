import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { verifyPassword } from '@/lib/auth';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { secretCryptoReady } from '@/lib/tenancy/secretCrypto';
import { beginMfaEnrollment, disableMfa, describeMfaStatus, mfaEnrollRequiresReauth } from '@/lib/tenancy/mfaStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Account MFA enrollment (SaaS control plane, TODO §9, increment 80a). SaaS-mode only (404 when
 * SAAS_MODE off) and operates on the caller's own Account session — never the self-hosted
 * User/bearer path. NOT wired into the login flow yet (see lib/tenancy/mfaStore.ts's scope
 * note) — enabling MFA here does not yet change what `POST /api/saas/auth/login` requires.
 *
 * GET    /api/saas/account/mfa              → { enabled, pending, cryptoReady }
 * POST   /api/saas/account/mfa { password? } → begin (or restart) enrollment: { secret, uri }
 *                                              (`uri` is an otpauth:// link — render as a QR
 *                                              code, or show `secret` for manual entry). Must
 *                                              be confirmed with a real code before it takes
 *                                              effect: see POST /api/saas/account/mfa/confirm.
 *                                              When MFA is already active, `password` is
 *                                              required and re-verified first (mirrors DELETE
 *                                              below) — a hijacked session alone can't replace
 *                                              an already-enrolled factor. Not required for a
 *                                              first-time (never-enabled) enrollment.
 * DELETE /api/saas/account/mfa { password } → disable MFA (re-verifies the current password
 *                                              first, so a hijacked session alone can't turn
 *                                              off the second factor).
 */
export async function GET() {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await connectDB();
    const status = await describeMfaStatus(claims.sub);
    if (!status) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    return NextResponse.json({ ...status, cryptoReady: secretCryptoReady() });
  });
}

export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await connectDB();
    const account = await Account.findById(claims.sub).select('_id passwordHash mfaEnabled');
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    if (mfaEnrollRequiresReauth(!!account.mfaEnabled)) {
      const b = await readBody(req);
      const password = strField(b, 'password');
      if (!password) return NextResponse.json({ error: 'password is required' }, { status: 400 });
      if (!verifyPassword(password, account.passwordHash)) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }
    }

    const result = await beginMfaEnrollment(claims.sub, claims.email);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 503;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ secret: result.secret, uri: result.uri });
  });
}

export async function DELETE(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const b = await readBody(req);
    const password = strField(b, 'password');
    if (!password) return NextResponse.json({ error: 'password is required' }, { status: 400 });

    await connectDB();
    const account = await Account.findById(claims.sub).select('_id passwordHash');
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await disableMfa(claims.sub);
    return NextResponse.json({ enabled: false });
  });
}
