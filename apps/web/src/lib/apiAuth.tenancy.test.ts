import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// The tenancy gate on /api/v1 (withAuth → apiTenant → bearerUser).
//
// Every OTHER test in this repo runs with SAAS_MODE off, which proves the self-hosted path is
// unchanged but says nothing about the hosted one. These cover the hosted path, and above all
// the property the whole change exists for:
//
//   an API token minted in workspace A must not read workspace B.
//
// The isolation is NOT a membership check — it is the token lookup landing in the right
// database. So the fake `currentModel` below resolves the user store from the AMBIENT tenant
// (the real AsyncLocalStorage context established by withAuth), exactly like the real one
// resolves a connection. If withAuth ever stopped establishing that context, or established it
// after the lookup, these tests fail.

const { headersMock, saasModeMock, getTenantContextMock, hostState, usersByTenant } = vi.hoisted(() => {
  const hostState: { host: string } = { host: '' };
  const headersMock = vi.fn(async () => ({ get: (k: string) => (k === 'host' ? hostState.host : null) }));
  const saasModeMock = vi.fn(() => true);
  // Per-workspace user stores. Token 'tok-a' exists ONLY in workspace a.
  const usersByTenant: Record<string, { _id: string; username: string; role: string; apiToken: string }[]> = {
    a: [{ _id: 'ua', username: 'ann', role: 'admin', apiToken: 'tok-a' }],
    b: [{ _id: 'ub', username: 'bob', role: 'admin', apiToken: 'tok-b' }],
  };
  const getTenantContextMock = vi.fn(async ({ host }: { host: string | null }) => {
    const slug = (host || '').split('.')[0];
    if (!usersByTenant[slug]) return null;
    return { tenantId: `id-${slug}`, slug, dbName: `tenant_${slug}`, plan: 'free', status: 'active', isDefault: false };
  });
  return { headersMock, saasModeMock, getTenantContextMock, hostState, usersByTenant };
});

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/User', () => ({ User: { __model: 'User' } }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/tenancy/request', () => ({ TENANT_HOST_HEADER: 'x-tenant-host' }));
vi.mock('@/lib/tenancy/context', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, getTenantContext: getTenantContextMock };
});

// The seam that matters: hand back a model bound to whichever workspace is ambient right now.
vi.mock('@/lib/tenancy/connection', async () => {
  const { currentTenant } = await import('@/lib/tenancy/current');
  return {
    currentModel: async () => {
      const slug = currentTenant().slug;
      return {
        findOne: (q: { apiToken: string }) => ({
          select: () => ({
            lean: async () => (usersByTenant[slug] || []).find((u) => u.apiToken === q.apiToken) ?? null,
          }),
        }),
      };
    },
  };
});

import { withAuth } from './apiAuth';

function req(token: string, method = 'GET'): NextRequest {
  return {
    method,
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  } as unknown as NextRequest;
}

const ok = async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) as never;

beforeEach(() => {
  saasModeMock.mockReturnValue(true);
  hostState.host = 'a.ph-aros.com';
});

describe('withAuth tenancy gate', () => {
  it("a workspace-A token is accepted on workspace A's host", async () => {
    hostState.host = 'a.ph-aros.com';
    const res = await withAuth(req('tok-a'), ok);
    expect(res.status).toBe(200);
  });

  it('THE ISOLATION PROPERTY: a workspace-A token is rejected on workspace B, and never reaches the handler', async () => {
    hostState.host = 'b.ph-aros.com';
    const handler = vi.fn(ok);
    const res = await withAuth(req('tok-a'), handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("and symmetrically, workspace B's own token works on B", async () => {
    hostState.host = 'b.ph-aros.com';
    expect((await withAuth(req('tok-b'), ok)).status).toBe(200);
  });

  it('a host naming a workspace that does not exist → 404, before any token lookup', async () => {
    hostState.host = 'nope.ph-aros.com';
    const handler = vi.fn(ok);
    const res = await withAuth(req('tok-a'), handler);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No such workspace' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('an inactive workspace → 403 with the lifecycle reason, not a 401', async () => {
    getTenantContextMock.mockResolvedValueOnce({
      tenantId: 'id-a', slug: 'a', dbName: 'tenant_a', plan: 'free', status: 'suspended', isDefault: false,
    });
    const res = await withAuth(req('tok-a'), ok);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'workspace is suspended' });
  });

  it('SAAS_MODE off → no host resolution at all (self-hosted path untouched)', async () => {
    saasModeMock.mockReturnValue(false);
    getTenantContextMock.mockClear();
    // default tenant slug is "default", which has no user store, so the token resolves to nobody
    const res = await withAuth(req('tok-a'), ok);
    expect(getTenantContextMock).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});
