import { NextRequest, NextResponse } from 'next/server';
import { resolveBillingSession } from '@/lib/billing/billingSession';
import { createCheckoutSession } from '@/lib/billing/stripe';
import { checkoutablePlan, pickBaseUrl, checkoutUrls } from '@/lib/billing/billingRoutes';
import { readBody, strField } from '@/lib/apiBody';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { checkoutAuditMeta } from '@/lib/billing/checkoutAudit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/billing/checkout — start a Stripe Checkout Session for a paid plan.
 *
 * Body: `{ plan: 'shared' | 'dedicated', tenant?: <slug> }`. Requires an owner/admin
 * account session on the chosen workspace (default: first workspace).
 *
 * Gating / errors:
 *   - SAAS_MODE off        → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in        → 401
 *   - not owner/admin      → 403
 *   - bad/free plan        → 400
 *   - Stripe not configured→ 503 (keys deferred by Achilleas; degrade gracefully)
 *   - upstream Stripe error→ 502
 * On success: `{ url }` — the hosted checkout URL to redirect the browser to. NEVER
 * charges here; Stripe collects payment and the webhook reflects the result.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);

    const resolved = await resolveBillingSession(strField(body, 'tenant').trim() || null);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const plan = checkoutablePlan(strField(body, 'plan'));
    if (!plan) {
      return NextResponse.json(
        { error: 'plan must be a paid plan (shared or dedicated)' },
        { status: 400 }
      );
    }

    const base = pickBaseUrl(process.env.SAAS_PUBLIC_URL || process.env.APP_URL, new URL(req.url).origin);
    const { successUrl, cancelUrl } = checkoutUrls(base);

    const result = await createCheckoutSession({
      plan,
      tenantId: session.ctx.tenantId!,
      customerId: session.tenant.billingCustomerId,
      customerEmail: session.account.email,
      successUrl,
      cancelUrl,
    });

    if (!result.ok) {
      const status = result.reason === 'not-configured' ? 503 : 502;
      return NextResponse.json({ error: `checkout unavailable: ${result.reason}` }, { status });
    }

    // Best-effort audit: a real Stripe checkout was created and the owner/admin is being sent
    // to it. recordAudit swallows its own errors and no-ops for the default tenant, so this
    // never affects the response. Logged AFTER success so failed/unconfigured attempts (502/503)
    // don't produce a misleading "checkout started" trail.
    await recordAudit(auditCtx(session.ctx.tenantId), {
      action: 'billing.checkout_started',
      actor: session.account.sub,
      target: session.tenant.slug,
      meta: checkoutAuditMeta(plan, result.data.id),
    });

    return NextResponse.json({ url: result.data.url, id: result.data.id });
  });
}
