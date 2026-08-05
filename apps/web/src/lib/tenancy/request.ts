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
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTenantContext, DEFAULT_TENANT, type TenantContext } from './context';
import { parseTenantSlug } from './host';
import { saasMode } from './saasMode';
import { withTenant, currentTenant, hasTenantContext } from './current';
import { getCurrentAccount } from './accountSession';
import { accountTenants } from './saasApi';
import { workspaceStatusError } from './workspace';
import { tenantGateOutcome, needsAuthState, type TenantGateCode } from './requestGate';

// The header middleware forwards the request host under (edge-safe, no Mongo). We read it
// here node-side to derive the tenant slug / custom domain. Falls back to the standard host
// headers so direct route handlers (which see the real Host) also work.
export const TENANT_HOST_HEADER = 'x-tenant-host';

/**
 * Thrown when a SaaS feature request cannot be attributed to a tenant the caller may use.
 * `withRequestTenant` converts it into a redirect or a 404 (see ./requestGate); it reaches the
 * error boundary only if something calls `resolveRequestTenant` directly.
 */
export class TenantResolutionError extends Error {
  readonly code: TenantGateCode;
  /** Workspace lifecycle status, present only for `workspace_inactive` (drives the redirect). */
  readonly status?: string;
  constructor(code: TenantGateCode, message: string, status?: string) {
    super(message);
    this.name = 'TenantResolutionError';
    this.code = code;
    this.status = status;
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
 * MEMOISED per request (React cache): a server action may now resolve the tenant several times —
 * once per model it touches — and each resolution is two control-plane queries. Same request,
 * same host, same cookie, so the answer cannot differ within one render.
 *
 * Authz mirrors `resolveWorkspaceSession` (the /api/saas/* control-plane flow): the host
 * decides the tenant, the account's membership decides access.
 */
export const resolveRequestTenant = cache(async function resolveRequestTenant(): Promise<TenantContext> {
  if (!saasMode()) return DEFAULT_TENANT;

  const host = await requestHost();
  const ctx = await getTenantContext({ host });
  if (!ctx || ctx.isDefault || !ctx.tenantId) {
    // Two very different situations, and the visitor should not get the same answer for both:
    // a host that NAMES a workspace which does not exist is a 404, while a host that names no
    // workspace at all (the apex, `www`, an unpointed custom domain) means they are simply not
    // on a workspace yet and should be sent to their account.
    const named = parseTenantSlug(host) !== null;
    throw new TenantResolutionError(
      named ? 'unknown_workspace' : 'no_tenant',
      named ? 'No such workspace' : 'No tenant for this request host',
    );
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
    throw new TenantResolutionError('workspace_inactive', statusErr, ctx.status);
  }

  return ctx;
});

/**
 * `resolveRequestTenant()`, but resolution failure means "nothing to show" rather than "send
 * them somewhere". For background polls that run unconditionally wherever they're mounted —
 * `NotificationBell` etc. now render globally via SiteNav, including on hosts with no tenant
 * at all (app.ph-aros.com, the operator console) — `withRequestTenant`'s deny-by-redirect is
 * actively harmful: it silently navigates the visitor away from whatever page they're looking
 * at a few seconds after load, just because a background poll couldn't find a tenant. Confirmed
 * live (2026-08-05): NotificationBell's 60s poll of getNotifications() bounced /admin and
 * app.ph-aros.com/ to /account/workspace within moments of any page load.
 *
 * Unlike `softRequestTenant`, this DOES still enforce membership/status (real per-tenant data,
 * not just display settings) — a `not_a_member`/`workspace_inactive` failure here still means
 * "nothing to show" though, same as `no_tenant`, since the caller has nothing to act on either
 * way. Only resolveRequestTenant's own throw is caught here (a plain Error, not a Next redirect/
 * notFound control-flow signal — those only get thrown by `failTenantGate`, which this never
 * calls), so a genuine fault (DB down, bad config) still propagates.
 */
export async function resolveRequestTenantOrNull(): Promise<TenantContext | null> {
  try {
    return await resolveRequestTenant();
  } catch (err) {
    if (err instanceof TenantResolutionError) return null;
    throw err;
  }
}

/**
 * Best-effort tenant for READ-ONLY paths that must never redirect or 404.
 *
 * `withRequestTenant` is the right gate for anything that acts on data: it denies. But the root
 * layout reads app settings on EVERY page, including /account/login and the apex, where there is
 * no workspace and denying would take the whole site down. This answers "which workspace, if any"
 * and falls back to the default rather than throwing.
 *
 * Uses the ambient tenant when one is already established, so inside `withRequestTenant` it costs
 * nothing and cannot disagree with the gate that already ran. Deliberately does NOT check
 * membership: it is only ever used to pick which database to READ display settings from, and the
 * data plane's own gate still denies a non-member everything that matters.
 */
export const softRequestTenant = cache(async function softRequestTenant(): Promise<TenantContext> {
  if (!saasMode()) return DEFAULT_TENANT;
  if (hasTenantContext()) return currentTenant();
  try {
    const ctx = await getTenantContext({ host: await requestHost() });
    return ctx && !ctx.isDefault && ctx.tenantId ? ctx : DEFAULT_TENANT;
  } catch {
    return DEFAULT_TENANT;
  }
});

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
  let ctx: TenantContext;
  try {
    ctx = await resolveRequestTenant();
  } catch (err) {
    if (err instanceof TenantResolutionError) return failTenantGate(err);
    throw err; // a real fault (DB down, bad config) — that one SHOULD reach the error boundary.
  }
  return withTenant(ctx, fn);
}

/**
 * Turn a resolution failure into the response the visitor deserves, and never return.
 *
 * Before this, every one of these threw past the caller and Next rendered the 500 boundary — so
 * a logged-out visitor on a workspace subdomain, and someone who mistyped a subdomain, both got
 * "Something went wrong" on a server that was working perfectly. `redirect()` / `notFound()`
 * throw Next's own control-flow signals, which is why this returns `never`: callers must not
 * treat it as a value, and must not catch it (doing so would swallow the redirect).
 *
 * The account lookup here is token-only (no DB) and runs at most once, on a request that has
 * already failed — it decides between "sign in" and "pick a workspace", which is the difference
 * between a useful redirect and a loop.
 */
async function failTenantGate(err: TenantResolutionError): Promise<never> {
  const h = await headers();
  // Stamped by middleware.ts on every matched request; absent for direct route handlers, in
  // which case the login link simply carries no `next`.
  const path = h.get('x-pathname');
  // Read the session ONLY when it can change the answer (see needsAuthState): the 404 branch
  // must behave identically for a member and a stranger, and it costs nothing to prove that by
  // never looking.
  const authenticated = needsAuthState(err.code) ? Boolean(await getCurrentAccount()) : false;

  const outcome = tenantGateOutcome(err.code, { path, authenticated, status: err.status });
  if (outcome.kind === 'redirect') redirect(outcome.to);
  notFound();
}
