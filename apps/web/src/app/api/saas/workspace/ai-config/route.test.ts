import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// PATCH/GET /api/saas/workspace/ai-config — the account-area control-plane route that reads and
// writes a workspace's per-tenant AI master switch + feature toggles (its data-DB AppConfig).
// resolveWorkspaceSession + the tenant DB layer are mocked at their seams; saasGuard runs for
// REAL so the mid-throw test exercises production error shaping. AI_FEATURES is real (the route
// validates against it).

const { resolveWorkspaceSessionMock, updateOneMock, leanMock, recordAuditMock, tenantModelMock } = vi.hoisted(() => ({
  resolveWorkspaceSessionMock: vi.fn(),
  updateOneMock: vi.fn(async () => ({ acknowledged: true })),
  leanMock: vi.fn(async () => ({ aiEnabled: true, aiFeatures: { receipts: false } }) as Record<string, unknown> | null),
  recordAuditMock: vi.fn(async () => true),
  tenantModelMock: vi.fn(),
}));

const fakeConfig = { findOne: () => ({ select: () => ({ lean: leanMock }) }), updateOne: updateOneMock };

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/lib/tenancy/connection', () => ({ tenantDb: async () => ({}), tenantModel: (...a: unknown[]) => tenantModelMock(...a) }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: 'APPCONFIG_TOKEN' }));
vi.mock('@/lib/tenancy/audit', async (orig) => ({ ...(await (orig as () => Promise<object>)()), recordAudit: recordAuditMock }));

import { GET, PATCH } from './route';

function makeReq(body: unknown = {}, url = 'https://app.example.com/api/saas/workspace/ai-config'): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}
const session = { session: { account: { sub: 'acc1' }, workspace: { slug: 'acme' }, ctx: { tenantId: 't1', isDefault: false } } };

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, SAAS_MODE: 'on' };
  resolveWorkspaceSessionMock.mockResolvedValue(session);
  tenantModelMock.mockReturnValue(fakeConfig);
  leanMock.mockResolvedValue({ aiEnabled: true, aiFeatures: { receipts: false } });
  updateOneMock.mockResolvedValue({ acknowledged: true });
});

describe('GET', () => {
  it('returns the master switch, feature map and the catalogue', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { aiEnabled: boolean; aiFeatures: Record<string, boolean>; features: unknown[] };
    expect(data.aiEnabled).toBe(true);
    expect(data.aiFeatures).toEqual({ receipts: false });
    expect(Array.isArray(data.features) && data.features.length).toBeGreaterThan(0);
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, false);
  });

  it('defaults aiEnabled to true when the singleton has no value yet', async () => {
    leanMock.mockResolvedValue(null);
    const data = (await (await GET(makeReq())).json()) as { aiEnabled: boolean; aiFeatures: Record<string, boolean> };
    expect(data.aiEnabled).toBe(true);
    expect(data.aiFeatures).toEqual({});
  });

  it('passes a gate short-circuit straight through', async () => {
    const { NextResponse } = await import('next/server');
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: NextResponse.json({ error: 'nope' }, { status: 403 }) });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(updateOneMock).not.toHaveBeenCalled();
  });
});

describe('PATCH', () => {
  it('updates the master switch and records an audit event', async () => {
    const res = await PATCH(makeReq({ aiEnabled: false }));
    expect(res.status).toBe(200);
    expect(updateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { aiEnabled: false } }, { upsert: true });
    expect(recordAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ai_config.set' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('MERGES an incoming feature toggle onto the stored map', async () => {
    // stored: { receipts:false }. Toggle receipts back on → { receipts:true }; others untouched.
    const res = await PATCH(makeReq({ aiFeatures: { receipts: true } }));
    expect(res.status).toBe(200);
    expect(updateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { aiFeatures: { receipts: true } } }, { upsert: true });
  });

  it('rejects an unknown feature key without writing', async () => {
    const res = await PATCH(makeReq({ aiFeatures: { notAThing: true } }));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('rejects an empty patch (nothing to update)', async () => {
    const res = await PATCH(makeReq({}));
    expect(res.status).toBe(400);
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('passes a gate short-circuit straight through before any write', async () => {
    const { NextResponse } = await import('next/server');
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) });
    const res = await PATCH(makeReq({ aiEnabled: true }));
    expect(res.status).toBe(403);
    expect(updateOneMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});
