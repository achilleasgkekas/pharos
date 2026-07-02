// PURE builder for the SaaS "billing summary" read surface. Turns a tenant's plan +
// lifecycle status + Stripe linkage into the single object a settings/billing UI reads to
// decide what to render (Subscribe vs Manage vs read-only view) and whether the billing
// backend is even wired up. No imports beyond the pure plan table — no DB, no env reads,
// no Stripe SDK — so it is safe from any runtime and fully unit-testable.
//
// Only meaningful when SAAS_MODE is on. The self-hosted (AGPL) app never mounts the
// billing route (it 404s via saasAuthGate), so nothing here runs in the single-user path.

import { planDef, type PlanKey } from './plans';
import { canManageBilling } from './billingRoutes';

/** What the billing UI should offer the current viewer. */
export type BillingAction = 'subscribe' | 'manage' | 'view';

export type BillingSummary = {
  plan: {
    key: PlanKey;
    name: string;
    priceMonthlyEUR: number;
    tier: 'shared' | 'dedicated';
    storageGB: number;
    aiCallsPerMonth: number | null;
    customDomain: boolean;
  };
  status: string;
  trialEndsAt: string | null;
  subscription: {
    customerId: string | null;
    subscriptionId: string | null;
    /** True once Stripe has linked a subscription (checkout completed). */
    active: boolean;
  };
  /** Stripe is set up (secret key present) → the Subscribe/Manage buttons will work. */
  billingConfigured: boolean;
  /** Viewer's role permits billing actions (owner/admin). Members get a read-only view. */
  canManage: boolean;
  /** The single call-to-action the UI should surface for this viewer + state. */
  action: BillingAction;
};

/**
 * Decide the billing call-to-action. Members (no billing permission) always get a
 * read-only `view`; managers get `manage` once a Stripe subscription exists, otherwise
 * `subscribe` (start / upgrade). Independent of `billingConfigured` on purpose — the UI
 * can still show intent and surface a "billing not configured" note from that flag.
 */
export function billingAction(hasSubscription: boolean, canManage: boolean): BillingAction {
  if (!canManage) return 'view';
  return hasSubscription ? 'manage' : 'subscribe';
}

export type BillingSummaryInput = {
  plan: string | null | undefined;
  status: string | null | undefined;
  role: string | null | undefined;
  billingCustomerId: string | null | undefined;
  billingSubscriptionId: string | null | undefined;
  trialEndsAt: Date | string | null | undefined;
  /** Result of stripeConfigured() — passed in to keep this module pure. */
  billingConfigured: boolean;
};

/** ISO string for a Date/string/nullish, or null. Tolerant of already-serialized values. */
function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Assemble the read-only billing summary for one tenant + viewer. */
export function buildBillingSummary(input: BillingSummaryInput): BillingSummary {
  const def = planDef(input.plan);
  const subscriptionId = input.billingSubscriptionId?.trim() || null;
  const customerId = input.billingCustomerId?.trim() || null;
  const hasSubscription = !!subscriptionId;
  const canManage = canManageBilling(input.role);

  return {
    plan: {
      key: def.key,
      name: def.name,
      priceMonthlyEUR: def.priceMonthlyEUR,
      tier: def.tier,
      storageGB: def.storageGB,
      aiCallsPerMonth: def.aiCallsPerMonth,
      customDomain: def.customDomain,
    },
    status: input.status || 'trialing',
    trialEndsAt: toIso(input.trialEndsAt),
    subscription: {
      customerId,
      subscriptionId,
      active: hasSubscription,
    },
    billingConfigured: !!input.billingConfigured,
    canManage,
    action: billingAction(hasSubscription, canManage),
  };
}
