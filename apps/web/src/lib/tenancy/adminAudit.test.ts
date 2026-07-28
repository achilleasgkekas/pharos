// Unit tests for the PURE half of the platform-wide audit reader (lib/tenancy/adminAudit): query
// parsing, filter shape, id collection, and row projection. `listPlatformAudit` (the one impure
// export) is not exercised here — it is a thin composition of these plus two batched Mongo reads.
//
// What these pin down, in order of how badly a regression would hurt:
//   1. The filter has NO tenant clause unless one is asked for. This IS the cross-tenant read; a
//      stray default scope would silently turn the platform feed into a one-workspace feed and
//      still look like a working page.
//   2. `limit` is clamped. The audit collection is append-only and unbounded, so a hand-edited
//      `?limit=` must not be able to pull it all.
//   3. Row projection delegates to auditView, so no field the workspace-scoped surface withholds
//      can appear here — the operator console must not become a wider leak than the tenant one.
import { describe, it, expect } from 'vitest';
import {
  parseAdminAuditQuery,
  buildPlatformAuditFilter,
  collectTenantIds,
  platformAuditEvent,
  MAX_PLATFORM_AUDIT_PAGE,
  DEFAULT_PLATFORM_AUDIT_PAGE,
} from './adminAudit';

const sp = (init?: string | Record<string, string>) => new URLSearchParams(init as never);

describe('parseAdminAuditQuery', () => {
  it('defaults every field on an empty query string', () => {
    const q = parseAdminAuditQuery(sp());
    expect(q).toEqual({
      limit: DEFAULT_PLATFORM_AUDIT_PAGE,
      action: null,
      tenant: null,
      cursor: null,
    });
  });

  it('clamps limit to the maximum page size', () => {
    // The guard against pulling an unbounded append-only collection in one request.
    expect(parseAdminAuditQuery(sp({ limit: '99999' })).limit).toBe(MAX_PLATFORM_AUDIT_PAGE);
    expect(parseAdminAuditQuery(sp({ limit: String(MAX_PLATFORM_AUDIT_PAGE) })).limit).toBe(
      MAX_PLATFORM_AUDIT_PAGE
    );
  });

  it('falls back to the default limit for junk, zero, and negative values', () => {
    for (const raw of ['0', '-5', 'abc', '', 'NaN', 'Infinity']) {
      expect(parseAdminAuditQuery(sp({ limit: raw })).limit).toBe(DEFAULT_PLATFORM_AUDIT_PAGE);
    }
  });

  it('floors a fractional limit instead of passing it to .limit()', () => {
    expect(parseAdminAuditQuery(sp({ limit: '7.9' })).limit).toBe(7);
  });

  it('keeps a known action verb and drops an unknown one', () => {
    expect(parseAdminAuditQuery(sp({ action: 'member.removed' })).action).toBe('member.removed');
    // Lenient by design: a stray/tampered param shows everything rather than erroring.
    expect(parseAdminAuditQuery(sp({ action: 'member.nuked' })).action).toBeNull();
    expect(parseAdminAuditQuery(sp({ action: '' })).action).toBeNull();
  });

  it('normalizes a tenant slug to lowercase and trims it', () => {
    // Tenant.slug is stored lowercase, so an operator pasting "Acme " must still match.
    expect(parseAdminAuditQuery(sp({ tenant: '  ACME-Co ' })).tenant).toBe('acme-co');
  });

  it('treats a blank/whitespace tenant as no filter', () => {
    expect(parseAdminAuditQuery(sp({ tenant: '   ' })).tenant).toBeNull();
    expect(parseAdminAuditQuery(sp({ tenant: '' })).tenant).toBeNull();
  });

  it('decodes a well-formed before cursor', () => {
    const iso = '2026-07-28T10:00:00.000Z';
    const id = 'a'.repeat(24);
    expect(parseAdminAuditQuery(sp({ before: `${iso}~${id}` })).cursor).toEqual({
      createdAt: iso,
      id,
    });
  });

  it('treats a malformed or tampered cursor as the first page', () => {
    // A non-ObjectId id must never reach the database as part of a query filter.
    for (const raw of ['garbage', '2026-07-28T10:00:00.000Z~notanid', '~', 'nodate~' + 'a'.repeat(24)]) {
      expect(parseAdminAuditQuery(sp({ before: raw })).cursor).toBeNull();
    }
  });

  it('parses all filters together', () => {
    const q = parseAdminAuditQuery(
      sp({ tenant: 'Acme', action: 'plan.changed', limit: '10', before: `2026-07-28T00:00:00.000Z~${'b'.repeat(24)}` })
    );
    expect(q.tenant).toBe('acme');
    expect(q.action).toBe('plan.changed');
    expect(q.limit).toBe(10);
    expect(q.cursor?.id).toBe('b'.repeat(24));
  });
});

