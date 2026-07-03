// PURE helper for the `billing.checkout_started` audit event. No imports, no DB, no env —
// fully unit-testable and safe to call from anywhere. Its only job is to build a
// secret-free `meta` object for the audit trail: it whitelists exactly the two fields worth
// recording (the target plan + the Stripe checkout-session id) and NEVER carries the hosted
// checkout URL, customer email, or any Stripe key/secret. The checkout id is a correlation
// handle (`cs_...`), not a credential — logging it lets an Activity panel line a started
// checkout up against the resulting webhook event.

/**
 * Build the audit `meta` for a started checkout. `plan` is already validated by the route
 * (`checkoutablePlan`); `checkoutId` is the Stripe session id when available. Empty/blank/
 * non-string ids are dropped so legacy or degraded calls never emit a `checkoutId: ""` key.
 */
export function checkoutAuditMeta(
  plan: string,
  checkoutId?: string | null
): Record<string, unknown> {
  const meta: Record<string, unknown> = { plan };
  if (typeof checkoutId === 'string') {
    const id = checkoutId.trim();
    if (id) meta.checkoutId = id;
  }
  return meta;
}
