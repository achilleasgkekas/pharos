import { describe, it, expect } from 'vitest';
import {
  isSafeTenantDbName,
  purgeExecuteEnabled,
  purgeMaxPerRun,
  TENANT_DB_PREFIX,
  DEFAULT_PURGE_MAX_PER_RUN,
} from './purgeExecute';
import { dbNameForSlug } from './provision';

// This module drops databases. Its pure guards are the only thing standing between a bad row and
// permanent data loss, so they are tested adversarially: every case below is a way the drop could
// be pointed somewhere it must never go.

describe('isSafeTenantDbName — the drop guard', () => {
  it('accepts exactly `tenant_<slug>` for the tenant being purged', () => {
    expect(isSafeTenantDbName('tenant_acme', 'acme')).toBe(true);
    expect(isSafeTenantDbName('tenant_acme-2', 'acme-2')).toBe(true);
    expect(isSafeTenantDbName('tenant_a1', 'a1')).toBe(true);
  });

  it('agrees with the function that actually names tenant databases', () => {
    // If provision.dbNameForSlug ever changes shape, this guard would start refusing every purge
    // (safe) or, worse, accepting a stale pattern. Pin them together.
    expect(dbNameForSlug('acme')).toBe(`${TENANT_DB_PREFIX}acme`);
    expect(isSafeTenantDbName(dbNameForSlug('acme'), 'acme')).toBe(true);
  });

  it("REFUSES a dbName that does not match its own tenant's slug", () => {
    // The attack and the accident are the same shape: a Tenant row whose dbName points at someone
    // else's data. Equality with the slug is what makes that unreachable.
    expect(isSafeTenantDbName('tenant_other', 'acme')).toBe(false);
    expect(isSafeTenantDbName('tenant_acme', 'other')).toBe(false);
  });

  it('REFUSES the system databases, whatever the slug claims', () => {
    for (const db of ['admin', 'local', 'config', 'test', 'ADMIN', 'Local']) {
      expect(isSafeTenantDbName(db, 'acme')).toBe(false);
    }
  });

  it('REFUSES anything without the tenant prefix — including the registry database', () => {
    expect(isSafeTenantDbName('pharos_registry', 'pharos_registry')).toBe(false);
    expect(isSafeTenantDbName('homepage', 'homepage')).toBe(false);
    expect(isSafeTenantDbName('acme', 'acme')).toBe(false);
  });

  it('REFUSES slugs with characters a slug can never contain', () => {
    for (const slug of ['../etc', 'a b', 'a.b', 'a$b', 'a/b', 'a\0b', 'Acme', '-lead', '']) {
      expect(isSafeTenantDbName(`${TENANT_DB_PREFIX}${slug}`, slug)).toBe(false);
    }
  });

  it('REFUSES blanks, whitespace and non-strings rather than coercing them', () => {
    expect(isSafeTenantDbName('', '')).toBe(false);
    expect(isSafeTenantDbName('   ', '   ')).toBe(false);
    expect(isSafeTenantDbName(null, 'acme')).toBe(false);
    expect(isSafeTenantDbName('tenant_acme', null)).toBe(false);
    expect(isSafeTenantDbName(undefined, undefined)).toBe(false);
    expect(isSafeTenantDbName(123 as unknown, 'acme')).toBe(false);
    expect(isSafeTenantDbName({ toString: () => 'tenant_acme' } as unknown, 'acme')).toBe(false);
  });

  it('REFUSES a name past Mongo\'s length limit', () => {
    const long = 'a'.repeat(60);
    expect(isSafeTenantDbName(`${TENANT_DB_PREFIX}${long}`, long)).toBe(false);
  });
});

describe('purgeExecuteEnabled — the second switch', () => {
  it('is OFF when unset, which is the default everywhere including self-hosted', () => {
    expect(purgeExecuteEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is ON only for an unambiguous 1/true', () => {
    expect(purgeExecuteEnabled({ SAAS_PURGE_EXECUTE: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(purgeExecuteEnabled({ SAAS_PURGE_EXECUTE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(purgeExecuteEnabled({ SAAS_PURGE_EXECUTE: ' TRUE ' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it('is OFF for anything that merely looks affirmative — a typo must not arm a deletion', () => {
    for (const v of ['yes', 'on', 'y', 'enabled', '2', '0', 'false', 'truthy', '']) {
      expect(purgeExecuteEnabled({ SAAS_PURGE_EXECUTE: v } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });
});

describe('purgeMaxPerRun — the blast-radius cap', () => {
  it('defaults when unset or garbage, rather than becoming unlimited', () => {
    expect(purgeMaxPerRun({} as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_PURGE_MAX_PER_RUN);
    expect(purgeMaxPerRun({ SAAS_PURGE_MAX_PER_RUN: 'lots' } as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_PURGE_MAX_PER_RUN);
    expect(purgeMaxPerRun({ SAAS_PURGE_MAX_PER_RUN: '-3' } as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_PURGE_MAX_PER_RUN);
  });

  it('honours an explicit override', () => {
    expect(purgeMaxPerRun({ SAAS_PURGE_MAX_PER_RUN: '12' } as unknown as NodeJS.ProcessEnv)).toBe(12);
    expect(purgeMaxPerRun({ SAAS_PURGE_MAX_PER_RUN: '1' } as unknown as NodeJS.ProcessEnv)).toBe(1);
  });

  it('honours 0 as a kill switch, so the cap can stop purges without a redeploy', () => {
    expect(purgeMaxPerRun({ SAAS_PURGE_MAX_PER_RUN: '0' } as unknown as NodeJS.ProcessEnv)).toBe(0);
  });
});
