import { describe, it, expect } from 'vitest';
import { withTenant, currentTenant, hasTenantContext } from './current';
import { DEFAULT_TENANT, type TenantContext } from './context';

// A synthetic non-default tenant to prove the store carries the exact object through the
// async subtree (identity check), and that nesting/isolation behave as documented.
const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

const globex: TenantContext = {
  tenantId: '507f1f77bcf86cd799439012',
  slug: 'globex',
  dbName: 'tenant_globex',
  plan: 'dedicated',
  status: 'active',
  isDefault: false,
};

describe('currentTenant / hasTenantContext (no context established)', () => {
  it('returns the frozen DEFAULT_TENANT when nothing ran withTenant (self-hosted / OSS path)', () => {
    // This is the ENTIRE self-hosted app: no SaaS entrypoint ever calls withTenant, so the
    // ambient tenant is the default and metering/quotas short-circuit to unlimited.
    expect(currentTenant()).toBe(DEFAULT_TENANT);
    expect(currentTenant().isDefault).toBe(true);
  });

  it('reports no explicit context outside withTenant', () => {
    expect(hasTenantContext()).toBe(false);
  });
});

describe('withTenant', () => {
  it('makes currentTenant return the exact ctx inside the callback', () => {
    withTenant(acme, () => {
      expect(currentTenant()).toBe(acme);
      expect(hasTenantContext()).toBe(true);
    });
  });

  it('restores the default context after the callback returns', () => {
    withTenant(acme, () => currentTenant());
    expect(currentTenant()).toBe(DEFAULT_TENANT);
    expect(hasTenantContext()).toBe(false);
  });

  it('passes the callback return value straight through', () => {
    const slug = withTenant(acme, () => currentTenant().slug);
    expect(slug).toBe('acme');
  });

  it('supports nesting: inner overrides, then the outer value is restored', () => {
    withTenant(acme, () => {
      expect(currentTenant()).toBe(acme);
      withTenant(globex, () => {
        expect(currentTenant()).toBe(globex);
      });
      expect(currentTenant()).toBe(acme);
    });
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it('carries the tenant across async boundaries within the same call tree', async () => {
    await withTenant(acme, async () => {
      // A microtask/await hop does NOT lose the context (the whole point of AsyncLocalStorage).
      await Promise.resolve();
      expect(currentTenant()).toBe(acme);
      await new Promise((r) => setTimeout(r, 0));
      expect(currentTenant()).toBe(acme);
    });
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it('isolates concurrent async subtrees from each other', async () => {
    // Two overlapping withTenant scopes must not bleed into one another — this is what
    // keeps concurrent SaaS requests reading their own tenant.
    const results = await Promise.all([
      withTenant(acme, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentTenant().slug;
      }),
      withTenant(globex, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return currentTenant().slug;
      }),
    ]);
    expect(results).toEqual(['acme', 'globex']);
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it('propagates thrown errors while still unwinding the store', () => {
    expect(() =>
      withTenant(acme, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // After an exception the ambient context must be back to default (no leak).
    expect(currentTenant()).toBe(DEFAULT_TENANT);
    expect(hasTenantContext()).toBe(false);
  });
});
