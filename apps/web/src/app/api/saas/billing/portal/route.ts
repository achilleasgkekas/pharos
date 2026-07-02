import { NextRequest, NextResponse } from 'next/server';
import { resolveBillingSession } from '@/lib/billing/billingSession';
import { createPortalSession } from '@/lib/billing/stripe';
import { pickBaseUrl, portalReturnUrl } from '@/lib/billing/billingRoutes';

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
  const body = (await req.json().catch(() => ({}))) as { tenant?: string };

  const resolved = await resolveBillingSession(body.tenant ?? null);
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

  return NextResponse.json({ url: result.data.url, id: result.data.id });
}
