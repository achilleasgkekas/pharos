// PURE helper for the `billing.portal_opened` audit event. No imports, no DB, no env —
// fully unit-testable and safe to call from anywhere. Its only job is to build a
// secret-free `meta` object for the audit trail: it whitelists the workspace's current plan
// (context: who opened the billing portal, on what plan) plus the Stripe portal-session id
// when available, and NEVER carries the portal URL, Stripe customer id, or any key/secret.
// The portal-session id is a correlation handle (`bps_...`), not a credential — logging it
// lets an Activity panel line a portal-open up against any resulting subscription change.

/**
 * Build the audit `meta` for an opened billing portal. `plan` is the workspace's current
 * plan (already known from the resolved Tenant doc); `portalId` is the Stripe portal-session
 * id when available. Empty/blank/non-string values are dropped so degraded calls never emit
 * a `plan: ""` or `portalId: ""` key.
 */
export function portalAuditMeta(
  plan?: string | null,
  portalId?: string | null
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (typeof plan === 'string') {
    const p = plan.trim();
    if (p) meta.plan = p;
  }
  if (typeof portalId === 'string') {
    const id = portalId.trim();
    if (id) meta.portalId = id;
  }
  return meta;
}
