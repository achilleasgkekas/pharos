// PURE trial-lapse decision layer for the SaaS lifecycle. Increment 38 gave us
// `evaluateTrial` (is a trial active / expired / N days left) but nothing acted on an
// EXPIRED trial: a tenant whose trial ended just kept `status:'trialing'` forever with
// full access. This module closes that loop by deciding the target status transition —
// `trialing` + expired ⇒ `suspended` (a dunning hold) — which the rest of the stack
// already understands: `workspaceStatusError` blocks `suspended`, `statusAuditAction`
// logs `→ suspended` as `workspace.suspended`, and an owner clears it by adding billing.
//
// ZERO DB / env / Stripe imports (only the PURE `evaluateTrial`) so it stays fully
// unit-testable and safe from any runtime. The actual mutation (a cron/job that loads
// candidates and $sets the new status) is a later, impure increment; this is its
// decision core, separated so "which tenants lapse" is testable without a database.
//
// Only meaningful when SAAS_MODE is on. The self-hosted (AGPL) app never creates Tenant
// docs and never runs billing, so nothing here executes in the single-user path.
import { evaluateTrial, type TrialInput } from './trial';

/**
 * The lifecycle status an expired trial transitions INTO. `suspended` (not `canceled`) is
 * deliberate: expiry is a recoverable dunning hold — the owner reactivates by resolving
 * billing (see `reactivateStatusError`), whereas `canceled` is an owner-initiated soft delete.
 */
export const LAPSED_TRIAL_STATUS = 'suspended' as const;

export type TrialLapseReason = 'trial-expired' | 'not-expired' | 'not-trialing';

export type TrialLapseDecision = {
  /** True only when a trialing tenant's bounded trial has passed its end instant. */
  shouldLapse: boolean;
  /** The status to transition into when lapsing, else null (no change). */
  nextStatus: typeof LAPSED_TRIAL_STATUS | null;
  /** Why the decision came out the way it did (for logging / tests). */
  reason: TrialLapseReason;
};

/**
 * Decide whether a single tenant's trial has lapsed and what status it should move to.
 *
 * - status !== 'trialing'      → never lapses here (already converted/suspended/canceled/pending).
 * - trialing, open-ended/future → not expired yet, no change.
 * - trialing, end reached/past  → lapse ⇒ `suspended`.
 *
 * Note: an open-ended trial (trialing with no `trialEndsAt`, e.g. a legacy tenant provisioned
 * before ends were stamped) is treated as still-active by `evaluateTrial`, so it does NOT lapse.
 * That is intentional — auto-suspending tenants that were never given a bound would be surprising;
 * they get an end stamped by a future backfill rather than being force-expired here.
 */
export function evaluateTrialLapse(input: TrialInput, now: Date = new Date()): TrialLapseDecision {
  if (input.status !== 'trialing') {
    return { shouldLapse: false, nextStatus: null, reason: 'not-trialing' };
  }
  if (evaluateTrial(input, now).expired) {
    return { shouldLapse: true, nextStatus: LAPSED_TRIAL_STATUS, reason: 'trial-expired' };
  }
  return { shouldLapse: false, nextStatus: null, reason: 'not-expired' };
}

export type LapseCandidate = TrialInput & { id: string };

/**
 * Batch planner for a future sweep job: given tenant-like rows, return the ids whose trials
 * have lapsed and should be suspended. PURE — the caller does the DB read (ideally narrowed by
 * `lapsedTrialFilter`) and the DB write. Rows missing/blank id are skipped defensively.
 */
export function planTrialLapses(candidates: LapseCandidate[], now: Date = new Date()): string[] {
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const c of candidates) {
    if (c && typeof c.id === 'string' && c.id && evaluateTrialLapse(c, now).shouldLapse) {
      ids.push(c.id);
    }
  }
  return ids;
}

/**
 * MongoDB query filter that narrows a Tenant scan to only lapse candidates: trialing tenants
 * whose bounded `trialEndsAt` is at/before `now`. Returned as a plain object so a future sweep
 * job avoids loading every tenant. Open-ended trials (null/missing `trialEndsAt`) do NOT match a
 * `$lte`-a-Date comparison in Mongo, matching `evaluateTrialLapse`'s "open-ended never lapses".
 */
export function lapsedTrialFilter(now: Date = new Date()): Record<string, unknown> {
  return { status: 'trialing', trialEndsAt: { $lte: now } };
}
