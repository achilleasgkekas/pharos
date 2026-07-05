import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { normalizeEmail, looksLikeEmail } from '@/lib/tenancy/members';
import { mintResetToken, resetDeliveryConfigured } from '@/lib/tenancy/passwordReset';
import { settleMinResponseTime } from '@/lib/tenancy/resetTiming';
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
 * registered, so a caller cannot probe which emails have accounts. And it is constant-TIME
 * too (D6): a registered email additionally mints + persists a token (a DB write), which would
 * otherwise make its response measurably slower and re-open the enumeration channel by timing.
 * We close it two ways — (1) the outbound email is fired WITHOUT awaiting it, so its network
 * latency never enters the timed path, and (2) every response is padded up to a fixed floor
 * (settleMinResponseTime), so the existence-dependent DB write is masked.
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

    // Start the constant-time clock BEFORE any account-dependent work so both the "found" and
    // "not found" branches are padded to the same floor below (D6).
    const startedAt = Date.now();

    const b = await readBody(req);
    const email = normalizeEmail(strField(b, 'email', '', true));
    // A malformed-email 400 depends only on the input string, not on the DB, so it leaks no
    // account existence and needs no floor.
    if (!looksLikeEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    await connectDB();
    const account = await Account.findOne({ email }).select('_id');

    // Only a registered email mints + persists a token. The unregistered branch does nothing
    // extra; the response floor below hides the difference so timing can't enumerate accounts.
    let devToken: string | undefined;
    if (account) {
      const { token, tokenHash, expires } = mintResetToken();
      account.set({ resetTokenHash: tokenHash, resetTokenExpires: expires });
      await account.save();

      if (resetDeliveryConfigured()) {
        const base = pickBaseUrl(process.env.SAAS_PUBLIC_URL || process.env.APP_URL, new URL(req.url).origin);
        const { subject, html } = resetEmail(resetLinkUrl(base, token));
        // Fire-and-forget: the outbound email must not add account-dependent latency to the
        // timed response. sendEmail never throws; the catch is belt-and-suspenders.
        void sendEmail({ to: email, subject, html }).catch(() => {});
      } else if (process.env.NODE_ENV !== 'production') {
        // SCAFFOLD: when no delivery channel is wired AND we are not in production, echo the
        // token so the flow is testable locally. In production it drops silently (fail closed).
        devToken = token;
      }
    }

    // Pad to a fixed floor so a registered email (extra DB write above) is indistinguishable
    // from an unregistered one by response time.
    await settleMinResponseTime(startedAt);
    return NextResponse.json(devToken ? { ok: true, devToken } : { ok: true });
  });
}
