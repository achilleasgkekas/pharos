import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { TenantContext } from '@/lib/tenancy/context';

// Login is the one /api/v1 route that cannot use `withAuth` — it is where the bearer token comes
// FROM — and that is exactly how it became the only door with no workspace behind it (#210).
// `currentModel(User)` reads the AMBIENT tenant, and with none established it resolves to the
// DEFAULT connection: on a hosted workspace's subdomain the credentials were checked against the
// registry database instead of that workspace's `users`.
//
// What is pinned here is only "which database did the lookup land in", so the tenant plumbing
// (`withTenant` / `currentTenant`) runs for real and just the resolver and the DB seam are mocked.
const { apiTenantMock, findOneMock, seenTenantAtLookup } = vi.hoisted(() => ({
  apiTenantMock: vi.fn(),
  findOneMock: vi.fn(),
  seenTenantAtLookup: [] as string[],
}));

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/User', () => ({ User: { modelName: 'User' } }));
vi.mock('@/lib/auth', () => ({ verifyPassword: () => true }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    seenTenantAtLookup.push(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
    return { findOne: findOneMock };
  },
}));
// Only `apiTenant` is replaced; the rest of apiAuth (apiError, rateLimit, clientIp) is real.
vi.mock('@/lib/apiAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apiAuth')>()),
  apiTenant: apiTenantMock,
}));

import { POST } from './route';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};
const DEFAULT_TENANT = {
  tenantId: null,
  slug: '',
  dbName: '',
  plan: 'shared',
  status: 'active',
  isDefault: true,
} as unknown as TenantContext;

const req = (body: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => body } as unknown as NextRequest);

const creds = { username: 'Achilleas ', password: 'pw' };

beforeEach(() => {
  seenTenantAtLookup.length = 0;
  apiTenantMock.mockReset().mockResolvedValue(acme);
  findOneMock.mockReset().mockReturnValue({
    select: () => ({ _id: 'u1', username: 'achilleas', role: 'member', passwordHash: 'h', apiToken: 'phk_existing' }),
  });
});

describe('POST /api/v1/auth/login resolves its workspace before checking credentials', () => {
  it('looks the user up in the workspace named by the host', async () => {
    const res = await POST(req(creds));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: 'phk_existing' });
    expect(seenTenantAtLookup).toEqual(['acme']);
  });

  it('a host that names no usable workspace is refused before any credential is read', async () => {
    apiTenantMock.mockResolvedValue({ status: 404, error: 'No workspace for this host' });
    const res = await POST(req(creds));
    expect(res.status).toBe(404);
    expect(seenTenantAtLookup).toEqual([]);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('a suspended workspace is refused with 403, the same status the other doors use', async () => {
    apiTenantMock.mockResolvedValue({ status: 403, error: 'Workspace suspended' });
    expect((await POST(req(creds))).status).toBe(403);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('self-hosted parity: the default tenant resolves and the lookup is the default connection', async () => {
    apiTenantMock.mockResolvedValue(DEFAULT_TENANT);
    expect((await POST(req(creds))).status).toBe(200);
    expect(seenTenantAtLookup).toEqual(['default']);
  });
});
