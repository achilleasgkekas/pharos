import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/saas/workspace/export/files is the binary half of workspace portability: the
// collection dump (../route.ts) hands back Mongo, this hands back the MANIFEST of the receipt/
// statement PDFs and item photos that live on disk under STORAGE_ROOT. Zero route-level
// coverage before this file. The pure envelope helpers (`buildFileManifest`,
// `workspaceFilesManifestFilename`) run for REAL here — only the two node-only readers
// (`collectWorkspaceFileRefs` = tenant db, `statWorkspaceFiles` = filesystem) and the session/
// audit seams are mocked. This file covers what the ROUTE itself is responsible for:
//   - the same (slug, requireManage=true, allowInactive=true) session contract as its sibling,
//   - the two-stage pipeline is wired in order: refs from the tenant db → stat of exactly those,
//   - the manifest is REPORT-ONLY: entries carry path/bucket/exists/bytes and never content,
//   - the totals in the header are computed from the entries, so they cannot disagree,
//   - the audit meta is derived from the built manifest's totals, not from the raw entries,
//   - attachment + no-store headers with a filename a hostile slug cannot break out of,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard).

const {
  resolveWorkspaceSessionMock,
  collectWorkspaceFileRefsMock,
  statWorkspaceFilesMock,
  recordAuditMock,
} = vi.hoisted(() => ({
  resolveWorkspaceSessionMock: vi.fn(),
  collectWorkspaceFileRefsMock: vi.fn(),
  statWorkspaceFilesMock: vi.fn(),
  // Params are typed so `mock.calls[0][n]` is indexable (an argless vi.fn types its calls as
  // an empty tuple → TS2493).
  recordAuditMock: vi.fn(async (_ctx: unknown, _entry: unknown) => true),
}));

vi.mock('@/lib/tenancy/workspaceSession', () => ({
  resolveWorkspaceSession: resolveWorkspaceSessionMock,
}));
// Only the two impure readers are replaced; buildFileManifest / workspaceFilesManifestFilename
// stay REAL so the totals arithmetic and the filename sanitisation are genuinely exercised.
vi.mock('@/lib/tenancy/workspaceFiles', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tenancy/workspaceFiles')>('@/lib/tenancy/workspaceFiles');
  return {
    ...actual,
    collectWorkspaceFileRefs: collectWorkspaceFileRefsMock,
    statWorkspaceFiles: statWorkspaceFilesMock,
  };
});
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock };
});

import { GET } from './route';
import { NextResponse } from 'next/server';
import type { FileManifestEntry, WorkspaceFileManifest } from '@/lib/tenancy/workspaceFiles';

const URL_BASE = 'https://app.example.com/api/saas/workspace/export/files';

function makeReq(url = URL_BASE): NextRequest {
  return { url } as unknown as NextRequest;
}

/** The ctx object identity matters: the reader must be handed the SESSION's ctx, nothing else. */
const CTX = { tenantId: 'tenant1', slug: 'acme', isDefault: false };

function makeSession(tenantOver: Record<string, unknown> = {}) {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      // Deliberately a DIFFERENT slug from the tenant doc, so the tests can tell which source
      // each consumer reads (manifest/filename ← tenant doc, audit target ← membership).
      workspace: {
        tenantId: 'tenant1',
        slug: 'acme-membership',
        name: 'Acme',
        role: 'admin',
        plan: 'pro',
        status: 'active',
      },
      ctx: CTX,
      tenant: {
        slug: 'acme',
        name: 'Acme Ltd',
        plan: 'pro',
        status: 'active',
        _id: 'tenant1',
        stripeCustomerId: 'cus_SECRET123',
        aiKeyCipher: 'ENCRYPTED-BYO-KEY',
        ...tenantOver,
      },
    },
  };
}

function entry(path: string, exists = true, bytes = 100): FileManifestEntry {
  return { path, bucket: path.split('/')[0] ?? '', exists, bytes };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  collectWorkspaceFileRefsMock.mockResolvedValue([]);
  statWorkspaceFilesMock.mockResolvedValue([]);
  recordAuditMock.mockResolvedValue(true);
});

