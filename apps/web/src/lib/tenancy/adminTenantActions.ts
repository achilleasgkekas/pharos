// Superadmin single-tenant ACTIONS (TODO §8 "Superadmin console") — PURE planning for the one
// write surface the console needs: flip a workspace's `status` (suspend/reactivate/cancel) and/
// or override its `plan`, both as a manual operator action (billing recovery, dunning override,
// support request, comped upgrade). Deliberately narrow: no destructive drop, no membership
// mutation, no arbitrary field — only the two Tenant lifecycle fields the console exposes.
//
// Split like the rest of tenancy/: this module has zero DB/next/* imports (reuses only the
// existing enum sources), so the validation + no-op + audit-mapping logic is fully unit-testable.
// The route handler does the (node-only) read/write + `recordAudit` call with the planned input.
import { TENANT_STATUSES, type TenantStatus } from './adminTenants';
import { PLAN_KEYS, type PlanKey } from '@/lib/billing/plans';
import { statusAuditAction } from '@/lib/billing/statusAudit';
import type { AuditAction } from './audit';

/** True for a known Tenant.status value. Mirrors adminTenants' query-filter guard. */
export function isValidTenantStatus(x: unknown): x is TenantStatus {
  return typeof x === 'string' && (TENANT_STATUSES as readonly string[]).includes(x);
}

/** True for a known plan key. */
export function isValidPlanKey(x: unknown): x is PlanKey {
  return typeof x === 'string' && (PLAN_KEYS as readonly string[]).includes(x);
}

export type AdminTenantPatchInput = {
  /** Present (even if unchanged) to request a status flip; absent = leave status alone. */
  status?: unknown;
  /** Present (even if unchanged) to request a plan override; absent = leave plan alone. */
  plan?: unknown;
};

export type AdminTenantPatchPlan = {
  /** False only on a validation failure (bad enum value or neither field supplied). */
  ok: boolean;
  error: string | null;
  /** Mongo `$set` payload — empty when validated fine but nothing actually changed (no-op). */
  set: Partial<{ status: TenantStatus; plan: PlanKey }>;
  /** Audit action for the status transition, or null when status wasn't touched / didn't
   *  match a mapped transition (see statusAuditAction — e.g. a benign trialing→active flip). */
  statusAudit: AuditAction | null;
  /** True when the plan actually changed (the route logs this as 'plan.changed'). */
  planAudit: boolean;
};

/**
 * Validate + diff an admin PATCH request against the tenant's current status/plan. Rejects an
 * unknown enum value or a request with neither field. Idempotent: requesting the SAME value as
 * current yields an empty `set` (ok:true, nothing to write, nothing to audit) rather than an
 * error — an operator re-submitting the same form isn't a mistake. PURE: no DB, no Date.now.
 */
export function planAdminTenantPatch(
  input: AdminTenantPatchInput,
  current: { status: string; plan: string }
): AdminTenantPatchPlan {
  const hasStatus = input.status !== undefined;
  const hasPlan = input.plan !== undefined;

  if (!hasStatus && !hasPlan) {
    return {
      ok: false,
      error: 'nothing to update — provide status and/or plan',
      set: {},
      statusAudit: null,
      planAudit: false,
    };
  }

  const set: Partial<{ status: TenantStatus; plan: PlanKey }> = {};
  let statusAudit: AuditAction | null = null;
  let planAudit = false;

  if (hasStatus) {
    if (!isValidTenantStatus(input.status)) {
      return {
        ok: false,
        error: `invalid status — must be one of: ${TENANT_STATUSES.join(', ')}`,
        set: {},
        statusAudit: null,
        planAudit: false,
      };
    }
    if (input.status !== current.status) {
      set.status = input.status;
      statusAudit = statusAuditAction(current.status, input.status);
    }
  }

  if (hasPlan) {
    if (!isValidPlanKey(input.plan)) {
      return {
        ok: false,
        error: `invalid plan — must be one of: ${PLAN_KEYS.join(', ')}`,
        set: {},
        statusAudit: null,
        planAudit: false,
      };
    }
    if (input.plan !== current.plan) {
      set.plan = input.plan;
      planAudit = true;
    }
  }

  return { ok: true, error: null, set, statusAudit, planAudit };
}
