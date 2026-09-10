import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/saas/auth/workspace-available — turns a typed workspace name into its permanent
// subdomain and says whether it is free. slugify / RESERVED_SLUGS / baseDomain run FOR REAL
// (pure), so the slug + host in the response are the true values; only the seams (Tenant.exists,
// connectDB, rate limiter, saasAuthGate) are mocked. saasGuard runs for real.

const { connectDBMock, tenantExistsMock, saasAuthGateMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  tenantExistsMock: vi.fn(async () => false as unknown),
  saasAuthGateMock: vi.fn(() => null as unknown),
}));
const rateLimitMock = vi.fn<(key: string) => unknown>(() => null);

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Tenant', () => ({ Tenant: { exists: tenantExistsMock } }));
vi.mock('@/lib/apiAuth', () => ({ rateLimit: (k: string) => rateLimitMock(k), clientIp: () => '1.2.3.4' }));
vi.mock('@/lib/tenancy/saasApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/saasApi')>('@/lib/tenancy/saasApi');
  return { ...actual, saasAuthGate: saasAuthGateMock };
});

import { GET } from './route';

function makeReq(name: string): NextRequest {
  return { url: `https://app.ph-aros.com/api/saas/auth/workspace-available?name=${encodeURIComponent(name)}` } as unknown as NextRequest;
}

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, SAAS_MODE: 'on', SAAS_BASE_DOMAIN: 'ph-aros.com' };
  tenantExistsMock.mockResolvedValue(false);
  saasAuthGateMock.mockReturnValue(null);
  rateLimitMock.mockReturnValue(null);
});

describe('workspace-available', () => {
  it('reports a free name as available, with its resolved slug + host', async () => {
    const data = (await (await GET(makeReq('My Bakery'))).json()) as Record<string, unknown>;
    expect(data).toMatchObject({ slug: 'my-bakery', host: 'my-bakery.ph-aros.com', available: true, reason: 'ok' });
  });

  it('reports a taken slug as unavailable', async () => {
    tenantExistsMock.mockResolvedValueOnce(true);
    const data = (await (await GET(makeReq('Acme'))).json()) as Record<string, unknown>;
    expect(data).toMatchObject({ slug: 'acme', available: false, reason: 'taken' });
  });

  it('reports a reserved label as unavailable WITHOUT querying tenants', async () => {
    const data = (await (await GET(makeReq('www'))).json()) as Record<string, unknown>;
    expect(data).toMatchObject({ available: false, reason: 'reserved' });
    expect(tenantExistsMock).not.toHaveBeenCalled();
  });

  it('treats a name with no usable characters as empty', async () => {
    const data = (await (await GET(makeReq('!!!'))).json()) as Record<string, unknown>;
    expect(data).toMatchObject({ slug: '', host: '', available: false, reason: 'empty' });
    expect(tenantExistsMock).not.toHaveBeenCalled();
  });

  it('404s when SAAS_MODE is off', async () => {
    process.env.SAAS_MODE = 'off';
    const res = await GET(makeReq('Acme'));
    expect(res.status).toBe(404);
  });

  it('returns the limiter response and does nothing else when rate-limited', async () => {
    const { NextResponse } = await import('next/server');
    rateLimitMock.mockReturnValueOnce(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const res = await GET(makeReq('Acme'));
    expect(res.status).toBe(429);
    expect(tenantExistsMock).not.toHaveBeenCalled();
  });
});