describe('session contract — owner/admin, but not gated on billing status', () => {
  it('resolves with requireManage=true and allowInactive=true (a suspended workspace can still audit its files)', async () => {
    await GET(makeReq());
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true, true);
  });

  it('forwards the ?tenant= slug verbatim (normalisation is the resolver`s job)', async () => {
    await GET(makeReq(`${URL_BASE}?tenant=OtherSlug`));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true, true);
  });

  it('passes the short-circuit response through untouched, touching neither db nor disk nor audit', async () => {
    const blocked = NextResponse.json({ error: 'this action requires an owner or admin role' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(collectWorkspaceFileRefsMock).not.toHaveBeenCalled();
    expect(statWorkspaceFilesMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it.each([
    ['SaaS gate 404', 404, 'SaaS mode is not enabled'],
    ['not signed in 401', 401, 'not authenticated'],
    ['not a member 403', 403, 'not a member of that workspace'],
  ])('short-circuit "%s" never reaches the filesystem', async (_label, status, error) => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: NextResponse.json({ error }, { status }) });

    const res = await GET(makeReq());

    expect(res.status).toBe(status);
    expect(statWorkspaceFilesMock).not.toHaveBeenCalled();
  });
});

describe('the two-stage pipeline: tenant db refs → filesystem stat', () => {
  it('collects refs through the SESSION`s ctx, exactly once', async () => {
    await GET(makeReq());
    expect(collectWorkspaceFileRefsMock).toHaveBeenCalledTimes(1);
    expect(collectWorkspaceFileRefsMock.mock.calls[0][0]).toBe(CTX);
  });

  it('stats exactly the refs the tenant db produced — nothing added, nothing dropped', async () => {
    const refs = ['receipts/2026/06/a.pdf', 'equipment/photo.jpg'];
    collectWorkspaceFileRefsMock.mockResolvedValueOnce(refs);

    await GET(makeReq());

    expect(statWorkspaceFilesMock).toHaveBeenCalledTimes(1);
    expect(statWorkspaceFilesMock.mock.calls[0][0]).toBe(refs);
  });

  it('a workspace with no files still returns a valid empty manifest (200, zeroed totals)', async () => {
    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as WorkspaceFileManifest;

    expect(res.status).toBe(200);
    expect(json.files).toEqual([]);
    expect(json.totals).toEqual({ files: 0, present: 0, missing: 0, bytes: 0 });
  });
});

describe('the manifest envelope', () => {
  it('is the versioned pharos.workspace-files-manifest format with a parseable generatedAt', async () => {
    const before = Date.now();
    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as WorkspaceFileManifest;

    expect(json.format).toBe('pharos.workspace-files-manifest');
    expect(json.version).toBe(1);
    const stamped = Date.parse(json.generatedAt);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
  });

  it('states in the body that it is report-only and carries no file contents', async () => {
    const json = JSON.parse(await (await GET(makeReq())).text()) as WorkspaceFileManifest;
    expect(json.notice).toMatch(/report only/i);
    expect(json.notice).toMatch(/no file contents/i);
  });

  it('projects the workspace block from the TENANT doc, and only the four whitelisted fields', async () => {
    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as WorkspaceFileManifest;

    expect(json.workspace).toEqual({ slug: 'acme', name: 'Acme Ltd', plan: 'pro', status: 'active' });
    expect(Object.keys(json.workspace).sort()).toEqual(['name', 'plan', 'slug', 'status']);
  });

  it('never leaks control-plane tenant fields (stripe customer, BYO key cipher) into the body', async () => {
    const body = await (await GET(makeReq())).text();

    expect(body).not.toContain('cus_SECRET123');
    expect(body).not.toContain('ENCRYPTED-BYO-KEY');
  });

  it('each entry describes a file without exposing it — exactly path/bucket/exists/bytes', async () => {
    statWorkspaceFilesMock.mockResolvedValueOnce([entry('receipts/2026/06/a.pdf', true, 2048)]);

    const json = JSON.parse(await (await GET(makeReq())).text()) as WorkspaceFileManifest;

    expect(json.files).toHaveLength(1);
    expect(Object.keys(json.files[0]).sort()).toEqual(['bucket', 'bytes', 'exists', 'path']);
    expect(json.files[0]).toEqual({ path: 'receipts/2026/06/a.pdf', bucket: 'receipts', exists: true, bytes: 2048 });
  });

  it('totals are computed from the entries, so present + missing always equals files', async () => {
    statWorkspaceFilesMock.mockResolvedValueOnce([
      entry('receipts/a.pdf', true, 1000),
      entry('receipts/b.pdf', false, 0),
      entry('equipment/c.jpg', true, 500),
    ]);

    const json = JSON.parse(await (await GET(makeReq())).text()) as WorkspaceFileManifest;

    expect(json.totals).toEqual({ files: 3, present: 2, missing: 1, bytes: 1500 });
    expect(json.totals.present + json.totals.missing).toBe(json.totals.files);
  });

  it('a nonsense negative size cannot drag the byte total below the real sum', async () => {
    statWorkspaceFilesMock.mockResolvedValueOnce([
      entry('receipts/a.pdf', true, 1000),
      entry('receipts/weird.pdf', true, -999),
    ]);

    const json = JSON.parse(await (await GET(makeReq())).text()) as WorkspaceFileManifest;

    expect(json.totals.bytes).toBe(1000);
  });

  it('is pretty-printed (2-space indent) so a human can read the download', async () => {
    const body = await (await GET(makeReq())).text();

    expect(body).toContain('\n  "format": "pharos.workspace-files-manifest"');
    expect(() => JSON.parse(body)).not.toThrow();
  });
});

