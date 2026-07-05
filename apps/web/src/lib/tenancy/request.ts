// Request-scoped tenant establishment for the DATA PLANE (feature server actions + feature
// route handlers). This is the piece that closes the last SaaS wiring gate: it resolves the
// tenant for an incoming feature request and runs the work inside `withTenant(ctx)`, so that
//   - `currentModel()` / `tenantModel` talk to the tenant's database, and
//   - `assertAiQuota()` / `meterAiResult()` meter against the tenant's plan.
//
// NODE-ONLY (reads next/headers + touches Mongoose via the resolver). Never import from the
// edge/middleware — middleware only stamps the host header (see middleware.ts).
//
// OSS PARITY (critical): when SAAS_MODE is off, `resolveRequestTenant()` short-circuits to the
// frozen DEFAULT_TENANT with ZERO DB access and ZERO header/cookie reads that matter, and
// `withTenant(DEFAULT_TENANT, fn)` is a no-op wrapper (currentTenant already defaults to it).
// So the self-hosted app is byte-for-byte unchanged: same default connection, no metering.
import { headers } from 'next/headers';
import { getTenantContext, DEFAULT_TENANT, type TenantContext } from './context';
import { saasMode } from './saasMode';
import { withTenant } from './current';
import { getCurrentAccount } from './accountSession';
import { accountTenants } from './saasApi';
import { workspaceStatusError } from './workspace';

// The header middleware forwards the request host under (edge-safe, no Mongo). We read it
// here node-side to derive the tenant slug / custom domain. Falls back to the standard host
// headers so direct route handlers (which see the real Host) also work.
export const TENANT_HOST_HEADER = 'x-tenant-host';

/** Thrown when a SaaS feature request cannot be attributed to a tenant the caller may use. */
export class TenantResolutionError extends Error {
  readonly code: 'no_tenant' | 'not_authenticated' | 'not_a_member' | 'workspace_inactive';
  constructor(code: TenantResolutionError['code'], message: string) {
    super(message);
    this.name = 'TenantResolutionError';
    this.code = code;
  }
}

async function requestHost(): Promise<string | null> {
  const h = await headers();
  return (
    h.get(TENANT_HOST_HEADER) ||
    h.get('x-forwarded-host') ||
    h.get('host') ||
    null
  );
}

/**
 * Resolve the tenant for the CURRENT feature request and verify the logged-in account may
 * act inside it.
 *
 *   - SAAS_MODE off → DEFAULT_TENANT immediately (no header/cookie/DB work of consequence).
 *   - SAAS_MODE on  → derive the tenant from the request host (subdomain / custom domain),
 *     require an authenticated Account, require an ACTIVE membership in that tenant, and
 *     enforce the tenant's lifecycle status. Throws `TenantResolutionError` otherwise so the
 *     caller can surface a clean error instead of silently reading the wrong database.
 *
 * Authz mirrors `resolveWorkspaceSession` (the /api/saas/* control-plane flow): the host
 * decides the tenant, the account's membership decides access.
 */
export async function resolveRequestTenant(): Promise<TenantContext> {
  if (!saasMode()) return DEFAULT_TENANT;

  const host = await requestHost();
  const ctx = await getTenantContext({ host });
  if (!ctx || ctx.isDefault || !ctx.tenantId) {
    throw new TenantResolutionError('no_tenant', 'No tenant for this request host');
  }

  // The host names the tenant; the authenticated account must belong to it.
  const account = await getCurrentAccount();
  if (!account) {
    throw new TenantResolutionError('not_authenticated', 'Not authenticated');
  }
  const tenants = await accountTenants(account.sub);
  const member = tenants.find((t) => t.tenantId === ctx.tenantId);
  if (!member) {
    throw new TenantResolutionError('not_a_member', 'Not a member of this workspace');
  }

  const statusErr = workspaceStatusError(ctx.status);
  if (statusErr) {
    throw new TenantResolutionError('workspace_inactive', statusErr);
  }

  return ctx;
}

/**
 * Run a feature action/handler body inside the resolved tenant context. This is the ONE
 * wrapper feature server actions opt into:
 *
 *   export async function getReceipts() {
 *     return withRequestTenant(async () => { ... currentModel(Receipt).find() ... });
 *   }
 *
 * In self-hosted mode the wrapper resolves to DEFAULT_TENANT and `withTenant` leaves the
 * ambient store empty-equivalent, so `currentModel` returns the default-connection model and
 * metering stays off — identical to today.
 */
export async function withRequestTenant<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = await resolveRequestTenant();
  return withTenant(ctx, fn);
}
