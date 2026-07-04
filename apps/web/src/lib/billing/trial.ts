// PURE trial-window helper for the SaaS lifecycle. A tenant is provisioned with
// status 'trialing' (lib/tenancy/provision.ts); until now nothing stamped an END for
// that trial, so trials were effectively open-ended and no read surface could tell the
// UI "N days left" or "trial expired". This module supplies both halves, with ZERO
// imports (no DB, no env, no Stripe) so it is safe from any runtime and fully
// unit-testable.
//
// Only meaningful when SAAS_MODE is on. The self-hosted (AGPL) app never creates Tenant
// docs and never runs the billing route, so nothing here executes in the single-user path.

/**
 * Default trial length in days. PLACEHOLDER — the real trial length is a product/pricing
 * decision (see SAAS_PROGRESS.md → Needs Achilleas). Kept here as the single source so a
 * later change is one edit.
 */
export const DEFAULT_TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Coerce a trial-length input to a non-negative integer day count (garbage → default). */
function normalizeDays(days: number | null | undefined): number {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return DEFAULT_TRIAL_DAYS;
  return Math.floor(days);
}

/** Parse a Date | string | number to a valid Date, or null. Tolerant of serialized values. */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compute the trial end instant: `start + days`. Used at provisioning to stamp
 * Tenant.trialEndsAt. Garbage `start` falls back to the current time so a tenant always
 * gets a sane, in-the-future trial end.
 */
export function trialEndFrom(
  start: Date | string | number,
  days: number = DEFAULT_TRIAL_DAYS,
  now: Date = new Date()
): Date {
  const base = toDate(start) ?? now;
  return new Date(base.getTime() + normalizeDays(days) * MS_PER_DAY);
}

export type TrialState = {
  /** The tenant is currently within an active trial window. */
  onTrial: boolean;
  /** The trial had an end date and it has passed (billing should have taken over). */
  expired: boolean;
  /**
   * Whole days remaining in the trial, rounded up (so a partial final day still reads
   * as 1). null when the tenant is not on a bounded trial (converted, or open-ended).
   */
  daysLeft: number | null;
};

export type TrialInput = {
  status: string | null | undefined;
  trialEndsAt: Date | string | number | null | undefined;
};

/**
 * Evaluate a tenant's trial state from its lifecycle status + trial end.
 *
 * - status !== 'trialing'  → not on a trial (converted/suspended/etc): all-clear, no countdown.
 * - trialing, no end date  → open-ended trial (legacy tenants provisioned before trialEndsAt
 *                            was stamped): onTrial, but no countdown (daysLeft null).
 * - trialing, end in future → onTrial with daysLeft.
 * - trialing, end reached   → expired (onTrial false, daysLeft 0).
 */
export function evaluateTrial(input: TrialInput, now: Date = new Date()): TrialState {
  if (input.status !== 'trialing') {
    return { onTrial: false, expired: false, daysLeft: null };
  }
  const end = toDate(input.trialEndsAt);
  if (!end) {
    // Trialing with no bound → treat as an active, open-ended trial.
    return { onTrial: true, expired: false, daysLeft: null };
  }
  const remainingMs = end.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { onTrial: false, expired: true, daysLeft: 0 };
  }
  return { onTrial: true, expired: false, daysLeft: Math.ceil(remainingMs / MS_PER_DAY) };
}
