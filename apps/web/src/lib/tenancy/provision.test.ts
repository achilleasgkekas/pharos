import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `provision.ts` is the ONLY write-path module in the SaaS control plane with no test
// execution: it mints the Tenant doc + the owner Membership for every signup. Both signup
// routes mock `provisionTenant`, so until now nothing ran the slug minting, the collision
// loop, the db naming, or the two inserts. A bug here does not surface as a failing request,
// it surfaces as a workspace that exists with the wrong slug / wrong db / no owner.
//
// Mocked only at the node-only seams (connectDB, the two Mongoose models). The two pure
// collaborators run FOR REAL — `RESERVED_SLUGS` (./host) and `trialEndFrom`
// (@/lib/billing/trial) — so the reserved-label guard and the trial stamp are pinned as
// wired, not as echoed.
//
// The Tenant.create fixture deliberately DIVERGES from the values passed in (it returns a
// different slug/name/plan/status) so that every "what does the return value read from"
// assertion is load-bearing: the result must echo the PERSISTED doc, not the local vars.

const { connectDBMock, tenantExistsMock, tenantCreateMock, membershipCreateMock } = vi.hoisted(
  () => ({
    connectDBMock: vi.fn(async () => {}),
    tenantExistsMock: vi.fn(async (_filter: Record<string, unknown>) => null as unknown),
    tenantCreateMock: vi.fn(async (_doc: Record<string, unknown>) => ({}) as Record<string, unknown>),
    membershipCreateMock: vi.fn(
      async (_doc: Record<string, unknown>) => ({}) as Record<string, unknown>,
    ),
  }),
);

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { exists: tenantExistsMock, create: tenantCreateMock } }));
vi.mock('@/models/Membership', () => ({ Membership: { create: membershipCreateMock } }));

import { slugify, uniqueTenantSlug, dbNameForSlug, provisionTenant } from './provision';
import { DEFAULT_TRIAL_DAYS } from '@/lib/billing/trial';

/** Tenant doc as Mongoose returns it — deliberately NOT the values handed to create(). */
function createdTenant(over: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'tenant-oid' },
    slug: 'persisted-slug',
    name: 'Persisted Name',
    dbName: 'tenant_persisted-slug',
    plan: 'free',
    status: 'trialing',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantExistsMock.mockResolvedValue(null); // nothing taken by default
  tenantCreateMock.mockResolvedValue(createdTenant());
  membershipCreateMock.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('slugify', () => {
  it('lowercases and keeps an already-safe label untouched', () => {
    expect(slugify('acme')).toBe('acme');
    expect(slugify('ACME')).toBe('acme');
    expect(slugify('Acme42')).toBe('acme42');
  });

  it('collapses ANY run of non-alphanumerics into a single hyphen', () => {
    // The subdomain must stay a valid DNS label: no double hyphens, no spaces, no dots.
    expect(slugify('Acme  Corp')).toBe('acme-corp');
    expect(slugify('acme...corp')).toBe('acme-corp');
    expect(slugify('acme_/&corp')).toBe('acme-corp');
    expect(slugify('a - - b')).toBe('a-b');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  acme  ')).toBe('acme');
    expect(slugify('---acme---')).toBe('acme');
    expect(slugify('!acme!')).toBe('acme');
  });

  it('caps the label at 40 characters', () => {
    const out = slugify('a'.repeat(80));
    expect(out).toHaveLength(40);
    expect(out).toBe('a'.repeat(40));
  });

  it('trims a hyphen that the 40-char slice leaves dangling', () => {
    // Without the second trim this would end in '-', which is an invalid DNS label.
    const out = slugify(`${'a'.repeat(39)}-bbbb`);
    expect(out).toBe('a'.repeat(39));
    expect(out.endsWith('-')).toBe(false);
  });

  it('decomposes accented Latin down to ASCII rather than dropping the word', () => {
    // NFKD splits é into e + combining acute; the acute is then a non-alnum run.
    // A TRAILING accent is trimmed away, so the word survives intact.
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('Zoé')).toBe('zoe');
  });

  it('SPLITS a word at a mid-word accent (documented cosmetic flaw)', () => {
    // The combining mark left by NFKD sits INSIDE the word, so it becomes a hyphen:
    // 'Müller' → 'mu-ller', not 'muller'. Ugly but valid and stable; fixing it means
    // stripping ̀-ͯ before the alnum filter. Pinned so a later fix is a
    // deliberate change, not an accident.
    expect(slugify('Müller GmbH')).toBe('mu-ller-gmbh');
    expect(slugify('Renée')).toBe('rene-e');
  });

  it('returns EMPTY for a purely non-Latin name (documented, drives the random fallback)', () => {
    // KNOWN LIMITATION, pinned on purpose: a Greek (or Cyrillic/CJK) workspace name has no
    // ASCII left after normalisation, so `uniqueTenantSlug` falls back to a random `w-xxxxxx`
    // label. See SAAS_PROGRESS.md → Needs Achilleas (transliteration vs random).
    expect(slugify('Καλημέρα')).toBe('');
    expect(slugify('Πλαίσιο ΑΕ')).toBe('');
    expect(slugify('日本語')).toBe('');
  });

  it('tolerates empty and nullish input without throwing', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify(undefined as unknown as string)).toBe('');
    expect(slugify(null as unknown as string)).toBe('');
  });
});

