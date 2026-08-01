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
  parseAuditDate,
  parseAuditRange,
  dateInputValue,
  auditFiltersActive,
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
      actor: null,
      from: null,
      to: null,
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

  it('normalizes an actor email to lowercase and trims it', () => {
    // Account.email is stored lowercase+trimmed, so an operator pasting an address out of a mail
    // client (capitalised, with a trailing space) must still resolve to that account.
    expect(parseAdminAuditQuery(sp({ actor: '  Achilleas@Example.COM ' })).actor).toBe(
      'achilleas@example.com'
    );
  });

  it('treats a blank/whitespace actor as no filter', () => {
    expect(parseAdminAuditQuery(sp({ actor: '   ' })).actor).toBeNull();
    expect(parseAdminAuditQuery(sp({ actor: '' })).actor).toBeNull();
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

  it('scopes to one actor ID when given, and omits the clause otherwise', () => {
    expect(buildPlatformAuditFilter({ actorId: 'a1' })).toEqual({ actor: 'a1' });
    expect(buildPlatformAuditFilter({ actorId: null })).toEqual({});
    expect(buildPlatformAuditFilter({ actorId: undefined })).toEqual({});
    expect(buildPlatformAuditFilter({ actorId: '' })).toEqual({});
  });

  it('filters actor by ID, never by the email the operator typed', () => {
    // The bug this pins: AuditEvent.actor stores an account id. Passing the email through would
    // match zero rows and render as "this person did nothing" — the worst wrong answer in an
    // incident review. The email→id resolution belongs to listPlatformAudit, not here.
    const filter = buildPlatformAuditFilter({ actorId: 'a1' });
    expect(filter.actor).toBe('a1');
    expect(JSON.stringify(filter)).not.toContain('@');
  });

  it('ANDs the actor clause with tenant, action and window as distinct top-level keys', () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const filter = buildPlatformAuditFilter({
      tenantId: 't1',
      actorId: 'a1',
      action: 'member.added',
      from,
    });
    expect(filter).toEqual({
      tenant: 't1',
      actor: 'a1',
      action: 'member.added',
      createdAt: { $gte: from },
    });
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

// ---------------------------------------------------------------------------------------------
// Date window (`?from=`/`?to=`). The load-bearing behaviours, in order of how badly a regression
// would hurt an incident review:
//   1. A bare `to` day is INCLUSIVE of that whole day. Parsing it as midnight would drop every
//      event of the day the operator explicitly asked for, and the feed would read "nothing
//      happened" — the single most dangerous wrong answer this console can give.
//   2. Boundaries are UTC. Interpreting them locally would put the window out of step with the
//      ISO timestamps rendered in the very same table by the Athens offset.
//   3. The window and the keyset cursor are separate top-level clauses, so "Load more" stays
//      inside the window instead of paginating out of it.
// ---------------------------------------------------------------------------------------------

describe('parseAuditDate', () => {
  it('expands a bare day to the START of that day in UTC for the from edge', () => {
    expect(parseAuditDate('2026-07-01', 'start')?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('expands a bare day to the END of that day in UTC for the to edge', () => {
    // The bug this pins: `to=2026-07-15` parsed as midnight silently excludes the whole of the
    // 15th, i.e. exactly the day the operator asked to see.
    expect(parseAuditDate('2026-07-15', 'end')?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('honours a full ISO timestamp verbatim on both edges', () => {
    const iso = '2026-07-15T13:45:12.000Z';
    expect(parseAuditDate(iso, 'start')?.toISOString()).toBe(iso);
    expect(parseAuditDate(iso, 'end')?.toISOString()).toBe(iso);
  });

  it('treats blank, whitespace, and non-string input as no bound', () => {
    for (const raw of ['', '   ', null, undefined, 42, {}]) {
      expect(parseAuditDate(raw, 'start')).toBeNull();
    }
  });

  it('rejects impossible and unparseable dates instead of throwing', () => {
    // Same leniency as parseAuditAction/decodeActivityCursor: a stray query param widens the
    // view, it never 400s.
    for (const raw of ['2026-02-30', '2026-13-01', 'yesterday', '15/07/2026']) {
      expect(parseAuditDate(raw, 'start')).toBeNull();
      expect(parseAuditDate(raw, 'end')).toBeNull();
    }
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseAuditDate('  2026-07-01  ', 'start')?.toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    );
  });
});

describe('parseAuditRange', () => {
  const sp2 = (init: string) => new URLSearchParams(init);

  it('returns both bounds, each at its own edge of the day', () => {
    const { from, to } = parseAuditRange(sp2('from=2026-07-01&to=2026-07-15'));
    expect(from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('allows a one-sided window', () => {
    expect(parseAuditRange(sp2('from=2026-07-01')).to).toBeNull();
    expect(parseAuditRange(sp2('to=2026-07-01')).from).toBeNull();
  });

  it('covers a single day fully when from and to are the same day', () => {
    const { from, to } = parseAuditRange(sp2('from=2026-07-09&to=2026-07-09'));
    expect(from?.toISOString()).toBe('2026-07-09T00:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-07-09T23:59:59.999Z');
    expect(to!.getTime()).toBeGreaterThan(from!.getTime());
  });

  it('corrects an inverted window by re-parsing the RAW inputs, not by swapping Dates', () => {
    // Swapping the parsed Dates would give 07-01T23:59:59.999 .. 07-15T00:00:00 and quietly lose
    // nearly a day at each end; re-parsing keeps each edge's day-boundary meaning.
    const { from, to } = parseAuditRange(sp2('from=2026-07-15&to=2026-07-01'));
    expect(from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('drops only the invalid side of a half-broken window', () => {
    const { from, to } = parseAuditRange(sp2('from=nonsense&to=2026-07-15'));
    expect(from).toBeNull();
    expect(to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });

  it('is reachable through parseAdminAuditQuery', () => {
    const q = parseAdminAuditQuery(new URLSearchParams('from=2026-07-01&to=2026-07-15'));
    expect(q.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2026-07-15T23:59:59.999Z');
  });
});

describe('buildPlatformAuditFilter · date window', () => {
  const from = new Date('2026-07-01T00:00:00.000Z');
  const to = new Date('2026-07-15T23:59:59.999Z');

  it('adds no createdAt clause when the window is unbounded', () => {
    expect(buildPlatformAuditFilter({ from: null, to: null })).toEqual({});
  });

  it('emits a one-sided range for a one-sided window', () => {
    expect(buildPlatformAuditFilter({ from })).toEqual({ createdAt: { $gte: from } });
    expect(buildPlatformAuditFilter({ to })).toEqual({ createdAt: { $lte: to } });
  });

  it('emits an inclusive two-sided range', () => {
    expect(buildPlatformAuditFilter({ from, to })).toEqual({ createdAt: { $gte: from, $lte: to } });
  });

  it('keeps the window and the keyset cursor as separate top-level clauses (ANDed by Mongo)', () => {
    // If the range were folded into the cursor's $or, "Load more" would paginate straight out of
    // the window; keeping them apart is what makes page 2 of a filtered feed still filtered.
    const cursor = { createdAt: '2026-07-10T10:00:00.000Z', id: 'c'.repeat(24) };
    const filter = buildPlatformAuditFilter({ from, to, cursor, tenantId: 't1' });
    expect(filter.createdAt).toEqual({ $gte: from, $lte: to });
    expect(Array.isArray(filter.$or)).toBe(true);
    expect(filter.tenant).toBe('t1');
  });
});

describe('dateInputValue', () => {
  it('round-trips a parsed bound back to the YYYY-MM-DD an <input type="date"> accepts', () => {
    expect(dateInputValue(parseAuditDate('2026-07-01', 'start'))).toBe('2026-07-01');
  });

  it('keeps an end-of-day bound on its OWN day (no UTC rollover into the next)', () => {
    // 23:59:59.999Z must render as that day, otherwise the form would show a window one day wider
    // than the one actually applied every time the operator re-submits.
    expect(dateInputValue(parseAuditDate('2026-07-15', 'end'))).toBe('2026-07-15');
  });

  it('renders an absent or invalid bound as an empty field', () => {
    expect(dateInputValue(null)).toBe('');
    expect(dateInputValue(undefined)).toBe('');
    expect(dateInputValue(new Date('nope'))).toBe('');
  });
});

describe('auditFiltersActive', () => {
  const none = { action: null, tenant: null, actor: null, from: null, to: null };

  it('is false when nothing narrows the feed', () => {
    expect(auditFiltersActive(none)).toBe(false);
    // Callers predating the actor filter omit the field entirely; that must still read as "no
    // filters", not throw or count as active.
    expect(auditFiltersActive({ action: null, tenant: null, from: null, to: null })).toBe(false);
  });

  it('is true for any single active filter, including each window edge alone', () => {
    expect(auditFiltersActive({ ...none, action: 'member.added' })).toBe(true);
    expect(auditFiltersActive({ ...none, tenant: 'acme' })).toBe(true);
    expect(auditFiltersActive({ ...none, actor: 'a@example.com' })).toBe(true);
    expect(auditFiltersActive({ ...none, from: new Date('2026-07-01') })).toBe(true);
    expect(auditFiltersActive({ ...none, to: new Date('2026-07-15') })).toBe(true);
  });
});
