import { describe, it, expect } from 'vitest';
import {
  buildAccountExport,
  accountExportFilename,
  type ExportAccountInput,
  type ExportMembershipInput,
} from './accountExport';

// Only the PURE assembler is unit-tested. The GET route is SaaS-gated (404 when SAAS_MODE off)
// and does node-only DB reads; its output shape + non-secret guarantees are asserted here.

const baseAccount: ExportAccountInput = {
  _id: 'acc123',
  email: 'user@example.com',
  name: 'Achilleas',
  emailVerified: true,
  lastLoginAt: new Date('2026-07-01T10:00:00.000Z'),
  createdAt: new Date('2026-06-01T08:00:00.000Z'),
  updatedAt: new Date('2026-07-05T09:00:00.000Z'),
};

const gen = new Date('2026-07-06T12:00:00.000Z');

describe('buildAccountExport', () => {
  it('projects the account profile as ISO strings with a stable envelope', () => {
    const out = buildAccountExport(baseAccount, [], gen);
    expect(out.format).toBe('pharos.account-export');
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe('2026-07-06T12:00:00.000Z');
    expect(out.notice).toMatch(/GDPR/);
    expect(out.account).toEqual({
      id: 'acc123',
      email: 'user@example.com',
      name: 'Achilleas',
      emailVerified: true,
      lastLoginAt: '2026-07-01T10:00:00.000Z',
      createdAt: '2026-06-01T08:00:00.000Z',
      updatedAt: '2026-07-05T09:00:00.000Z',
    });
    expect(out.memberships).toEqual([]);
  });

  it('never leaks a secret column even if one sneaks into the input', () => {
    // The assembler only reads whitelisted fields, so an unexpected secret is dropped by construction.
    const tainted = { ...baseAccount, passwordHash: 'scrypt$deadbeef', resetTokenHash: 'zzz' } as ExportAccountInput;
    const out = buildAccountExport(tainted, [], gen);
    const json = JSON.stringify(out);
    expect(json).not.toContain('scrypt$deadbeef');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('resetTokenHash');
  });

  it('joins each membership to its tenant display fields', () => {
    const memberships: ExportMembershipInput[] = [
      {
        role: 'owner',
        status: 'active',
        createdAt: new Date('2026-06-02T00:00:00.000Z'),
        tenant: { slug: 'acme', name: 'Acme Inc', plan: 'shared', status: 'active' },
      },
    ];
    const out = buildAccountExport(baseAccount, memberships, gen);
    expect(out.memberships).toEqual([
      {
        tenantSlug: 'acme',
        tenantName: 'Acme Inc',
        plan: 'shared',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
  });

  it('skips a membership whose tenant could not be resolved', () => {
    const memberships: ExportMembershipInput[] = [
      { role: 'member', status: 'active', tenant: null },
      { role: 'admin', status: 'active', tenant: { slug: 'kept', name: 'Kept' } },
    ];
    const out = buildAccountExport(baseAccount, memberships, gen);
    expect(out.memberships).toHaveLength(1);
    expect(out.memberships[0].tenantSlug).toBe('kept');
  });

  it('falls back tenantName to slug and tolerates missing optional fields', () => {
    const out = buildAccountExport(
      { _id: 'x' },
      [{ tenant: { slug: 'only-slug' } }],
      gen
    );
    expect(out.account.email).toBe('');
    expect(out.account.name).toBe('');
    expect(out.account.emailVerified).toBe(false);
    expect(out.account.lastLoginAt).toBeNull();
    expect(out.memberships[0]).toEqual({
      tenantSlug: 'only-slug',
      tenantName: 'only-slug',
      plan: '',
      role: '',
      status: '',
      joinedAt: null,
    });
  });

  it('coerces invalid/blank dates to null', () => {
    const out = buildAccountExport(
      { ...baseAccount, lastLoginAt: 'not-a-date', createdAt: null },
      [{ tenant: { slug: 's', name: 'S' }, createdAt: 'nope' }],
      gen
    );
    expect(out.account.lastLoginAt).toBeNull();
    expect(out.account.createdAt).toBeNull();
    expect(out.memberships[0].joinedAt).toBeNull();
  });
});

describe('accountExportFilename', () => {
  it('builds a safe filename from a hex id', () => {
    expect(accountExportFilename('64af0b2c9e1a2b3c4d5e6f70')).toBe(
      'pharos-account-64af0b2c9e1a2b3c4d5e6f70.json'
    );
  });
  it('strips unsafe characters and never produces an empty stem', () => {
    expect(accountExportFilename('../../etc/passwd')).toBe('pharos-account-etcpasswd.json');
    expect(accountExportFilename('!!!')).toBe('pharos-account-account.json');
  });
});
