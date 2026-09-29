import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signSession, signMfaPendingToken, SESSION_COOKIE } from '@/lib/session';
import { GET } from './route';

const { account, read, bearer } = vi.hoisted(() => ({ account: vi.fn(), read: vi.fn(), bearer: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn() }));
vi.mock('@/models/User', () => ({ User: { findById: () => ({ select: () => ({ lean: account }) }) } }));
vi.mock('@/lib/apiAuth', () => ({ apiTenant: async () => ({}), bearerUser: bearer }));
vi.mock('@/lib/tenancy/current', () => ({ withTenant: (_: unknown, fn: () => unknown) => fn() }));
vi.mock('@/lib/storage', () => ({ readFile: read }));
vi.mock('@/lib/mirror', () => ({ recacheByPath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_SECRET', 'file-auth-synthetic-test-secret');
  account.mockResolvedValue({ name: 'Owner', role: 'member', sessionEpoch: 0 });
  bearer.mockResolvedValue(null);
  read.mockResolvedValue(Buffer.from('private receipt'));
});
afterEach(() => vi.unstubAllEnvs());
const token = () => signSession({ sub: 'u1', name: 'Owner', role: 'member', epoch: 0 });
function request(value = '') {
  return GET(new NextRequest('https://pharos.example/api/files/receipt.pdf', {
    headers: { cookie: `${SESSION_COOKIE}=${value}` },
  }), { params: Promise.resolve({ path: ['receipt.pdf'] }) });
}
it('denies pending MFA tokens and missing cookies without touching storage', async () => {
  expect((await request(await signMfaPendingToken('u1'))).status).toBe(401);
  expect((await request()).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
});
it('denies revoked and deleted users at the file endpoint itself', async () => {
  const signed = await token();
  account.mockResolvedValue({ role: 'member', sessionEpoch: 1 });
  expect((await request(signed)).status).toBe(401);
  account.mockResolvedValue(null);
  expect((await request(signed)).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
});
it('still serves a valid session and an authenticated bearer client', async () => {
  expect(await (await request(await token())).text()).toBe('private receipt');
  bearer.mockResolvedValue({ id: 'u1', role: 'member' });
  expect((await request()).status).toBe(200);
});
