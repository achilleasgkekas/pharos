import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { middleware } from './middleware';
import { signSession, SESSION_COOKIE } from '@/lib/session';

const { account } = vi.hoisted(() => ({ account: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn() }));
vi.mock('@/models/User', () => ({ User: { findById: () => ({ select: () => ({ lean: account }) }) } }));

const secret = 'retirement-test-fixture-only';
beforeEach(() => {
  account.mockResolvedValue({ name: 'Owner', role: 'admin', sessionEpoch: 0 });
  vi.stubEnv('AUTH_SECRET', secret);
  vi.stubEnv('SAAS_MODE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

it('a signed legacy hosted account cookie cannot open the dashboard', async () => {
  const token = await new SignJWT({ sub: 'old-account', email: 'test@example.com' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
  const response = await middleware(new NextRequest('https://pharos.example.com/', {
    headers: { cookie: `pharos_account=${token}` },
  }));
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
});

it('keeps the existing self-hosted session valid on any configured host', async () => {
  const token = await signSession({ sub: 'owner', name: 'Owner', role: 'admin', epoch: 0 });
  const response = await middleware(new NextRequest('https://old-subdomain.example.com/items', {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  }));
  expect(response.status).toBe(200);
});

it('keeps the first-run wizard accessible and private files authenticated', async () => {
  expect((await middleware(new NextRequest('https://pharos.example.com/setup'))).status).toBe(200);
  expect((await middleware(new NextRequest('https://pharos.example.com/api/files/test.pdf'))).status).toBe(401);
});

it('rejects revoked cookies before serving protected pages or files', async () => {
  const token = await signSession({ sub: 'owner', name: 'Owner', role: 'admin', epoch: 0 });
  account.mockResolvedValue({ role: 'admin', sessionEpoch: 1 });
  for (const [path, status] of [['/items', 307], ['/api/files/test.pdf', 401]] as const) {
    const response = await middleware(new NextRequest(`https://pharos.example.com${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    }));
    expect(response.status).toBe(status);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  }
});
