import { NextRequest, NextResponse } from 'next/server';
import { resolveBillingSession } from '@/lib/billing/billingSession';
import { readBody, strField } from '@/lib/apiBody';
import { rateLimit, clientIp } from '@/lib/apiAuth';
import { activationRateConfig } from '@/lib/apiRateLimit';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { resolveActivation } from '@/lib/billing/activationCode';
import { Tenant } from '@/models/Tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/billing/activate — put a workspace on a paid plan by redeeming a code.
 *
 * This is the ONLY way to a paid plan today. Self-serve payment is deliberately closed
 * (checkout answers 503 without Stripe keys), so onboarding runs on codes handed out
 * personally, and anything else is refused rather than left half-working.
 *
 * Body: `{ code, plan?, tenant? }`. Owner/admin on the workspace, same as checkout.
 *
 *   SAAS_MODE off        → 404
 *   not signed in        → 401
 *   not owner/admin      → 403
 *   no codes configured  → 503 (activation is not open on this deployment)
 *   bad code / mismatch  → 400, with ONE message for every rejection
 *
 * The rejection message is deliberately identical for "wrong code" and "right code, wrong
 * plan": telling someone which half of their guess landed is how a guess becomes a method.
 * The audit trail records both outcomes and never the code itself.
 *
 * RATE LIMITED on two keys, because this is the one door to a paid plan and the codes are
 * human-shaped (`FRIENDS-2026`), not random bytes — a uniform rejection message stops a guess
 * becoming a method, but nothing except a limiter stops it becoming a loop:
 *
 *   by IP      first, before any body read or DB round trip, so a flood cannot make the
 *              server do work on its behalf (same placement as the login route).
 *   by account after the session resolves, because an IP is cheap to rotate and an account
 *              is not optional here — reaching the code check at all requires being owner or
 *              admin of a workspace.
 *
 * Both use `activationRateConfig()`, NOT the general API budget: this endpoint gets 5 tries
 * per hour and is ON by default (see the config for why a paywall does not get to be opt-in).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const rate = activationRateConfig();

    const limitedByIp = rateLimit(`saas-activate-ip:${clientIp(req)}`, rate);
    if (limitedByIp) return limitedByIp;

    const body = await readBody(req);

    const resolved = await resolveBillingSession(strField(body, 'tenant').trim() || null);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const limitedByAccount = rateLimit(`saas-activate:${session.account.sub}`, rate);
    if (limitedByAccount) return limitedByAccount;

    const outcome = resolveActivation(strField(body, 'code'), strField(body, 'plan'));

    if (!outcome.ok) {
      if (outcome.reason === 'not-configured') {
        return NextResponse.json(
          { error: 'activation is not open on this server yet' },
          { status: 503 }
        );
      }
      // Failed attempts ARE logged (this is the one door into paid plans, so a burst of
      // them is worth being able to see), with the reason but never the submitted code.
      await recordAudit(auditCtx(session.ctx.tenantId), {
        action: 'billing.activation_rejected',
        actor: session.account.sub,
        target: session.tenant.slug,
        meta: { reason: outcome.reason },
      });
      return NextResponse.json({ error: 'that activation code is not valid' }, { status: 400 });
    }

    await Tenant.updateOne(
      { _id: session.ctx.tenantId },
      { $set: { plan: outcome.plan, status: 'active' } }
    );

    await recordAudit(auditCtx(session.ctx.tenantId), {
      action: 'billing.activated_by_code',
      actor: session.account.sub,
      target: session.tenant.slug,
      meta: { plan: outcome.plan },
    });

    return NextResponse.json({ ok: true, plan: outcome.plan });
  });
}
