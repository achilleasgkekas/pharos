// PURE + client-safe view helpers for the user-facing Billing settings panel
// ((saas)/account/workspace/billing). Turn the plan ladder + the current billing summary into
// the small view-model the BillingPanel renders — which plan is current, which paid plans can be
// chosen, and the human labels. No DB, no env, no next/* — safe from client and unit-testable.
// Only meaningful in SAAS_MODE; the self-hosted app never mounts the billing segment.
import { PLANS, PLAN_KEYS, type PlanKey, type PlanDef } from '@/lib/billing/plans';

/** A plan rendered as a card in the panel, with its display labels resolved. */
export type PlanCard = {
  key: PlanKey;
  name: string;
  /** "Free" or "€9 / mo". */
  priceLabel: string;
  /** "1,000 AI calls / mo" style included-usage line, or "Unlimited AI calls". */
  aiLabel: string;
  /** "50 GB storage". */
  storageLabel: string;
  /** null = unlimited seats. */
  maxMembers: number | null;
  customDomain: boolean;
  /** This is the workspace's current plan. */
  current: boolean;
  /** A paid plan the viewer may start checkout for (manager + not already subscribed). */
  checkoutable: boolean;
};

const NUM = new Intl.NumberFormat('en-US');

/** "Free" for 0, otherwise "€N / mo". */
export function priceLabel(priceMonthlyEUR: number): string {
  return priceMonthlyEUR > 0 ? `€${priceMonthlyEUR} / mo` : 'Free';
}

/** Included AI-calls line for a plan (null = unlimited). */
export function aiLabel(aiCallsPerMonth: number | null): string {
  return aiCallsPerMonth == null
    ? 'Unlimited AI calls'
    : `${NUM.format(aiCallsPerMonth)} AI calls / mo`;
}

/** "N GB storage". */
export function storageLabel(storageGB: number): string {
  return `${NUM.format(storageGB)} GB storage`;
}

/** "Unlimited seats" / "1 seat" / "N seats". */
export function seatsLabel(maxMembers: number | null): string {
  if (maxMembers == null) return 'Unlimited seats';
  return maxMembers === 1 ? '1 seat' : `${NUM.format(maxMembers)} seats`;
}

/**
 * Build the ordered plan cards for the panel. A plan is `checkoutable` when the viewer can
 * manage billing, the workspace has no live subscription yet, and the plan is paid (not the
 * current one) — mirroring the checkout route's `checkoutablePlan` gate. Once a subscription
 * exists, plan changes go through the Stripe portal, so nothing is checkoutable inline.
 */
export function planCards(opts: {
  currentPlan: string | null | undefined;
  canManage: boolean;
  hasSubscription: boolean;
}): PlanCard[] {
  const current = (opts.currentPlan as PlanKey) || 'free';
  return PLAN_KEYS.map((key) => {
    const def: PlanDef = PLANS[key];
    const isCurrent = key === current;
    const paid = def.priceMonthlyEUR > 0;
    return {
      key,
      name: def.name,
      priceLabel: priceLabel(def.priceMonthlyEUR),
      aiLabel: aiLabel(def.aiCallsPerMonth),
      storageLabel: storageLabel(def.storageGB),
      maxMembers: def.maxMembers,
      customDomain: def.customDomain,
      current: isCurrent,
      checkoutable: opts.canManage && !opts.hasSubscription && paid && !isCurrent,
    };
  });
}

/**
 * Turn a failed billing API response into something a person can act on.
 *
 * `action` matters because BOTH billing routes answer 409 and they mean OPPOSITE things:
 * the portal refuses a workspace with NO Stripe customer to manage, while checkout refuses
 * one that ALREADY has a live subscription (#221). A single shared 409 message told the
 * second group "no active subscription to manage, start a plan first" — the exact inverse
 * of their situation, and an invitation to keep retrying the thing that was just blocked.
 */
export function billingErrorMessage(
  action: 'checkout' | 'portal',
  status: number,
  apiError: string | undefined
): string {
  if (status === 503) return 'Billing is not configured on this deployment yet.';
  if (status === 409) {
    return action === 'checkout'
      ? 'This workspace already has an active subscription. Use "Manage billing" to change or cancel your plan.'
      : 'No active subscription to manage. Start a plan first.';
  }
  if (status === 502) return 'The billing provider is temporarily unavailable. Try again shortly.';
  if (status === 403) return 'Only owners and admins can change billing.';
  return apiError || 'Something went wrong. Please try again.';
}
