import { describe, it, expect } from 'vitest';
import { parseTenantSlug } from './host';

// Pure host → slug parsing only (no DB, no SAAS_MODE). getTenantContext/scoped are
// exercised once the connection layer lands; here we lock the routing rule that decides
// whether a host even names a tenant.
describe('parseTenantSlug', () => {
  const base = 'ph-aros.com';

  it('extracts a flat subdomain slug', () => {
    expect(parseTenantSlug('acme.ph-aros.com', base)).toBe('acme');
    expect(parseTenantSlug('acme-co.ph-aros.com', base)).toBe('acme-co');
  });

  it('normalises case and strips the port + trailing dot', () => {
    expect(parseTenantSlug('Acme.PH-Aros.com:3000', base)).toBe('acme');
    expect(parseTenantSlug('acme.ph-aros.com.', base)).toBe('acme');
  });

  it('returns null for the apex domain', () => {
    expect(parseTenantSlug('ph-aros.com', base)).toBeNull();
    expect(parseTenantSlug('ph-aros.com:443', base)).toBeNull();
  });

  it('returns null for reserved labels', () => {
    for (const r of ['www', 'app', 'api', 'admin', 'cdn', 'mail']) {
      expect(parseTenantSlug(`${r}.ph-aros.com`, base)).toBeNull();
    }
  });

  it('returns null for nested subdomains (not a flat slug)', () => {
    expect(parseTenantSlug('a.b.ph-aros.com', base)).toBeNull();
  });

  it('returns null for a different / custom domain', () => {
    expect(parseTenantSlug('acme.example.org', base)).toBeNull();
    expect(parseTenantSlug('dashboard.mycompany.io', base)).toBeNull();
  });

  it('returns null for empty / missing host', () => {
    expect(parseTenantSlug('', base)).toBeNull();
    expect(parseTenantSlug(null, base)).toBeNull();
    expect(parseTenantSlug(undefined, base)).toBeNull();
  });

  it('honours a custom base domain override', () => {
    expect(parseTenantSlug('acme.localhost', 'localhost')).toBe('acme');
    expect(parseTenantSlug('localhost', 'localhost')).toBeNull();
  });
});
