import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { confirmMfaEnrollment } from '@/lib/tenancy/mfaStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/mfa/confirm { code }
 *   → verifies `code` against the pending secret from POST /api/saas/account/mfa. On success,
 *     activates MFA and returns a fresh batch of recovery codes ONCE (plaintext — the caller
 *     must show them to the user immediately; only their hashes persist). On failure the
 *     account's MFA state is untouched.
 * SaaS-mode only. See lib/tenancy/mfaStore.ts's scope note: this does not yet change what
 * POST /api/saas/auth/login requires.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const b = await readBody(req);
    const code = strField(b, 'code').trim();
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

    await connectDB();
    const result = await confirmMfaEnrollment(claims.sub, code);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'crypto_unavailable' ? 503 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ enabled: true, recoveryCodes: result.recoveryCodes });
  });
}
