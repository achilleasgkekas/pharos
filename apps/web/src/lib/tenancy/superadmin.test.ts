import { describe, it, expect, afterEach } from 'vitest';
import {
  normalizeEmail,
  parseSuperadminEmails,
  isSuperadminEmail,
  superadminAllowlist,
  superadminConfigured,
} from './superadmin';

// Only the PURE helpers are unit-tested. `requireSuperadmin` is the node-only DB gate and the
// route is SaaS-gated (404 when SAAS_MODE off); the allowlist/matching semantics are asserted
// here. env-reading helpers restore the original value after each case.

const ORIG = process.env.SAAS_SUPERADMIN_EMAILS;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SAAS_SUPERADMIN_EMAILS;
  else process.env.SAAS_SUPERADMIN_EMAILS = ORIG;
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  it('returns empty for non-strings', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(42)).toBe('');
    expect(normalizeEmail(null)).toBe('');
  });
});

describe('parseSuperadminEmails', () => {
  it('splits on commas, semicolons, and whitespace, normalizing + deduping', () => {
    expect(parseSuperadminEmails('A@x.com, b@y.com ; a@x.com\n c@z.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
    ]);
  });
  it('drops tokens without an @ so a stray word cannot whitelist everyone', () => {
    expect(parseSuperadminEmails('valid@x.com, garbage, *')).toEqual(['valid@x.com']);
  });
  it('returns empty for blank/garbage/non-string input', () => {
    expect(parseSuperadminEmails('')).toEqual([]);
    expect(parseSuperadminEmails('   ')).toEqual([]);
    expect(parseSuperadminEmails(undefined)).toEqual([]);
    expect(parseSuperadminEmails(123)).toEqual([]);
  });
});

describe('isSuperadminEmail', () => {
  const allow = ['ops@pharos.app', 'achilleas@pharos.app'];
  it('matches case-insensitively after normalization', () => {
    expect(isSuperadminEmail('  OPS@Pharos.APP ', allow)).toBe(true);
  });
  it('rejects non-members and blank emails', () => {
    expect(isSuperadminEmail('someone@else.com', allow)).toBe(false);
    expect(isSuperadminEmail('', allow)).toBe(false);
    expect(isSuperadminEmail(undefined, allow)).toBe(false);
    expect(isSuperadminEmail('ops@pharos.app', [])).toBe(false);
  });
});

describe('superadminAllowlist / superadminConfigured', () => {
  it('reads the env allowlist and reports configured when non-empty', () => {
    process.env.SAAS_SUPERADMIN_EMAILS = 'ops@pharos.app , boss@pharos.app';
    expect(superadminAllowlist()).toEqual(['ops@pharos.app', 'boss@pharos.app']);
    expect(superadminConfigured()).toBe(true);
  });
  it('reports not-configured when unset or blank', () => {
    delete process.env.SAAS_SUPERADMIN_EMAILS;
    expect(superadminAllowlist()).toEqual([]);
    expect(superadminConfigured()).toBe(false);
    process.env.SAAS_SUPERADMIN_EMAILS = '  ';
    expect(superadminConfigured()).toBe(false);
  });
});
