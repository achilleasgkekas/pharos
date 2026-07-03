// SaaS tenant resolver — turns an incoming request (host / custom domain / explicit
// hint) into a TenantContext, the single object every SaaS-aware code path reads to
// know "which tenant is this, and which data database do I talk to".
//
// Backward-compatibility contract (see SAAS_PROGRESS.md → Architecture):
//   - SAAS_MODE off  → ALWAYS returns DEFAULT_TENANT, with ZERO DB access. This is the
//     self-hosted single-user app: one implicit owner, the shared MONGO_URI database.
//     `dbNameFor(DEFAULT_TENANT)` is empty → "use the default connection unchanged".
//   - SAAS_MODE on   → resolves the Tenant from the control-plane registry by subdomain
//     (<slug>.ph-aros.com) or custom domain. Unknown host → null (caller decides: 404,
//     marketing site, signup, …). The tenant's data lives in its own db (`dbName`).
//
// This module is NODE-ONLY (it can touch Mongoose). Never import it from middleware /
// the edge runtime — for those, import the pure host parser from ./host directly (it has
// no imports at all).
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { saasMode } from './saasMode';
import { baseDomain, normalizeHost, parseTenantSlug } from './host';

// Re-export the pure host helpers so callers can reach everything tenancy-routing from
// one module when they're already node-side.
export { baseDomain, parseTenantSlug, normalizeHost } from './host';

export type TenantPlan = 'free' | 'shared' | 'dedicated';
export type TenantStatus = 'pending' | 'trialing' | 'active' | 'suspended' | 'canceled';

/**
 * Everything a request needs to know about the current tenant. `tenantId` is null only
 * for the implicit self-hosted default. `dbName` empty string ⇒ use the default
 * MONGO_URI connection with no `useDb` switch (self-hosted behaviour).
 */
export type TenantContext = {
  tenantId: string | null;
  slug: string;
  dbName: string;
  plan: TenantPlan;
  status: TenantStatus;
  /** True for the implicit single-user tenant (SAAS_MODE off). */
  isDefault: boolean;
  /**
   * True when the tenant brings its OWN AI provider key (BYO-key): their AI calls run on
   * that key, so they are not metered against the plan's AI volume (see
   * lib/billing/aiKeyPolicy.ts). Optional so legacy/synthetic contexts (and callers that
   * only need routing) can omit it — absent ⇒ platform key + normal metering.
   */
  byoKey?: boolean;
};

/**
 * The one implicit tenant of the self-hosted app. It maps to the default database (empty
 * dbName ⇒ no useDb switch), is always active, and never touches the registry. Frozen so
 * callers can't mutate the shared instance.
 */
export const DEFAULT_TENANT: TenantContext = Object.freeze({
  tenantId: null,
  slug: 'default',
  dbName: '',
  plan: 'dedicated', // self-hosted = every feature; entitlements resolve this to "all".
  status: 'active',
  isDefault: true,
  byoKey: false, // self-hosted uses its own AI config; metering is off for it anyway.
});

function toContext(t: TenantDoc): TenantContext {
  return {
    tenantId: String(t._id),
    slug: t.slug,
    dbName: t.dbName,
    plan: (t.plan as TenantPlan) ?? 'free',
    status: (t.status as TenantStatus) ?? 'trialing',
    isDefault: false,
    byoKey: Boolean(t.aiByoKey),
  };
}

export type ResolveInput = {
  /** The request Host header (subdomain routing). */
  host?: string | null;
  /** An explicit tenant slug (e.g. from a session claim) — takes priority over host. */
  slug?: string | null;
};

/**
 * Resolve the current tenant.
 *   - SAAS_MODE off → DEFAULT_TENANT immediately (no DB).
 *   - SAAS_MODE on  → look up the Tenant by explicit slug, then subdomain slug, then the
 *     full host as a custom domain. Returns null when nothing matches (caller handles it).
 * Never throws for a "not found"; it returns null. A DB/connection error still throws so
 * the caller can surface a 500 rather than silently treating it as "no tenant".
 */
export async function getTenantContext(input: ResolveInput = {}): Promise<TenantContext | null> {
  if (!saasMode()) return DEFAULT_TENANT;

  const host = input.host ?? null;
  const explicit = input.slug?.trim().toLowerCase() || null;
  const fromHost = parseTenantSlug(host);
  const slug = explicit || fromHost;
  const customDomain = normalizeHost(host);

  // Nothing to look up (apex/reserved host and no session slug) → no tenant.
  if (!slug && !customDomain) return null;

  await connectDB();

  if (slug) {
    const bySlug = (await Tenant.findOne({ slug }).lean()) as TenantDoc | null;
    if (bySlug) return toContext(bySlug);
  }
  // Fall back to custom-domain match (dedicated tier) when the host is not a base subdomain.
  if (customDomain && customDomain !== baseDomain()) {
    const byDomain = (await Tenant.findOne({ customDomain }).lean()) as TenantDoc | null;
    if (byDomain) return toContext(byDomain);
  }
  return null;
}

/**
 * The data database name to talk to for a given context. Empty string means "use the
 * default MONGO_URI connection as-is" (self-hosted). The per-tenant connection layer
 * (increment 3, lib/db useDb) consumes this. Kept here so the routing rule lives in one
 * place next to the resolver.
 */
export function dbNameFor(ctx: TenantContext): string {
  return ctx.isDefault ? '' : ctx.dbName;
}

/**
 * Control-plane query scope helper. Our data plane is database-per-tenant, so feature
 * queries are NOT scoped by a tenantId filter — isolation happens at the connection/db
 * level (dbNameFor + useDb). But CONTROL-PLANE collections (Membership, Usage, …) live in
 * one shared registry db and legitimately need a tenant filter. `scoped` merges that
 * filter defensively:
 *   Membership.find(scoped({ status: 'active' }, ctx))  // → { status, tenant: <id> }
 * For the default tenant (no tenantId) it returns the filter unchanged.
 */
export function scoped<T extends Record<string, unknown>>(filter: T, ctx: TenantContext): T {
  if (!ctx.tenantId) return filter;
  return { ...filter, tenant: ctx.tenantId };
}