describe('uniqueTenantSlug', () => {
  it('connects before touching the collection', async () => {
    await uniqueTenantSlug('acme');
    expect(connectDBMock).toHaveBeenCalled();
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      tenantExistsMock.mock.invocationCallOrder[0],
    );
  });

  it('returns the plain slug when nothing is taken, with ONE existence check', async () => {
    await expect(uniqueTenantSlug('Acme Corp')).resolves.toBe('acme-corp');
    expect(tenantExistsMock).toHaveBeenCalledTimes(1);
    expect(tenantExistsMock).toHaveBeenCalledWith({ slug: 'acme-corp' });
  });

  it('appends -2 on the first collision (never -1, never -0)', async () => {
    tenantExistsMock.mockResolvedValueOnce({ _id: 'x' }); // 'acme' taken
    await expect(uniqueTenantSlug('acme')).resolves.toBe('acme-2');
    expect(tenantExistsMock.mock.calls.map((c) => c[0])).toEqual([
      { slug: 'acme' },
      { slug: 'acme-2' },
    ]);
  });

  it('keeps counting up while the space is occupied', async () => {
    tenantExistsMock
      .mockResolvedValueOnce({ _id: 'x' })
      .mockResolvedValueOnce({ _id: 'x' })
      .mockResolvedValueOnce({ _id: 'x' });
    await expect(uniqueTenantSlug('acme')).resolves.toBe('acme-4');
  });

  it('treats any truthy exists() result as taken (Mongoose returns a doc, not a boolean)', async () => {
    // `Tenant.exists` resolves to `{_id}` or null — a `=== true` check here would hand two
    // workspaces the same subdomain.
    tenantExistsMock.mockResolvedValueOnce({ _id: 'anything' });
    await expect(uniqueTenantSlug('acme')).resolves.toBe('acme-2');
  });

  it('replaces a RESERVED root with a random label instead of serving it', async () => {
    // 'admin'/'api'/'www' are the apex/infra labels — a tenant must never own one.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const out = await uniqueTenantSlug('Admin');
    expect(out).not.toBe('admin');
    expect(out.startsWith('w-')).toBe(true);
  });

  it('replaces an EMPTY root with a random label (non-Latin / punctuation-only names)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const out = await uniqueTenantSlug('Καλημέρα');
    expect(out.startsWith('w-')).toBe(true);
    expect(out.length).toBeGreaterThan(2);
  });

  it('checks the random fallback label for collisions too', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await uniqueTenantSlug('');
    expect(tenantExistsMock).toHaveBeenCalledTimes(1);
    expect(String((tenantExistsMock.mock.calls[0][0] as { slug: string }).slug)).toMatch(/^w-/);
  });

  it('is bounded: gives up after 50 probes and returns a random-suffixed label', async () => {
    // Guards against a pathological loop hanging a signup request forever.
    tenantExistsMock.mockResolvedValue({ _id: 'taken' }); // everything is taken
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const out = await uniqueTenantSlug('acme');
    expect(tenantExistsMock).toHaveBeenCalledTimes(50);
    expect(out.startsWith('acme-')).toBe(true);
    expect(out).not.toBe('acme-51'); // NOT the next counter value — a random tail
  });

  it('never returns a reserved candidate even from the counted space', async () => {
    // Defensive: the loop `continue`s on a reserved candidate. Unreachable today (a
    // '<root>-<n>' string cannot be in RESERVED_SLUGS) but it must stay harmless.
    tenantExistsMock.mockResolvedValue(null);
    const out = await uniqueTenantSlug('www');
    expect(['www', 'api', 'admin', 'app']).not.toContain(out);
  });

  it('propagates a registry failure rather than minting an unchecked slug', async () => {
    tenantExistsMock.mockRejectedValueOnce(new Error('mongo down'));
    await expect(uniqueTenantSlug('acme')).rejects.toThrow('mongo down');
  });

  it('propagates a connect failure before any probe', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('no db'));
    await expect(uniqueTenantSlug('acme')).rejects.toThrow('no db');
    expect(tenantExistsMock).not.toHaveBeenCalled();
  });
});