describe('the audit row', () => {
  it('records the manifest against the session ctx with the right action/actor/target', async () => {
    await GET(makeReq());

    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock.mock.calls[0][0]).toBe(CTX);
    const audit = recordAuditMock.mock.calls[0][1] as { action: string; actor: string; target: string };
    expect(audit.action).toBe('workspace.files_manifested');
    expect(audit.actor).toBe('acc1');
    // The audit target is the MEMBERSHIP slug, distinct from the tenant-doc slug used above.
    expect(audit.target).toBe('acme-membership');
  });

  it('the audit meta is the manifest`s own totals (header and audit can never disagree)', async () => {
    statWorkspaceFilesMock.mockResolvedValueOnce([
      entry('receipts/a.pdf', true, 1000),
      entry('receipts/b.pdf', false, 0),
    ]);

    const res = await GET(makeReq());
    const json = JSON.parse(await res.text()) as WorkspaceFileManifest;
    const meta = (recordAuditMock.mock.calls[0][1] as { meta: Record<string, number> }).meta;

    expect(meta).toEqual({ files: 2, present: 1, missing: 1, bytes: 1000 });
    expect(meta).toEqual(json.totals);
  });
});

describe('the download response', () => {
  it('is a 200 JSON attachment that must not be cached', async () => {
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="pharos-workspace-acme-files.json"'
    );
  });

  it('the filename is distinct from the content export`s, so the two downloads never collide', async () => {
    const res = await GET(makeReq());
    expect(res.headers.get('content-disposition')).toContain('-files.json');
  });

  it('a hostile slug cannot break out of the Content-Disposition filename', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({ slug: 'ac me"; rm -rf /' }));

    const res = await GET(makeReq());
    const cd = res.headers.get('content-disposition') ?? '';

    expect(cd).toMatch(/^attachment; filename="pharos-workspace-[a-zA-Z0-9_-]*-files\.json"$/);
    expect(cd).not.toContain('rm -rf');
  });

  it('a slug with no safe characters falls back to a non-empty filename', async () => {
    resolveWorkspaceSessionMock.mockResolvedValueOnce(makeSession({ slug: '«»' }));

    const res = await GET(makeReq());

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="pharos-workspace-workspace-files.json"'
    );
  });
});

describe('failure shaping (saasGuard)', () => {
  it('a failing tenant-db ref read becomes a clean 500 JSON — no stat, no audit', async () => {
    collectWorkspaceFileRefsMock.mockRejectedValueOnce(new Error('tenant db unreachable'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'tenant db unreachable' });
    expect(statWorkspaceFilesMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('a failing filesystem pass becomes a clean 500 JSON, and nothing is audited', async () => {
    collectWorkspaceFileRefsMock.mockResolvedValueOnce(['receipts/a.pdf']);
    statWorkspaceFilesMock.mockRejectedValueOnce(new Error('EACCES storage root'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'EACCES storage root' });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('a failing audit write fails the whole request (the row is awaited before the body ships)', async () => {
    recordAuditMock.mockRejectedValueOnce(new Error('audit write failed'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'audit write failed' });
  });

  it('a message-less throw still yields the uniform { error } shape', async () => {
    collectWorkspaceFileRefsMock.mockRejectedValueOnce(new Error(''));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toEqual({ error: 'Server error' });
  });

  it('a huge error message is truncated to 200 characters', async () => {
    collectWorkspaceFileRefsMock.mockRejectedValueOnce(new Error('x'.repeat(5000)));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(json.error).toHaveLength(200);
  });
});
