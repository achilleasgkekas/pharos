// PURE mapping from a Tenant lifecycle status transition to the audit action that records it.
// No DB / env / imports beyond the audit action type, so it is fully unit-testable and can be
// reused by any code path that mutates Tenant.status (today: the Stripe billing webhook).
//
// Only meaningful in SaaS mode; the recorder it feeds is a no-op for the default tenant.
import type { AuditAction } from '@/lib/tenancy/audit';

/** Normalize a status value the way the Tenant enum stores it (lowercase/trim); non-string → ''. */
function normStatus(x: unknown): string {
  return typeof x === 'string' ? x.trim().toLowerCase() : '';
}

/**
 * The auditable action for a `prev → next` status change, or null when nothing should be
 * logged. Focuses on the billing lifecycle transitions that matter for the activity trail:
 *
 *   - → suspended                    ⇒ 'workspace.suspended'   (dunning / payment failed)
 *   - → canceled                     ⇒ 'workspace.canceled'    (subscription deleted)
 *   - suspended|canceled → active|trialing ⇒ 'workspace.reactivated' (payment recovered / resubscribe)
 *
 * Everything else is null: a no-op change (prev === next), the initial go-live
 * (pending|trialing → active is normal onboarding, already captured by plan.changed), and
 * benign trialing↔active flips. Fail-closed on unknown/blank next status.
 */
export function statusAuditAction(prev: unknown, next: unknown): AuditAction | null {
  const p = normStatus(prev);
  const n = normStatus(next);
  if (!n || p === n) return null;
  if (n === 'suspended') return 'workspace.suspended';
  if (n === 'canceled') return 'workspace.canceled';
  if (n === 'active' || n === 'trialing') {
    // Only a recovery from a blocked state is a "reactivation"; a fresh activation isn't.
    return p === 'suspended' || p === 'canceled' ? 'workspace.reactivated' : null;
  }
  return null;
}
