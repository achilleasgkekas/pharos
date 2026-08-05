import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Tenant } from '@/models/Tenant';
import { saasMode } from '@/lib/tenancy/saasMode';
import { verifyStripeSignature, webhookSecret } from '@/lib/billing/stripe';
import { planForPriceId } from '@/lib/billing/plans';
import { statusAuditAction, planStatusChange } from '@/lib/billing/statusAudit';
import { isObjectId } from '@/lib/apiBody';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import type { TenantDoc } from '@/models/Tenant';

/** Record a control-plane plan change (system actor). No-op when the plan is unchanged. */
async function auditPlanChange(tenant: TenantDoc, prevPlan: string) {
  const nextPlan = String(tenant.plan);
  if (nextPlan === prevPlan) return;
  await recordAudit(auditCtx(String(tenant._id)), {
    action: 'plan.changed',
    actor: null,
    target: tenant.slug,
    meta: { from: prevPlan, to: nextPlan },
  });
}

/** Record a billing-driven lifecycle status change (suspend/cancel/reactivate). No-op when
 *  the status is unchanged or the transition isn't one we audit. */
async function auditStatusChange(tenant: TenantDoc, prevStatus: string) {
  const nextStatus = String(tenant.status);
  const action = statusAuditAction(prevStatus, nextStatus);
  if (!action) return;
  await recordAudit(auditCtx(String(tenant._id)), {
    action,
    actor: null,
    target: tenant.slug,
    meta: { field: 'status', from: prevStatus, to: nextStatus },
  });
}

/**
 * Move a tenant to `next`, writing everything that transition implies (the suspension clock, the
 * cancel-implied erasure) rather than the status alone. Assigning `tenant.status = x` directly is
 * what left `suspendedAt` stale across a reactivation and `canceled` with no deletion path; every
 * status write in this file goes through here. No-op when the status is unchanged.
 */
function applyStatus(tenant: TenantDoc, next: string): void {
  const fields = planStatusChange({
    prev: String(tenant.status ?? ''),
    next,
    erasureScheduledAt: tenant.erasureScheduledAt ?? null,
    erasureRequestedBy: tenant.erasureRequestedBy ?? null,
  });
  Object.assign(tenant, fields);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/billing/webhook — Stripe webhook receiver (SaaS mode only).
 *
 * SKELETON: verifies the signature against STRIPE_WEBHOOK_SECRET (no Stripe SDK), then
 * maps the few subscription-lifecycle events we care about onto Tenant.status/plan. It
 * NEVER charges anyone — it only reflects Stripe's state into our control plane.
 *
 * Gating:
 *   - SAAS_MODE off  → 404 (endpoint doesn't exist for the self-hosted app).
 *   - webhook secret unset → 503 (not configured; ack nothing).
 *   - bad/missing signature → 400 (do not process).
 * Always returns 200 on a handled/ignored event so Stripe stops retrying.
 */
export async function POST(req: NextRequest) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }
  if (!webhookSecret()) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
  }

  // Raw body is REQUIRED for signature verification — never re-parse before verifying.
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!verifyStripeSignature(raw, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const obj = (event.data?.object || {}) as Record<string, unknown>;
  try {
    await connectDB();
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(obj);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await onSubscriptionActive(obj);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionCanceled(obj);
        break;
      default:
        // Unhandled event types are acknowledged (200) and ignored.
        break;
    }
  } catch (e) {
    // Swallow processing errors into a 200 ack? No — surface a 500 so Stripe retries a
    // transient DB failure. Signature was already validated, so this is safe.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'webhook processing failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

/** Resolve the Tenant a Stripe object refers to: prefer explicit metadata.tenantId
 *  (set on checkout/subscription), fall back to the stored billingCustomerId. */
async function resolveTenant(obj: Record<string, unknown>) {
  const meta = (obj.metadata || {}) as Record<string, unknown>;
  const tenantId = typeof meta.tenantId === 'string' ? meta.tenantId : '';
  if (tenantId && isObjectId(tenantId)) {
    const t = await Tenant.findById(tenantId);
    if (t) return t;
  }
  const customer = typeof obj.customer === 'string' ? obj.customer : '';
  if (customer) return Tenant.findOne({ billingCustomerId: customer });
  return null;
}

async function onCheckoutCompleted(obj: Record<string, unknown>) {
  const tenant = await resolveTenant(obj);
  if (!tenant) return;
  const prevStatus = String(tenant.status);
  if (typeof obj.customer === 'string') tenant.billingCustomerId = obj.customer;
  if (typeof obj.subscription === 'string') tenant.billingSubscriptionId = obj.subscription;
  applyStatus(tenant, 'active');
  await tenant.save();
  await auditStatusChange(tenant, prevStatus);
}

async function onSubscriptionActive(obj: Record<string, unknown>) {
  const tenant = await resolveTenant(obj);
  if (!tenant) return;
  const prevPlan = String(tenant.plan);
  const prevStatus = String(tenant.status);
  if (typeof obj.id === 'string') tenant.billingSubscriptionId = obj.id;

  // Map the subscription's price back to one of our plans, if configured.
  const priceId = firstPriceId(obj);
  if (priceId) {
    const plan = planForPriceId(priceId);
    if (plan) tenant.plan = plan;
  }

  const stripeStatus = typeof obj.status === 'string' ? obj.status : '';
  if (stripeStatus === 'active' || stripeStatus === 'trialing') applyStatus(tenant, 'active');
  else if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') applyStatus(tenant, 'suspended');
  await tenant.save();
  await auditPlanChange(tenant, prevPlan);
  await auditStatusChange(tenant, prevStatus);
}

async function onSubscriptionCanceled(obj: Record<string, unknown>) {
  const tenant = await resolveTenant(obj);
  if (!tenant) return;
  const prevPlan = String(tenant.plan);
  const prevStatus = String(tenant.status);
  applyStatus(tenant, 'canceled');
  tenant.plan = 'free';
  await tenant.save();
  await auditPlanChange(tenant, prevPlan);
  await auditStatusChange(tenant, prevStatus);
}

/** Pull the first line-item price id out of a Stripe subscription object (best-effort). */
function firstPriceId(sub: Record<string, unknown>): string | null {
  const items = (sub.items || {}) as { data?: Array<{ price?: { id?: string } }> };
  const id = items.data?.[0]?.price?.id;
  return typeof id === 'string' ? id : null;
}
