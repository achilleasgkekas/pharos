import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sign-out from inside the product, for BOTH identity shapes.
//
// It used to clear only `pharos_session` and redirect to `/login` — the self-hosted pair. A
// hosted customer holds `pharos_account`, so the button cleared a cookie they never had, left
// the real session alive, and dropped them on a login page they were still authenticated past.
// Reported as "I log out and it takes me back to the workspace and I have to log out there
// too". They did: this button had not logged them out of anything.

const { clearSessionCookieMock, clearAccountCookieMock, redirectMock, saasModeMock } = vi.hoisted(() => ({
  clearSessionCookieMock: vi.fn(async () => {}),
  clearAccountCookieMock: vi.fn(async () => {}),
  redirectMock: vi.fn((_to: string) => {}),
  saasModeMock: vi.fn(() => false),
}));

vi.mock('next/navigation', () => ({ redirect: (to: string) => redirectMock(to) }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/User', () => ({ User: { findOne: () => ({ lean: async () => null }) } }));
vi.mock('@/lib/auth', () => ({
  verifyPassword: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: clearSessionCookieMock,
}));
vi.mock('@/lib/session', () => ({ authConfigured: () => true }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: () => saasModeMock() }));
vi.mock('@/lib/tenancy/accountSession', () => ({ clearAccountCookie: clearAccountCookieMock }));

import { logoutAction } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  saasModeMock.mockReturnValue(false);
});

describe('logoutAction', () => {
  it('self-hosted: clears the user session and returns to the self-hosted login', async () => {
    await logoutAction();
    expect(clearSessionCookieMock).toHaveBeenCalled();
    expect(clearAccountCookieMock).not.toHaveBeenCalled(); // never loads the tenancy graph
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('hosted: clears the ACCOUNT cookie too, which is the one that was actually keeping them in', async () => {
    saasModeMock.mockReturnValue(true);
    await logoutAction();
    expect(clearAccountCookieMock).toHaveBeenCalled();
    expect(clearSessionCookieMock).toHaveBeenCalled(); // both, so no session is left behind
  });

  it('hosted: lands on the account login, not the self-hosted one', async () => {
    // /login is not even reachable for a hosted visitor (the SaaS gate redirects it), so
    // sending them there was a bounce at best and the self-hosted setup wizard at worst.
    saasModeMock.mockReturnValue(true);
    await logoutAction();
    expect(redirectMock).toHaveBeenCalledWith('/account/login');
  });
});
