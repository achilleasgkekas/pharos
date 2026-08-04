import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// The coverage scan proves the guard is CALLED everywhere. This proves the guard actually
// stops a viewer, on both enforcement paths, including the two pass-throughs that exist so
// background work and logged-out requests keep behaving as before.

const { cookiesMock, verifySessionMock, findOneMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  verifySessionMock: vi.fn(),
  findOneMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('REDIRECT'); }) }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
// withAuth resolves the User model through currentModel() so the token is looked up in the
// caller's workspace. SAAS_MODE is off here, where the real helper hands back the same model
// anyway; this keeps the DB seam mocked without needing a live connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/models/User', () => ({
  User: { findOne: (...a: unknown[]) => findOneMock(...a) },
}));
vi.mock('./session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifySession: verifySessionMock,
}));

import { assertCanWrite } from './auth';
import { withAuth } from './apiAuth';
import { READ_ONLY_MESSAGE } from './roles';

/** A signed-in session with the given role. */
function session(role: string | null) {
  cookiesMock.mockResolvedValue({ get: () => ({ value: 'tok' }) });
  verifySessionMock.mockResolvedValue(role ? { sub: 'u1', role, name: 'Someone' } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertCanWrite (server actions)', () => {
  it('throws for a viewer', async () => {
    session('viewer');
    await expect(assertCanWrite()).rejects.toThrow(READ_ONLY_MESSAGE);
  });

  it('lets members and admins through', async () => {
    session('member');
    await expect(assertCanWrite()).resolves.toBeUndefined();
    session('admin');
    await expect(assertCanWrite()).resolves.toBeUndefined();
  });

  it('treats an unknown role as read-only (fails closed)', async () => {
    session('somethingelse');
    await expect(assertCanWrite()).rejects.toThrow(READ_ONLY_MESSAGE);
  });

  it('passes through with no session, because the middleware already redirects those', async () => {
    session(null);
    await expect(assertCanWrite()).resolves.toBeUndefined();
  });

  it('passes through outside a request, so the background job runner is unaffected', async () => {
    // `cookies()` throws when there is no request scope (job runner, cron).
    cookiesMock.mockImplementation(() => { throw new Error('called outside a request scope'); });
    await expect(assertCanWrite()).resolves.toBeUndefined();
  });
});

describe('withAuth (/api/v1)', () => {
  function req(method: string) {
    return new NextRequest('http://localhost/api/v1/items', {
      method,
      headers: { authorization: 'Bearer t0ken' },
    });
  }
  const ok = async () => NextResponse.json({ ok: true });

  function bearer(role: string) {
    findOneMock.mockReturnValue({
      select: () => ({ lean: async () => ({ _id: 'u1', username: 'someone', name: 'Someone', role }) }),
    });
  }

  it('blocks a viewer from every mutating verb with 403', async () => {
    bearer('viewer');
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await withAuth(req(m), ok);
      expect(res.status, m).toBe(403);
      expect(await res.json()).toEqual({ error: READ_ONLY_MESSAGE });
    }
  });

  it('still lets a viewer read', async () => {
    bearer('viewer');
    const res = await withAuth(req('GET'), ok);
    expect(res.status).toBe(200);
  });

  it('does not get in a member or admin way', async () => {
    for (const role of ['member', 'admin']) {
      bearer(role);
      expect((await withAuth(req('POST'), ok)).status, role).toBe(200);
      expect((await withAuth(req('GET'), ok)).status, role).toBe(200);
    }
  });
});
