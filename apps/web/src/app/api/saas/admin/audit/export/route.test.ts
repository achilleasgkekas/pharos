import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// GET /api/saas/admin/audit/export is the CSV download of the cross-tenant audit trail. The pure
// formatting/clamping rules have their own coverage (adminAuditCsv.test.ts); what the ROUTE owns,
// and what is tested here: the superadmin short-circuit must fire BEFORE any query parse or DB
// read (an unauthenticated caller must not be able to make the control plane query at all), the
// query string must reach listPlatformAudit verbatim so the download matches the on-screen slice,
// the response must actually be a download (text/csv + attachment Content-Disposition + no-store)
// rather than JSON, an unknown workspace slug must be a 404 and NOT a header-only CSV that reads
// like "this workspace did nothing", and a mid-handler throw must surface as clean 500 JSON.

const {
  requireSuperadminMock,
  parseAuditExportQueryMock,
  listPlatformAuditMock,
  buildPlatformAuditCsvMock,
  platformAuditCsvFilenameMock,
} = vi.hoisted(() => ({
  requireSuperadminMock: vi.fn(),
  parseAuditExportQueryMock: vi.fn(),
  listPlatformAuditMock: vi.fn(),
  buildPlatformAuditCsvMock: vi.fn(),
  platformAuditCsvFilenameMock: vi.fn(),
}));

vi.mock('@/lib/tenancy/superadmin', () => ({ requireSuperadmin: requireSuperadminMock }));
vi.mock('@/lib/tenancy/adminAudit', () => ({ listPlatformAudit: listPlatformAuditMock }));
vi.mock('@/lib/tenancy/adminAuditCsv', () => ({
  parseAuditExportQuery: parseAuditExportQueryMock,
  buildPlatformAuditCsv: buildPlatformAuditCsvMock,
  platformAuditCsvFilename: platformAuditCsvFilenameMock,
}));

import { GET } from './route';

function makeReq(url = 'https://pharos.test/api/saas/admin/audit/export'): NextRequest {
  return { url } as unknown as NextRequest;
}

const QUERY = { limit: 1000, action: null, tenant: null, actor: null, cursor: null };
const EVENTS = [{ id: 'e1', action: 'member.added' }];

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadminMock.mockResolvedValue({ account: { sub: 'op1', email: 'ops@pharos.dev' } });
  parseAuditExportQueryMock.mockReturnValue(QUERY);
  listPlatformAuditMock.mockResolvedValue({ events: EVENTS, hasMore: false, unknownTenant: false });
  buildPlatformAuditCsvMock.mockReturnValue('Timestamp,Action\r\n2026-07-30,member.added');
  platformAuditCsvFilenameMock.mockReturnValue('pharos-audit-platform-all-2026-07-30.csv');
});

describe('GET /api/saas/admin/audit/export', () => {
  it('passes through the requireSuperadmin short-circuit untouched, never parses or queries', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    requireSuperadminMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(parseAuditExportQueryMock).not.toHaveBeenCalled();
    expect(listPlatformAuditMock).not.toHaveBeenCalled();
    expect(buildPlatformAuditCsvMock).not.toHaveBeenCalled();
  });

  it('parses the query string and threads it into listPlatformAudit verbatim', async () => {
    await GET(makeReq('https://pharos.test/api/saas/admin/audit/export?tenant=acme&limit=3000'));

    const params = parseAuditExportQueryMock.mock.calls[0][0] as URLSearchParams;
    expect(params.get('tenant')).toBe('acme');
    expect(params.get('limit')).toBe('3000');
    expect(listPlatformAuditMock).toHaveBeenCalledWith(QUERY);
  });

  it('serves the CSV as an attachment download with no-store', async () => {
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="pharos-audit-platform-all-2026-07-30.csv"'
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await expect(res.text()).resolves.toBe('Timestamp,Action\r\n2026-07-30,member.added');
  });

  it('builds the body from the events the reader returned', async () => {
    await GET(makeReq());
    expect(buildPlatformAuditCsvMock).toHaveBeenCalledWith(EVENTS);
    expect(platformAuditCsvFilenameMock).toHaveBeenCalledWith(QUERY);
  });

  it('404s an unknown workspace slug instead of serving an empty CSV', async () => {
    parseAuditExportQueryMock.mockReturnValue({ ...QUERY, tenant: 'nope' });
    listPlatformAuditMock.mockResolvedValue({ events: [], hasMore: false, unknownTenant: true });

    const res = await GET(makeReq('https://pharos.test/api/saas/admin/audit/export?tenant=nope'));

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({ error: 'unknown workspace', tenant: 'nope' });
    expect(buildPlatformAuditCsvMock).not.toHaveBeenCalled();
  });

  it('404s an unknown actor email instead of serving an empty CSV', async () => {
    // Same reasoning as the unknown slug: a header-only CSV attached to a ticket reads as "this
    // person did nothing", when in fact nobody owns that address.
    parseAuditExportQueryMock.mockReturnValue({ ...QUERY, actor: 'ghost@example.com' });
    listPlatformAuditMock.mockResolvedValue({
      events: [],
      hasMore: false,
      unknownTenant: false,
      unknownActor: true,
    });

    const res = await GET(
      makeReq('https://pharos.test/api/saas/admin/audit/export?actor=ghost@example.com')
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({
      error: 'unknown actor',
      actor: 'ghost@example.com',
    });
    expect(buildPlatformAuditCsvMock).not.toHaveBeenCalled();
  });

  it('still serves a (header-only) CSV for a genuinely empty feed', async () => {
    listPlatformAuditMock.mockResolvedValue({
      events: [],
      hasMore: false,
      unknownTenant: false,
      unknownActor: false,
    });
    buildPlatformAuditCsvMock.mockReturnValue('Timestamp,Action');

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('surfaces a mid-handler throw as clean 500 JSON via saasGuard', async () => {
    listPlatformAuditMock.mockRejectedValue(new Error('mongo down'));

    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'mongo down' });
  });
});
