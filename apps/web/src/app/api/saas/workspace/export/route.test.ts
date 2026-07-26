import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/saas/workspace/export is the workspace-level GDPR Art. 20 portability surface: it
// dumps a tenant's whole data database as JSON. Zero route-level coverage before this file.
// The pure envelope/cap helpers (`buildWorkspaceExport`, `workspaceExportFilename`,
// `resolveMaxDocs`) already have unit coverage in `workspaceExport.test.ts` and run for REAL
// here (only `collectWorkspaceData`, the node-only tenant-db reader, is mocked, alongside the
// session/audit seams). This file covers what the ROUTE itself is responsible for:
//   - the session contract is exactly (slug, requireManage=true, allowInactive=true): an
//     owner/admin action, but NOT gated on billing status (portability must survive suspension),
//   - resolveWorkspaceSession's short-circuit is passed straight through, before any db read,
//   - the reader is scoped to the SESSION's ctx (never a caller-supplied one) and gets the cap,
//   - the cap comes from WORKSPACE_EXPORT_MAX_DOCS through the real resolveMaxDocs,
//   - the envelope projects ONLY the four whitelisted workspace fields (no tenant secrets),
//   - the audit row records the right action/actor/target and totals derived from the dump,
//   - the download headers are attachment + no-store with a filename that cannot be broken out
//     of by a hostile slug,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const { resolveWorkspaceSessionMock, collectWorkspaceDataMock, recordAuditMock } = vi.hoisted(() => ({
  resolveWorkspaceSessionMock: vi.fn(),
  collectWorkspaceDataMock: vi.fn(),
  // Params are typed so `mock.calls[0][n]` is indexable (an argless vi.fn types its calls as
  // an empty tuple → TS2493).
  recordAuditMock: vi.fn(async (_ctx: unknown, _entry: unknown) => true),
}));

vi.mock('@/lib/tenancy/workspaceSession', () => ({
  resolveWorkspaceSession: resolveWorkspaceSessionMock,
}));
// Only the node-only reader is replaced; buildWorkspaceExport / workspaceExportFilename /
// resolveMaxDocs stay REAL so the envelope, the cap parsing and the filename sanitisation are
// genuinely exercised through the route.
vi.mock('@/lib/tenancy/workspaceExport', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tenancy/workspaceExport')>('@/lib/tenancy/workspaceExport');
  return { ...actual, collectWorkspaceData: collectWorkspaceDataMock };
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock };
});

import { GET } from './route';
import { NextResponse } from 'next/server';
import { WORKSPACE_EXPORT_MAX_DOCS_DEFAULT } from '@/lib/tenancy/workspaceExport';

const URL_BASE = 'https://app.example.com/api/saas/workspace/export';

function makeReq(url = URL_BASE): NextRequest {
  return { url } as unknown as NextRequest;
}

/** The ctx object identity matters: the reader must be handed the SESSION's ctx, nothing else. */
const CTX = { tenantId: 'tenant1', slug: 'acme', isDefault: false };

function makeSession(tenantOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      // Deliberately a DIFFERENT slug from the tenant doc below, so the tests can tell which
      // source each consumer reads (payload/filename ← tenant doc, audit target ← membership).
      workspace: {
        tenantId: 'tenant1',
        slug: 'acme-membership',
        name: 'Acme',
        role: 'owner',
        plan: 'pro',
        status: 'active',
      },
      ctx: CTX,
      tenant: {
        slug: 'acme',
        name: 'Acme Ltd',
        plan: 'pro',
        status: 'active',
        // Control-plane fields that must NEVER reach the exported envelope.
        _id: 'tenant1',
        stripeCustomerId: 'cus_SECRET123',
        aiKeyCipher: 'ENCRYPTED-BYO-KEY',
        ...tenantOver,
      },
      ...over,
    },
  };
}

