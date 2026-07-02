// PURE helpers for the SaaS billing route handlers (checkout + portal). No imports, no
// DB, no env reads at module load — safe from any runtime and unit-testable. The route
// handlers layer session/DB/Stripe on top of these.
//
// Only meaningful when SAAS_MODE is on. The self-hosted (AGPL) app never mounts billing
// routes (they 404 via saasAuthGate), so nothing here runs in the single-user path.

import type { PlanKey } from './plans';
import { PLAN_KEYS } from './plans';

/**
 * Which SaaS org roles may perform billing actions (open checkout, manage subscription).
 * Mirrors Membership role semantics: owner + admin manage billing; member cannot.
 */
export function canManageBilling(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * A checkout target must be a PAID plan. `free` has no Stripe price → not checkout-able,
 * and unknown/legacy strings are rejected. Returns the validated PlanKey or null.
 */
export function checkoutablePlan(plan: string | null | undefined): PlanKey | null {
  if (!plan) return null;
  if (!(PLAN_KEYS as readonly string[]).includes(plan)) return null;
  if (plan === 'free') return null;
  return plan as PlanKey;
}

/** Strip a trailing slash from a URL/base so joins never double up. */
export function normalizeBase(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

/**
 * The public base URL to build Stripe redirect URLs from. Prefer an explicitly configured
 * public URL (behind a proxy the request Host can be internal); fall back to the request
 * origin. Pure: env is passed in by the caller.
 */
export function pickBaseUrl(envBase: string | null | undefined, reqOrigin: string): string {
  const env = normalizeBase(envBase || '');
  return env || normalizeBase(reqOrigin);
}

/** Checkout success/cancel URLs for a base. `{CHECKOUT_SESSION_ID}` is a Stripe template
 *  token Stripe substitutes on redirect — left literal on purpose. */
export function checkoutUrls(base: string): { successUrl: string; cancelUrl: string } {
  const b = normalizeBase(base);
  return {
    successUrl: `${b}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${b}/settings?billing=cancelled`,
  };
}

/** Where the Stripe billing portal returns the user after they finish managing billing. */
export function portalReturnUrl(base: string): string {
  return `${normalizeBase(base)}/settings?billing=portal_return`;
}
