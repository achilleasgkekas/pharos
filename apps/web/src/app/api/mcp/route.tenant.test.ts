import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { TenantContext } from '@/lib/tenancy/context';

// /api/mcp is the app's SECOND bearer-token door (an external Claude drives Pharos through it),
// and it had its OWN copy of the token lookup. So when /api/v1 was taught to resolve the workspace
// from the host BEFORE looking a token up, this route kept checking the DEFAULT (registry) `users`
// collection and then ran the tools against that same default database — in SaaS mode, on a
// workspace subdomain. These tests pin the three things that fixes:
//   - the workspace is resolved first, and the token lookup happens inside it,
//   - the tools run inside it too (not after the context is gone),
//   - a host that names no usable workspace is refused with the resolver's own status, in
//     JSON-RPC shape, before any token is read.
const { apiTenantMock, findOneMock, executeMock, seenTenantAtLookup, seenTenantAtExecute } = vi.hoisted(() => ({
  apiTenantMock: vi.fn(),
  findOneMock: vi.fn(),
  executeMock: vi.fn(),
  seenTenantAtLookup: [] as string[],
  seenTenantAtExecute: [] as string[],
}));

vi.mock('@/lib/apiAuth', () => ({ apiTenant: apiTenantMock }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Deliberately inert — a direct `User.findOne(...)` coming back would throw here rather than
// quietly reading the registry's users.
vi.mock('@/models/User', () => ({ User: { modelName: 'User' } }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async () => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    seenTenantAtLookup.push(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
    return { findOne: findOneMock };
  },
}));
vi.mock('@/app/aiTools', () => ({
  TOOLS: [{ name: 'add_task', description: 'd', input_schema: {} }],
  execute: async (name: string, args: Record<string, unknown>) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    seenTenantAtExecute.push(ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug);
    return executeMock(name, args);
  },
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
const DEFAULT_TENANT: TenantContext = {
  tenantId: null,
  slug: '',
  dbName: '',
  plan: 'shared',
  status: 'active',
  isDefault: true,
} as unknown as TenantContext;

function req(body: unknown, token = 'tok-acme'): NextRequest {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
    json: async () => body,
  } as unknown as NextRequest;
}

const foundUser = { select: () => ({ lean: async () => ({ _id: 'u1' }) }) };
const noUser = { select: () => ({ lean: async () => null }) };

beforeEach(() => {
  seenTenantAtLookup.length = 0;
  seenTenantAtExecute.length = 0;
  apiTenantMock.mockReset().mockResolvedValue(acme);
  findOneMock.mockReset().mockReturnValue(foundUser);
  executeMock.mockReset().mockResolvedValue({ summary: 's', content: 'c' });
});

describe('/api/mcp — the second bearer door resolves its workspace like /api/v1', () => {
  it('looks the token up in the workspace named by the host, not the default database', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    expect(res.status).toBe(200);
    expect(seenTenantAtLookup).toEqual(['acme']);
  });

  it('runs the tools inside that same workspace', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_task', arguments: { title: 't' } } }));
    expect(res.status).toBe(200);
    expect(seenTenantAtExecute).toEqual(['acme']);
    expect(executeMock).toHaveBeenCalledWith('add_task', { title: 't' });
  });

  it('a token that does not exist in THAT workspace is 401 — the isolation is the lookup landing in the right database', async () => {
    findOneMock.mockReturnValue(noUser);
    const res = await POST(req({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add_task', arguments: {} } }));
    expect(res.status).toBe(401);
    expect(seenTenantAtExecute).toEqual([]);
  });

  it('an unresolvable host is refused with the resolver’s status, in JSON-RPC shape, before any token is read', async () => {
    apiTenantMock.mockResolvedValue({ status: 404, error: 'No workspace for this host' });
    const res = await POST(req({ jsonrpc: '2.0', id: 4, method: 'ping' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.message).toBe('No workspace for this host');
    expect(seenTenantAtLookup).toEqual([]);
  });

  it('a suspended/unusable workspace is refused with 403, same rule /api/v1 applies', async () => {
    apiTenantMock.mockResolvedValue({ status: 403, error: 'Workspace suspended' });
    const res = await POST(req({ jsonrpc: '2.0', id: 5, method: 'ping' }));
    expect(res.status).toBe(403);
    expect(seenTenantAtExecute).toEqual([]);
  });

  it('self-hosted parity: the default tenant resolves and everything behaves as before', async () => {
    apiTenantMock.mockResolvedValue(DEFAULT_TENANT);
    const res = await POST(req({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'add_task', arguments: {} } }));
    expect(res.status).toBe(200);
    expect(seenTenantAtLookup).toEqual(['default']);
    expect(seenTenantAtExecute).toEqual(['default']);
  });
});
