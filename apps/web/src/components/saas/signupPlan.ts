// PURE + client-safe: what the signup page should say about the plan the visitor arrived
// with (`/account/signup?plan=shared`).
//
// The landing page's pricing cards carry the choice across in the URL. Until now signup
// ignored it entirely, so someone who deliberately clicked "Pro €9" got a generic form with
// no sign their choice had been registered — the commonest way a funnel loses people is
// making them wonder whether the thing they just clicked did anything.
//
// Read-only by design. This does NOT put anyone on a paid plan: a new workspace starts free
// and the plan is switched on afterwards by activation code (lib/billing/activationCode).
// Saying otherwise on this page would be a promise the signup cannot keep.
import { PLANS, type PlanKey } from '@/lib/billing/plans';

export type SignupPlanNotice = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  /** What actually happens next, in the visitor's terms. */
  nextStep: string;
};

/**
 * Resolve `?plan=` to a notice, or null when there is nothing honest to show.
 *
 * Null for an unknown value AND for `free`: a free signup has no plan to confirm, and an
 * unrecognised one must not be echoed back (it would let any string be reflected onto the
 * page, and it would tell the visitor we understood something we did not).
 */
export function signupPlanNotice(raw: unknown): SignupPlanNotice | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (key !== 'shared' && key !== 'dedicated') return null;
  const plan = PLANS[key as PlanKey];
  if (!plan) return null;
  return {
    key: plan.key,
    name: plan.name,
    priceLabel: `€${plan.priceMonthlyEUR}/month`,
    nextStep: 'Create your account first — you can activate this plan right after, from Billing.',
  };
}
