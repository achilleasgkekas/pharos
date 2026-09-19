import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const { saasModeMock, verifySessionMock, bearerUserMock, resolveRequestTenantOrNullMock, readFileMock, recacheByPathMock } = vi.hoisted(() => {
  return {
    saasModeMock: vi.fn(),
    verifySessionMock: vi.fn(),
    bearerUserMock: vi.fn(),
    resolveRequestTenantOrNullMock: vi.fn(),
    readFileMock: vi.fn(),
    recacheByPathMock: vi.fn(),
  };
});

vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: saasModeMock }));
vi.mock('@/lib/session', () => ({ SESSION_COOKIE: 'pharos_session', verifySession: verifySessionMock }));
vi.mock('@/lib/apiAuth', () => ({
  bearerUser: bearerUserMock,
  apiTenant: vi.fn().mockResolvedValue({ isDefault: false, tenantId: 'test-tenant' })
}));
vi.mock('@/lib/tenancy/request', () => ({ resolveRequestTenantOrNull: resolveRequestTenantOrNullMock }));
vi.mock('@/lib/storage', () => ({ readFile: readFileMock }));
vi.mock('@/lib/mirror', () => ({ recacheByPath: recacheByPathMock }));
vi.mock('@/lib/tenancy/current', () => ({
  withTenant: vi.fn(async (ctx, fn) => fn()),
  currentTenant: vi.fn()
}));

describe('GET /api/files/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue(Buffer.from('test file'));
  });

  it('rejects SaaS browser user lacking auth', async () => {
    saasModeMock.mockReturnValue(true);
    resolveRequestTenantOrNullMock.mockResolvedValue(null); // Not authenticated or not a member

    const req = new NextRequest('http://localhost/api/files/test.jpg');
    // Set a fake pharos_account cookie just in case (the mock handles failure though)
    req.cookies.set('pharos_account', 'fake-account');

    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it('allows SaaS browser user with valid workspace membership', async () => {
    saasModeMock.mockReturnValue(true);
    resolveRequestTenantOrNullMock.mockResolvedValue({ tenantId: 't1', isDefault: false });
    
    const req = new NextRequest('http://localhost/api/files/test.jpg');
    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });

  it('allows SaaS API client with bearer token', async () => {
    saasModeMock.mockReturnValue(true);
    bearerUserMock.mockResolvedValue({ id: 'u1' });
    resolveRequestTenantOrNullMock.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/files/test.jpg');
    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });

  it('rejects self-hosted user lacking auth', async () => {
    saasModeMock.mockReturnValue(false);
    verifySessionMock.mockResolvedValue(null);
    bearerUserMock.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/files/test.jpg');
    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it('allows self-hosted user with session cookie', async () => {
    saasModeMock.mockReturnValue(false);
    verifySessionMock.mockResolvedValue({ id: 'u1' });
    bearerUserMock.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/files/test.jpg');
    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });

  it('allows self-hosted user with bearer token', async () => {
    saasModeMock.mockReturnValue(false);
    verifySessionMock.mockResolvedValue(null);
    bearerUserMock.mockResolvedValue({ id: 'u1' });

    const req = new NextRequest('http://localhost/api/files/test.jpg');
    const params = Promise.resolve({ path: ['test.jpg'] });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });
});
