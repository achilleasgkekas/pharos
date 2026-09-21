import { describe, it, expect, vi, beforeEach } from 'vitest';

const { clearSessionCookieMock, redirectMock } = vi.hoisted(() => ({
  clearSessionCookieMock: vi.fn(async () => {}),
  redirectMock: vi.fn((_to: string) => {}),
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

import { logoutAction } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logoutAction', () => {
  it('self-hosted: clears the user session and returns to the self-hosted login', async () => {
    await logoutAction();
    expect(clearSessionCookieMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

});