describe('buildPlatformAuditFilter', () => {
  it('is EMPTY with no inputs — the cross-tenant read is unscoped by design', () => {
    // The single most load-bearing assertion in this file: an accidental default tenant clause
    // would turn the platform feed into a silently-partial one-workspace feed.
    expect(buildPlatformAuditFilter({})).toEqual({});
  });

  it('omits the tenant clause for null/undefined/empty tenant ids', () => {
    expect(buildPlatformAuditFilter({ tenantId: null })).toEqual({});
    expect(buildPlatformAuditFilter({ tenantId: undefined })).toEqual({});
    expect(buildPlatformAuditFilter({ tenantId: '' })).toEqual({});
  });

  it('scopes to one tenant when an id is given', () => {
    expect(buildPlatformAuditFilter({ tenantId: 't1' })).toEqual({ tenant: 't1' });
  });

  it('adds the action clause only when an action is given', () => {
    expect(buildPlatformAuditFilter({ action: 'invite.sent' })).toEqual({ action: 'invite.sent' });
    expect(buildPlatformAuditFilter({ action: null })).toEqual({});
  });

  it('spreads the keyset cursor fragment alongside the other clauses', () => {
    const cursor = { createdAt: '2026-07-28T10:00:00.000Z', id: 'c'.repeat(24) };
    const filter = buildPlatformAuditFilter({ tenantId: 't1', action: 'plan.changed', cursor });
    expect(filter.tenant).toBe('t1');
    expect(filter.action).toBe('plan.changed');
    // $or (not a bare createdAt $lt) is what keeps pagination correct across same-millisecond ties.
    expect(Array.isArray(filter.$or)).toBe(true);
    expect((filter.$or as unknown[]).length).toBe(2);
  });

  it('returns a fresh object each call (no shared mutable filter)', () => {
    const a = buildPlatformAuditFilter({ tenantId: 't1' });
    const b = buildPlatformAuditFilter({});
    expect(a).not.toBe(b);
    expect(b).toEqual({});
  });
});

describe('collectTenantIds', () => {
  it('returns distinct stringified ids preserving first-seen order', () => {
    const ids = collectTenantIds([
      { tenant: 'b' },
      { tenant: 'a' },
      { tenant: 'b' },
      { tenant: { toString: () => 'a' } },
    ]);
    expect(ids).toEqual(['b', 'a']);
  });

  it('skips null/undefined tenants and handles an empty batch', () => {
    expect(collectTenantIds([{ tenant: null }, { tenant: undefined }, {}])).toEqual([]);
    expect(collectTenantIds([])).toEqual([]);
  });

  it('stringifies ObjectId-like values so the $in lookup matches', () => {
    const oid = { toString: () => '507f1f77bcf86cd799439011' };
    expect(collectTenantIds([{ tenant: oid }])).toEqual(['507f1f77bcf86cd799439011']);
  });
});

describe('platformAuditEvent', () => {
  const base = {
    _id: 'e1',
    tenant: 't1',
    action: 'member.removed',
    actor: 'a1',
    target: 'someone@example.com',
    meta: { role: 'admin' },
    createdAt: new Date('2026-07-28T10:00:00.000Z'),
  };

  it('projects the audit view fields plus workspace attribution', () => {
    const row = platformAuditEvent(base, 'op@pharos.dev', 'Op', { slug: 'acme', name: 'Acme Co' });
    expect(row.id).toBe('e1');
    expect(row.action).toBe('member.removed');
    expect(row.actorEmail).toBe('op@pharos.dev');
    expect(row.actorName).toBe('Op');
    expect(row.target).toBe('someone@example.com');
    expect(row.meta).toEqual({ role: 'admin' });
    expect(row.createdAt).toBe('2026-07-28T10:00:00.000Z');
    expect(row.workspaceSlug).toBe('acme');
    expect(row.workspaceName).toBe('Acme Co');
  });

  it('never exposes a field auditView withholds — including the raw tenant id', () => {
    // The operator console must not be a wider leak than the tenant-facing surface. auditView is
    // a whitelist, and the tenant id (an internal registry key) is deliberately not in the output:
    // the workspace is identified by slug/name instead.
    const row = platformAuditEvent({ ...base, tokenHash: 'SECRET' } as never, null, null, null);
    expect(Object.keys(row).sort()).toEqual(
      [
        'action',
        'actor',
        'actorEmail',
        'actorName',
        'createdAt',
        'id',
        'meta',
        'target',
        'workspaceName',
        'workspaceSlug',
      ].sort()
    );
    expect(JSON.stringify(row)).not.toContain('SECRET');
  });

  it('re-redacts secret-looking meta keys on the way out', () => {
    // Defence in depth: a legacy row written before the recorder redacted must still be scrubbed.
    const row = platformAuditEvent(
      { ...base, meta: { role: 'admin', resetToken: 'leak-me' } },
      null,
      null,
      null
    );
    expect(row.meta).toEqual({ role: 'admin' });
  });

  it('nulls both workspace fields when the tenant row is gone', () => {
    // Expected, not a bug: the append-only trail outlives the workspaces it describes.
    const row = platformAuditEvent(base, null, null, null);
    expect(row.workspaceSlug).toBeNull();
    expect(row.workspaceName).toBeNull();
  });

  it('treats blank/whitespace slug and name as absent', () => {
    const row = platformAuditEvent(base, null, null, { slug: '  ', name: '' });
    expect(row.workspaceSlug).toBeNull();
    expect(row.workspaceName).toBeNull();
  });

  it('keeps the slug when only the display name is missing', () => {
    const row = platformAuditEvent(base, null, null, { slug: 'acme', name: null });
    expect(row.workspaceSlug).toBe('acme');
    expect(row.workspaceName).toBeNull();
  });

  it('trims stored whitespace around slug and name', () => {
    const row = platformAuditEvent(base, null, null, { slug: ' acme ', name: ' Acme Co ' });
    expect(row.workspaceSlug).toBe('acme');
    expect(row.workspaceName).toBe('Acme Co');
  });

  it('defaults actor identity to null for system-originated events', () => {
    const row = platformAuditEvent({ ...base, actor: null }, null, null, { slug: 'acme' });
    expect(row.actor).toBeNull();
    expect(row.actorEmail).toBeNull();
    expect(row.actorName).toBeNull();
  });
});
