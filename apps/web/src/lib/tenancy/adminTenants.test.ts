import { describe, it, expect } from 'vitest';
import {
  parseAdminTenantQuery,
  buildTenantQueryFilter,
  summarizeTenant,
  buildTenantListing,
  TENANT_STATUSES,
  MAX_ADMIN_PAGE,
  DEFAULT_ADMIN_PAGE,
  type AdminTenantQuery,
} from './adminTenants';
import type { TenantDoc } from '@/models/Tenant';

// PURE helpers only. `listTenantsForAdmin` is the node-only registry reader and the route is
// superadmin-gated (404 when SAAS_MODE off / console not enabled).

function q(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe('parseAdminTenantQuery', () => {
  it('applies defaults for missing params', () => {
    const out = parseAdminTenantQuery(q({}));
    expect(out).toEqual({ limit: DEFAULT_ADMIN_PAGE, offset: 0, status: null, q: null });
  });
  it('clamps limit to 1..MAX and floors it', () => {
    expect(parseAdminTenantQuery(q({ limit: '999' })).limit).toBe(MAX_ADMIN_PAGE);
    expect(parseAdminTenantQuery(q({ limit: '25.9' })).limit).toBe(25);
    expect(parseAdminTenantQuery(q({ limit: '0' })).limit).toBe(DEFAULT_ADMIN_PAGE);
    expect(parseAdminTenantQuery(q({ limit: '-3' })).limit).toBe(DEFAULT_ADMIN_PAGE);
    expect(parseAdminTenantQuery(q({ limit: 'nope' })).limit).toBe(DEFAULT_ADMIN_PAGE);
  });
  it('floors offset and rejects negatives', () => {
    expect(parseAdminTenantQuery(q({ offset: '40' })).offset).toBe(40);
    expect(parseAdminTenantQuery(q({ offset: '5.7' })).offset).toBe(5);
    expect(parseAdminTenantQuery(q({ offset: '-1' })).offset).toBe(0);
    expect(parseAdminTenantQuery(q({ offset: 'x' })).offset).toBe(0);
  });
  it('accepts only a known status, else null', () => {
    expect(parseAdminTenantQuery(q({ status: 'ACTIVE' })).status).toBe('active');
    expect(parseAdminTenantQuery(q({ status: 'bogus' })).status).toBe(null);
    for (const s of TENANT_STATUSES) {
      expect(parseAdminTenantQuery(q({ status: s })).status).toBe(s);
    }
  });
  it('trims the search term, blank → null', () => {
    expect(parseAdminTenantQuery(q({ q: '  acme ' })).q).toBe('acme');
    expect(parseAdminTenantQuery(q({ q: '   ' })).q).toBe(null);
  });
});

describe('buildTenantQueryFilter', () => {
  it('is empty with no filters', () => {
    expect(buildTenantQueryFilter({ status: null, q: null })).toEqual({});
  });
  it('adds an exact status match', () => {
    expect(buildTenantQueryFilter({ status: 'suspended', q: null })).toEqual({ status: 'suspended' });
  });
  it('adds a case-insensitive $or search across slug/name/customDomain', () => {
    const f = buildTenantQueryFilter({ status: null, q: 'acme' }) as { $or: { [k: string]: RegExp }[] };
    expect(f.$or).toHaveLength(3);
    expect(f.$or[0].slug.test('ACME-corp')).toBe(true);
    expect(f.$or[1].name.test('The Acme Co')).toBe(true);
  });
  it('escapes regex metacharacters so the term matches literally', () => {
    const f = buildTenantQueryFilter({ status: null, q: 'a.b*c' }) as { $or: { [k: string]: RegExp }[] };
    expect(f.$or[0].slug.test('a.b*c')).toBe(true);
    expect(f.$or[0].slug.test('axbxxc')).toBe(false);
  });
});

describe('summarizeTenant', () => {
  const base = {
    _id: 'abc123',
    slug: 'acme',
    name: 'Acme Inc',
    plan: 'shared',
    status: 'active',
    tier: 'shared',
    customDomain: 'acme.example.com',
    billingCustomerId: 'cus_1',
    billingSubscriptionId: null,
    aiByoKey: true,
    trialEndsAt: new Date('2026-08-01T00:00:00.000Z'),
    erasureScheduledAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-05T00:00:00.000Z'),
  } as unknown as TenantDoc;

  it('projects display-safe fields, dates → ISO, and derives billingLinked', () => {
    expect(summarizeTenant(base)).toEqual({
      id: 'abc123',
      slug: 'acme',
      name: 'Acme Inc',
      plan: 'shared',
      status: 'active',
      tier: 'shared',
      customDomain: 'acme.example.com',
      trialEndsAt: '2026-08-01T00:00:00.000Z',
      erasureScheduledAt: null,
      billingLinked: true,
      aiByoKey: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    });
  });

  it('handles missing/null fields without throwing', () => {
    const bare = { _id: 'x1', slug: 'x', name: 'X' } as unknown as TenantDoc;
    const s = summarizeTenant(bare);
    expect(s.customDomain).toBe(null);
    expect(s.billingLinked).toBe(false);
    expect(s.aiByoKey).toBe(false);
    expect(s.trialEndsAt).toBe(null);
    expect(s.createdAt).toBe(null);
    expect(s.plan).toBe('');
  });

  it('does not leak secret-ish fields (no aiKey / billing ids verbatim)', () => {
    const s = summarizeTenant(base) as Record<string, unknown>;
    expect(s).not.toHaveProperty('aiKey');
    expect(s).not.toHaveProperty('billingCustomerId');
    expect(s).not.toHaveProperty('billingSubscriptionId');
  });
});

describe('buildTenantListing', () => {
  const query: AdminTenantQuery = { limit: 50, offset: 0, status: 'active', q: 'ac' };
  const gen = new Date('2026-07-07T09:00:00.000Z');

  it('emits a stable envelope with derived count and passed-through paging/filter', () => {
    const summaries = [
      { id: '1', slug: 'a' } as never,
      { id: '2', slug: 'b' } as never,
    ];
    const out = buildTenantListing(summaries, { total: 7, query, generatedAt: gen });
    expect(out.format).toBe('pharos.admin-tenant-listing');
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe('2026-07-07T09:00:00.000Z');
    expect(out.total).toBe(7);
    expect(out.count).toBe(2);
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(0);
    expect(out.filter).toEqual({ status: 'active', q: 'ac' });
    expect(out.tenants).toHaveLength(2);
  });

  it('coerces an invalid generatedAt to epoch and clamps a bad total', () => {
    const out = buildTenantListing([], {
      total: -5,
      query,
      generatedAt: new Date('nope'),
    });
    expect(out.generatedAt).toBe(new Date(0).toISOString());
    expect(out.total).toBe(0);
    expect(out.count).toBe(0);
  });
});
