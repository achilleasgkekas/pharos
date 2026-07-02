import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { normalizeEmail, looksLikeEmail } from '@/lib/tenancy/members';
import { mintResetToken, resetDeliveryConfigured } from '@/lib/tenancy/passwordReset';
import { sendEmail, resetEmail, resetLinkUrl } from '@/lib/tenancy/mailer';
import { pickBaseUrl } from '@/lib/billing/billingRoutes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/reset/request  { email }
 *   → if an account with this email exists, mint a reset token, store its hash + expiry,
 *     and (once a mailer exists) email the link. UNAUTHENTICATED by design (the user forgot
 *     their password).
 *
 * Anti-enumeration: the response is ALWAYS { ok: true } regardless of whether the email is
 * registered, so a caller cannot probe which emails have accounts.
 *
 * SCAFFOLD until a mailer is wired up (see Needs-Achilleas in SAAS_PROGRESS.md): when no
 * delivery channel is configured AND we are not in production, the freshly minted token is
 * echoed back as `devToken` so the flow is testable locally. In production this never
 * happens — an unwired mailer there just drops the token silently (fail closed, no leak).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const b = await readBody(req);
    const email = normalizeEmail(strField(b, 'email', '', true));
    if (!looksLikeEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    await connectDB();
    const account = await Account.findOne({ email }).select('_id');

    // No account → still return ok (no enumeration). No token minted.
    if (!account) return NextResponse.json({ ok: true });

    const { token, tokenHash, expires } = mintResetToken();
    account.set({ resetTokenHash: tokenHash, resetTokenExpires: expires });
    await account.save();

    // Email the reset link through the configured provider (best-effort; never throws).
    if (resetDeliveryConfigured()) {
      const base = pickBaseUrl(process.env.SAAS_PUBLIC_URL || process.env.APP_URL, new URL(req.url).origin);
      const { subject, html } = resetEmail(resetLinkUrl(base, token));
      await sendEmail({ to: email, subject, html });
    }

    // SCAFFOLD: when no delivery channel is wired AND we are not in production, echo the token
    // so the flow is testable locally. In production an unwired mailer drops it silently.
    const canEcho = !resetDeliveryConfigured() && process.env.NODE_ENV !== 'production';
    return NextResponse.json(canEcho ? { ok: true, devToken: token } : { ok: true });
  });
}
