import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { saasAuthGate } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { mintVerifyToken } from '@/lib/tenancy/emailVerify';
import { mailerCanDeliver, sendEmail, verifyEmail, verifyLinkUrl } from '@/lib/tenancy/mailer';
import { pickBaseUrl } from '@/lib/billing/billingRoutes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/account/verify/request
 *   → mint an email-verification token for the CALLER'S OWN account, store its hash + expiry,
 *     and (once a mailer exists) email the confirmation link. AUTHENTICATED — the request
 *     targets the logged-in account's email, so there is no enumeration surface.
 *
 * Already-verified accounts short-circuit with { ok: true, alreadyVerified: true } and mint
 * no token.
 *
 * SCAFFOLD until a mailer is wired up (see SAAS_PROGRESS.md): when no delivery channel is
 * configured AND we are not in production, the freshly minted token is echoed back as
 * `devToken` so the flow is testable locally. In production an unwired mailer drops it
 * silently (fail closed).
 */
export async function POST(req: NextRequest) {
  const gate = saasAuthGate();
  if (gate) return gate;

  const claims = await getCurrentAccount();
  if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await connectDB();
  const account = await Account.findById(claims.sub).select('_id email emailVerified');
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  if (account.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const { token, tokenHash, expires } = mintVerifyToken();
  account.set({ verifyTokenHash: tokenHash, verifyTokenExpires: expires });
  await account.save();

  // Email the verification link through the configured provider (best-effort; never throws).
  if (mailerCanDeliver()) {
    const base = pickBaseUrl(process.env.SAAS_PUBLIC_URL || process.env.APP_URL, new URL(req.url).origin);
    const { subject, html } = verifyEmail(verifyLinkUrl(base, token));
    await sendEmail({ to: account.email, subject, html });
  }

  // SCAFFOLD: echo the token only when nothing was delivered AND we are not in production.
  const canEcho = !mailerCanDeliver() && process.env.NODE_ENV !== 'production';
  return NextResponse.json(canEcho ? { ok: true, devToken: token } : { ok: true });
}