describe('dbNameForSlug', () => {
  it('namespaces the tenant database', () => {
    expect(dbNameForSlug('acme')).toBe('tenant_acme');
    expect(dbNameForSlug('acme-2')).toBe('tenant_acme-2');
  });

  it('stays inside Mongo’s 63-byte db-name limit for a max-length slug', () => {
    // slug is capped at 40 by slugify (+ up to a 7-char numeric/random tail) → 'tenant_' + 47.
    const name = dbNameForSlug(`${'a'.repeat(40)}-999999`);
    expect(name.length).toBeLessThan(64);
  });
});

describe('provisionTenant', () => {
  const OPTS = { accountId: 'acc-1', workspaceName: 'Acme Corp' };

  it('creates the tenant with the minted slug and its matching database name', async () => {
    await provisionTenant(OPTS);
    const doc = tenantCreateMock.mock.calls[0][0];
    expect(doc.slug).toBe('acme-corp');
    expect(doc.dbName).toBe('tenant_acme-corp');
    expect(doc.name).toBe('Acme Corp');
  });

  it('derives dbName from the DE-DUPLICATED slug, not from the requested name', async () => {
    // The single most damaging bug this file guards: two workspaces named "Acme" pointing at
    // the same `tenant_acme` database would cross-contaminate every collection.
    tenantExistsMock.mockResolvedValueOnce({ _id: 'x' });
    await provisionTenant(OPTS);
    const doc = tenantCreateMock.mock.calls[0][0];
    expect(doc.slug).toBe('acme-corp-2');
    expect(doc.dbName).toBe('tenant_acme-corp-2');
  });

  it('prefers an explicit slugHint over the display name', async () => {
    await provisionTenant({ ...OPTS, slugHint: 'my-team' });
    expect(tenantCreateMock.mock.calls[0][0].slug).toBe('my-team');
    expect(tenantCreateMock.mock.calls[0][0].name).toBe('Acme Corp'); // name is untouched
  });

  it('falls back to the workspace name when the hint is blank', async () => {
    await provisionTenant({ ...OPTS, slugHint: '' });
    expect(tenantCreateMock.mock.calls[0][0].slug).toBe('acme-corp');
  });

  it('trims the display name and defaults an empty one', async () => {
    await provisionTenant({ accountId: 'acc-1', workspaceName: '  Acme  ' });
    expect(tenantCreateMock.mock.calls[0][0].name).toBe('Acme');

    tenantCreateMock.mockClear();
    await provisionTenant({ accountId: 'acc-1', workspaceName: '   ' });
    expect(tenantCreateMock.mock.calls[0][0].name).toBe('My workspace');
  });

  it('starts every workspace on free / trialing / shared', async () => {
    await provisionTenant(OPTS);
    const doc = tenantCreateMock.mock.calls[0][0];
    expect(doc.plan).toBe('free');
    expect(doc.status).toBe('trialing');
    expect(doc.tier).toBe('shared');
  });

  it('stamps a BOUNDED trial end so the trial can actually lapse', async () => {
    // `trialEndFrom` runs for real: an open-ended trial (missing/NaN trialEndsAt) would let a
    // free workspace use paid capacity forever.
    const before = Date.now();
    await provisionTenant(OPTS);
    const ends = tenantCreateMock.mock.calls[0][0].trialEndsAt as Date;
    expect(ends).toBeInstanceOf(Date);
    const days = (ends.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(DEFAULT_TRIAL_DAYS - 0.01);
    expect(days).toBeLessThan(DEFAULT_TRIAL_DAYS + 0.01);
  });

  it('creates the owner membership AFTER the tenant, keyed on the tenant _id', async () => {
    await provisionTenant(OPTS);
    expect(membershipCreateMock).toHaveBeenCalledTimes(1);
    const m = membershipCreateMock.mock.calls[0][0];
    expect(m.account).toBe('acc-1');
    expect(m.role).toBe('owner');
    expect(m.status).toBe('active');
    expect(tenantCreateMock.mock.invocationCallOrder[0]).toBeLessThan(
      membershipCreateMock.mock.invocationCallOrder[0],
    );
  });

  it('links the membership to the tenant OBJECT ID, not to the slug', async () => {
    const oid = { toString: () => 'oid-42' };
    tenantCreateMock.mockResolvedValueOnce(createdTenant({ _id: oid }));
    await provisionTenant(OPTS);
    expect(membershipCreateMock.mock.calls[0][0].tenant).toBe(oid);
  });

  it('gives the signup account the OWNER role (never member/admin)', async () => {
    // The first account must be able to invite, manage billing and delete the workspace.
    await provisionTenant(OPTS);
    expect(membershipCreateMock.mock.calls[0][0].role).toBe('owner');
    expect(membershipCreateMock.mock.calls[0][0].status).toBe('active');
  });

  it('returns the PERSISTED doc values, not the requested ones', async () => {
    // Defaults applied by the schema (or a slug rewritten by a pre-save hook) must win.
    tenantCreateMock.mockResolvedValueOnce(
      createdTenant({ slug: 'schema-slug', name: 'Schema Name', plan: 'pro', status: 'active' }),
    );
    const out = await provisionTenant(OPTS);
    expect(out).toEqual({
      tenantId: 'tenant-oid',
      slug: 'schema-slug',
      name: 'Schema Name',
      dbName: 'tenant_persisted-slug',
      plan: 'pro',
      status: 'active',
    });
  });

  it('returns exactly the six documented keys (no doc leakage)', async () => {
    tenantCreateMock.mockResolvedValueOnce(
      createdTenant({ aiKeyCipher: 'secret', stripeCustomerId: 'cus_1', __v: 0 }),
    );
    const out = await provisionTenant(OPTS);
    expect(Object.keys(out).sort()).toEqual([
      'dbName',
      'name',
      'plan',
      'slug',
      'status',
      'tenantId',
    ]);
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(JSON.stringify(out)).not.toContain('cus_1');
  });

  it('stringifies the ObjectId so the caller can put it in a cookie/JSON', async () => {
    const out = await provisionTenant(OPTS);
    expect(typeof out.tenantId).toBe('string');
    expect(out.tenantId).toBe('tenant-oid');
  });

  it('connects before writing', async () => {
    await provisionTenant(OPTS);
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      tenantCreateMock.mock.invocationCallOrder[0],
    );
  });

  it('propagates a tenant-insert failure without creating a dangling membership', async () => {
    tenantCreateMock.mockRejectedValueOnce(new Error('duplicate key'));
    await expect(provisionTenant(OPTS)).rejects.toThrow('duplicate key');
    expect(membershipCreateMock).not.toHaveBeenCalled();
  });

  it('propagates a membership-insert failure (NO rollback — documented)', async () => {
    // KNOWN GAP pinned on purpose: there is no transaction, so a failed membership insert
    // leaves an ownerless Tenant behind. The caller sees the throw; the doc survives.
    // See SAAS_PROGRESS.md → Needs Achilleas.
    membershipCreateMock.mockRejectedValueOnce(new Error('write conflict'));
    await expect(provisionTenant(OPTS)).rejects.toThrow('write conflict');
    expect(tenantCreateMock).toHaveBeenCalledTimes(1);
  });
});