function coll(name: string, docs: unknown[], truncated = false) {
  return { name, count: docs.length, truncated, docs };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  collectWorkspaceDataMock.mockResolvedValue([]);
  recordAuditMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session contract — owner/admin, but not gated on billing status', () => {
  it('resolves with requireManage=true and allowInactive=true (portability survives suspension)', async () => {
    await GET(makeReq());
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true, true);
  });

  it('forwards the ?tenant= slug verbatim (normalisation is the resolver`s job)', async () => {
    await GET(makeReq(`${URL_BASE}?tenant=OtherSlug`));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true, true);
  });

  it('an empty ?tenant= is forwarded as-is (the resolver falls back to the first workspace)', async () => {
    await GET(makeReq(`${URL_BASE}?tenant=`));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('', true, true);
  });

  it('passes the short-circuit response through untouched, with zero db read and zero audit', async () => {
    const blocked = NextResponse.json({ error: 'this action requires an owner or admin role' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(collectWorkspaceDataMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it.each([
    ['SaaS gate 404', 404, 'SaaS mode is not enabled'],
    ['not signed in 401', 401, 'not authenticated'],
    ['no workspace 404', 404, 'no workspace for this account'],
  ])('short-circuit "%s" never reaches the exporter', async (_label, status, error) => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: NextResponse.json({ error }, { status }) });

    const res = await GET(makeReq());

    expect(res.status).toBe(status);
    expect(collectWorkspaceDataMock).not.toHaveBeenCalled();
  });
});

describe('tenant scoping + the document cap', () => {
  it('reads through the SESSION`s ctx object, exactly once', async () => {
    await GET(makeReq());
    expect(collectWorkspaceDataMock).toHaveBeenCalledTimes(1);
    expect(collectWorkspaceDataMock.mock.calls[0][0]).toBe(CTX);
  });

  it('with WORKSPACE_EXPORT_MAX_DOCS blank/unset → the default cap, both applied and echoed', async () => {
    vi.stubEnv('WORKSPACE_EXPORT_MAX_DOCS', '');

    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { maxDocsPerCollection: number };

    expect(collectWorkspaceDataMock.mock.calls[0][1]).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
    expect(json.maxDocsPerCollection).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
  });

  it('a numeric env cap is applied to the read AND echoed in the envelope', async () => {
    vi.stubEnv('WORKSPACE_EXPORT_MAX_DOCS', '50');

    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { maxDocsPerCollection: number };

    expect(collectWorkspaceDataMock.mock.calls[0][1]).toBe(50);
    expect(json.maxDocsPerCollection).toBe(50);
  });

  it.each([
    ['non-numeric', 'lots'],
    ['zero', '0'],
    ['negative', '-5'],
  ])('a %s cap falls back to the default rather than reading nothing', async (_label, raw) => {
    vi.stubEnv('WORKSPACE_EXPORT_MAX_DOCS', raw);
    await GET(makeReq());
    expect(collectWorkspaceDataMock.mock.calls[0][1]).toBe(WORKSPACE_EXPORT_MAX_DOCS_DEFAULT);
  });

  it('a fractional cap is floored to a whole number of documents', async () => {
    vi.stubEnv('WORKSPACE_EXPORT_MAX_DOCS', '12.9');
    await GET(makeReq());
    expect(collectWorkspaceDataMock.mock.calls[0][1]).toBe(12);
  });
});

describe('the exported envelope', () => {
  it('is the versioned pharos.workspace-export format with a parseable generatedAt', async () => {
    const before = Date.now();
    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { format: string; version: number; generatedAt: string; notice: string };

    expect(json.format).toBe('pharos.workspace-export');
    expect(json.version).toBe(1);
    expect(json.notice).toMatch(/portability/i);
    const stamped = Date.parse(json.generatedAt);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
  });

  it('projects the workspace block from the TENANT doc, and only the four whitelisted fields', async () => {
    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { workspace: Record<string, string> };

    expect(json.workspace).toEqual({ slug: 'acme', name: 'Acme Ltd', plan: 'pro', status: 'active' });
    expect(Object.keys(json.workspace).sort()).toEqual(['name', 'plan', 'slug', 'status']);
  });

  it('never leaks control-plane tenant fields (stripe customer, BYO key cipher, _id) into the body', async () => {
    const body = await (await GET(makeReq())).text();

    expect(body).not.toContain('cus_SECRET123');
    expect(body).not.toContain('ENCRYPTED-BYO-KEY');
    expect(body).not.toContain('stripeCustomerId');
    expect(body).not.toContain('aiKeyCipher');
  });

  it('passes the collected documents through verbatim (this is the user`s own data)', async () => {
    const docs = [{ _id: 'r1', store: 'Πλαίσιο', total: 149.5 }, { _id: 'r2', store: 'Skroutz' }];
    collectWorkspaceDataMock.mockResolvedValueOnce([coll('receipts', docs)]);

    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { collections: { name: string; count: number; docs: unknown[] }[] };

    expect(json.collections).toHaveLength(1);
    expect(json.collections[0].name).toBe('receipts');
    expect(json.collections[0].count).toBe(2);
    expect(json.collections[0].docs).toEqual(docs);
  });

  it('an empty workspace still exports successfully (200, zero collections)', async () => {
    collectWorkspaceDataMock.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as { collections: unknown[] };

    expect(res.status).toBe(200);
    expect(json.collections).toEqual([]);
  });

  it('is pretty-printed (2-space indent) so a human can read the download', async () => {
    collectWorkspaceDataMock.mockResolvedValueOnce([coll('items', [{ _id: 'i1' }])]);

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('\n  "format": "pharos.workspace-export"');
    expect(() => JSON.parse(body)).not.toThrow();
  });
});

