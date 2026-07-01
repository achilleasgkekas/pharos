// PURE host → tenant-slug parsing. NO imports (not even saasMode) so this module is safe
// from ANY runtime — edge/middleware included — and unit-testable without path aliases or
// a DB. The Mongoose-touching resolver lives in context.ts and imports from here.

// Base domain for tenant subdomains: <slug>.<SAAS_BASE_DOMAIN>. Defaults to the decided
// production domain; override per environment (e.g. localhost, a staging domain).
export function baseDomain(): string {
  return (process.env.SAAS_BASE_DOMAIN || 'ph-aros.com').trim().toLowerCase();
}

// Subdomains that are NEVER a tenant slug — the apex site, app shell, api, and common
// infra labels. A host matching one of these resolves to "no tenant".
export const RESERVED_SLUGS = new Set([
  '',
  'www',
  'app',
  'api',
  'admin',
  'static',
  'assets',
  'cdn',
  'mail',
]);

/**
 * Parse a Host header into a tenant slug, or null. Strips a leading port and trailing dot
 * and normalises case. Returns the subdomain label when `host` is `<slug>.<baseDomain>`,
 * or null when the host is the apex, a reserved label, a nested subdomain, or not under
 * the base domain (a custom domain is resolved by the DB path in context.ts, not here).
 * Examples for base `ph-aros.com`:
 *   acme.ph-aros.com   → "acme"
 *   ph-aros.com        → null (apex)
 *   www.ph-aros.com    → null (reserved)
 *   a.b.ph-aros.com    → null (nested, not a flat slug)
 *   acme.example.org   → null (different domain — try custom-domain lookup)
 */
export function parseTenantSlug(host: string | null | undefined, base?: string): string | null {
  if (!host) return null;
  const h = host.split(':')[0].trim().toLowerCase().replace(/\.$/, ''); // drop port + trailing dot
  const b = (base || baseDomain()).replace(/\.$/, '');
  if (!h || !b) return null;
  if (h === b) return null; // apex → no tenant
  const suffix = '.' + b;
  if (!h.endsWith(suffix)) return null; // not under base domain
  const label = h.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null; // nested subdomain is not a flat slug
  if (RESERVED_SLUGS.has(label)) return null;
  return label;
}

/** Normalise a Host header to a bare lowercase hostname (no port/trailing dot), or null. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  return h || null;
}
