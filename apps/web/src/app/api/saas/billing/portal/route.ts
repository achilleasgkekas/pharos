import { NextRequest, NextResponse } from 'next/server';
import { resolveBillingSession } from '@/lib/billing/billingSession';
import { createPortalSession } from '@/lib/billing/stripe';
import { pickBaseUrl, portalReturnUrl } from '@/lib/billing/billingRoutes';
import { readBody, strField } from '@/lib/apiBody';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { portalAuditMeta } from '@/lib/billing/portalAudit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/billing/portal — open a Stripe Billing Portal session so a workspace
 * owner/admin can manage or cancel their subscription and update payment details.
 *
 * Body: `{ tenant?: <slug> }` (default: first workspace). Requires an owner/admin account
 * session on the chosen workspace, and that the workspace already has a Stripe customer
 * (set by the checkout webhook).
 *
 * Gating / errors:
 *   - SAAS_MODE off         → 404
 *   - not signed in         → 401
 *   - not owner/admin       → 403
 *   - no billing customer   → 409 (subscribe via checkout first)
 *   - Stripe not configured → 503
 *   - upstream Stripe error → 502
 * On success: `{ url }` — the portal URL to redirect the browser to.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);

    const resolved = await resolveBillingSession(strField(body, 'tenant').trim() || null);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const customerId = session.tenant.billingCustomerId;
    if (!customerId) {
      return NextResponse.json(
        { error: 'no active subscription; start checkout first' },
        { status: 409 }
      );
    }

    const base = pickBaseUrl(process.env.SAAS_PUBLIC_URL || process.env.APP_URL, new URL(req.url).origin);
    const result = await createPortalSession({ customerId, returnUrl: portalReturnUrl(base) });

    if (!result.ok) {
      const status = result.reason === 'not-configured' ? 503 : 502;
      return NextResponse.json({ error: `billing portal unavailable: ${result.reason}` }, { status });
    }

    // Best-effort audit: a real Stripe billing-portal session was created and the owner/admin
    // is being sent to it. recordAudit swallows its own errors and no-ops for the default
    // tenant, so this never affects the response. Logged AFTER success so failed/unconfigured
    // attempts (502/503/409) don't produce a misleading "portal opened" trail.
    await recordAudit(auditCtx(session.ctx.tenantId), {
      action: 'billing.portal_opened',
      actor: session.account.sub,
      target: session.tenant.slug,
      meta: portalAuditMeta(session.tenant.plan, result.data.id),
    });

    return NextResponse.json({ url: result.data.url, id: result.data.id });
  });
}