describe('the audit row', () => {
  it('records the export against the session ctx with the right action/actor/target', async () => {
    await GET(makeReq());

    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock.mock.calls[0][0]).toBe(CTX);
    const entry = recordAuditMock.mock.calls[0][1] as { action: string; actor: string; target: string };
    expect(entry.action).toBe('workspace.data_exported');
    expect(entry.actor).toBe('acc1');
    // The audit target is the MEMBERSHIP slug, distinct from the tenant-doc slug used above.
    expect(entry.target).toBe('acme-membership');
  });

  it('summarises the dump: collection count, total documents, and whether anything was cut', async () => {
    collectWorkspaceDataMock.mockResolvedValueOnce([
      coll('items', [{}, {}, {}]),
      coll('receipts', [{}, {}]),
    ]);

    await GET(makeReq());

    const meta = (recordAuditMock.mock.calls[0][1] as { meta: Record<string, unknown> }).meta;
    expect(meta).toEqual({ collections: 2, docs: 5, truncated: false });
  });

  it('flags truncated when ANY collection hit the cap (the export never claims completeness)', async () => {
    collectWorkspaceDataMock.mockResolvedValueOnce([
      coll('items', [{}]),
      coll('receipts', [{}, {}], true),
    ]);

    await GET(makeReq());

    const meta = (recordAuditMock.mock.calls[0][1] as { meta: { truncated: boolean } }).meta;
    expect(meta.truncated).toBe(true);
  });
});

describe('the download response', () => {
  it('is a 200 JSON attachment that must not be cached', async () => {
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="pharos-workspace-acme.json"');
  });

  it('a hostile slug cannot break out of the Content-Disposition filename', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({ slug: 'ac me"; rm -rf /' }));

    const res = await GET(makeReq());
    const cd = res.headers.get('content-disposition') ?? '';

    expect(cd).toMatch(/^attachment; filename="pharos-workspace-[a-zA-Z0-9_-]*\.json"$/);
    expect(cd).not.toContain('rm -rf');
  });

  it('a slug with no safe characters falls back to a non-empty filename', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({ slug: '«»' }));

    const res = await GET(makeReq());

    expect(res.headers.get('content-disposition')).toBe('attachment; filename="pharos-workspace-workspace.json"');
  });
});

describe('failure shaping (saasGuard)', () => {
  it('a failing tenant-db read becomes a clean 500 JSON, and nothing is audited', async () => {
    collectWorkspaceDataMock.mockRejectedValueOnce(new Error('tenant db unreachable'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'tenant db unreachable' });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('a failing audit write fails the whole export (the row is awaited before the body ships)', async () => {
    collectWorkspaceDataMock.mockResolvedValueOnce([coll('items', [{}])]);
    recordAuditMock.mockRejectedValueOnce(new Error('audit write failed'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'audit write failed' });
  });

  it('a message-less throw still yields the uniform { error } shape', async () => {
    collectWorkspaceDataMock.mockRejectedValueOnce(new Error(''));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'Server error' });
  });

  it('a huge error message is truncated to 200 characters', async () => {
    collectWorkspaceDataMock.mockRejectedValueOnce(new Error('x'.repeat(5000)));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(json.error).toHaveLength(200);
  });
});
