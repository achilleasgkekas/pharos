import { afterEach, describe, expect, it } from 'vitest';
import { cur, setCurrencySymbol } from '../money';
// Importing the binding registers the tenant-aware resolver into money.ts (side effect).
import './currencyBinding';
import { withTenant } from './current';
import { DEFAULT_TENANT, type TenantContext } from './context';

// These tests prove the process-global currency-symbol clobber (the deferred multi-tenant
// blocker) is fixed: under an established SaaS tenant, cur()/setCurrencySymbol isolate the
// symbol per tenant; the self-hosted / default path stays byte-for-byte the module var.
//
// Reset the module var after each case so ordering can't leak between assertions (the
// per-tenant map keys are unique per test tenant so they don't need resetting).
afterEach(() => {
  setCurrencySymbol('€');
});

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

describe('currency symbol — OSS / self-hosted (no tenant context)', () => {
  it('uses the module variable, unchanged, outside any withTenant', () => {
    // The entire self-hosted app: nothing establishes a tenant, so cur() reads the module var.
    setCurrencySymbol('$');
    expect(cur()).toBe('$');
    setCurrencySymbol('€');
    expect(cur()).toBe('€');
  });

  it('treats the frozen DEFAULT_TENANT identically to no context', () => {
    withTenant(DEFAULT_TENANT, () => {
      setCurrencySymbol('£');
      expect(cur()).toBe('£');
    });
    // The write went to the module var (default tenant → no per-tenant slot), so it persists.
    expect(cur()).toBe('£');
  });
});

describe('currency symbol — SaaS per-tenant isolation', () => {
  it('keeps each tenant on its own symbol', () => {
    withTenant(acme, () => setCurrencySymbol('$'));
    withTenant(globex, () => setCurrencySymbol('£'));

    expect(withTenant(acme, () => cur())).toBe('$');
    expect(withTenant(globex, () => cur())).toBe('£');
  });

  it('a tenant write does NOT clobber the default/module symbol', () => {
    setCurrencySymbol('€'); // default (module var)
    withTenant(acme, () => setCurrencySymbol('¥'));
    // Outside the tenant scope, the default symbol is untouched.
    expect(cur()).toBe('€');
    expect(withTenant(acme, () => cur())).toBe('¥');
  });

  it('isolates concurrent tenant requests rendering different currencies', async () => {
    // The exact race the module-global var lost: two overlapping requests, different symbols.
    const [a, b] = await Promise.all([
      withTenant(acme, async () => {
        setCurrencySymbol('$');
        await new Promise((r) => setTimeout(r, 5)); // yield so globex interleaves
        return cur();
      }),
      withTenant(globex, async () => {
        setCurrencySymbol('£');
        await new Promise((r) => setTimeout(r, 1));
        return cur();
      }),
    ]);
    expect(a).toBe('$'); // acme still reads its own symbol despite globex writing meanwhile
    expect(b).toBe('£');
  });

  it('falls back to the module symbol when a tenant has not set its own', () => {
    setCurrencySymbol('€');
    // A pristine tenant that no other test writes a symbol for → cur() falls back to the
    // module var, not to another tenant's symbol.
    const pristine: TenantContext = { ...acme, tenantId: '507f1f77bcf86cd799439099', slug: 'pristine' };
    withTenant(globex, () => setCurrencySymbol('$'));
    expect(withTenant(pristine, () => cur())).toBe('€');
  });
});
