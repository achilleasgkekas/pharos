import { NextRequest, NextResponse } from 'next/server';
import { resolveBillingSession } from '@/lib/billing/billingSession';
import { createCheckoutSession } from '@/lib/billing/stripe';
import { checkoutablePlan, pickBaseUrl, checkoutUrls } from '@/lib/billing/billingRoutes';
import { readBody, strField } from '@/lib/apiBody';

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

  return NextResponse.json({ url: result.data.url, id: result.data.id });
}
