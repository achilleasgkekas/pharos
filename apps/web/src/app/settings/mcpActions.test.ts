import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/mcpActions.ts (38 lines) is the sibling of calendarFeedActions.ts: same
// shape (User.findById/updateOne keyed by getCurrentUser().id, assertCanWrite gate,
// randomBytes token), same tokened-secret-behind-a-connector pattern, but for the MCP
// bearer token instead of the ICS calendar feed. Three functions: getMcpStatus (read),
// generateApiToken (create/rotate), revokeApiToken (clear).
//
// Behaviour pinned:
//  - getMcpStatus: NO write gate (read-only). Short-circuits to {hasToken:false} WITHOUT
//    ever calling connectDB when there is no session (same shape as getCalendarFeed).
//    Unlike getCalendarFeed, it NEVER returns the token itself -- only a boolean, via
//    User.findById(id).select('apiToken').lean() -> `!!doc?.apiToken`. A missing doc or a
//    falsy stored value (null/'') both normalize to {hasToken:false}.
//  - generateApiToken: assertCanWrite() runs BEFORE the session check (a gate rejection is
//    an uncaught throw). No session -> {ok:false, error:'Not signed in'} WITHOUT calling
//    connectDB. On success, the token is prefixed 'phk_' + a random base64url suffix,
//    stored via User.updateOne({_id:u.id}, {$set:{apiToken:token}}), and returned in the
//    result ONCE -- rotating silently invalidates any previously-issued token (no history
//    kept, same as the calendar feed).
//  - revokeApiToken: same assertCanWrite-first/no-connectDB-on-no-session shape, but the
//    no-session failure is just {ok:false} (no error field, unlike generate). Success sets
//    apiToken:null via the same updateOne shape and returns {ok:true}.

const {
  connectDBMock,
  userFindByIdLean,
  userUpdateOne,
  assertCanWriteMock,
  getCurrentUserMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  userFindByIdLean: vi.fn(async (_id: string): Promise<{ apiToken: string | null } | null> => null),
  userUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({})),
  assertCanWriteMock: vi.fn(async () => {}),
  getCurrentUserMock: vi.fn(async (): Promise<{ id: string; role: 'admin' | 'member' | 'viewer'; name: string } | null> => null),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({
  User: {
    findById: (id: string) => ({ select: () => ({ lean: () => userFindByIdLean(id) }) }),
    updateOne: userUpdateOne,
  },
}));
vi.mock('@/lib/auth', () => ({
  assertCanWrite: assertCanWriteMock,
  getCurrentUser: getCurrentUserMock,
}));

import { getMcpStatus, generateApiToken, revokeApiToken } from './mcpActions';

const USER = { id: 'user1', role: 'member' as const, name: 'Achilleas' };

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  userFindByIdLean.mockImplementation(async () => null);
  userUpdateOne.mockImplementation(async () => ({}));
  assertCanWriteMock.mockImplementation(async () => {});
  getCurrentUserMock.mockImplementation(async () => null);
});

describe('getMcpStatus', () => {
  it('has no write gate (read-only)', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ apiToken: 'phk_abc' });
    await getMcpStatus();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
  });

  it('returns {hasToken:false} without hitting the DB when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await getMcpStatus();
    expect(r).toEqual({ hasToken: false });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userFindByIdLean).not.toHaveBeenCalled();
  });

  it('returns {hasToken:true} for a logged-in user with a stored token, never the token itself', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ apiToken: 'phk_xyz123' });
    const r = await getMcpStatus();
    expect(userFindByIdLean).toHaveBeenCalledWith('user1');
    expect(r).toEqual({ hasToken: true });
    expect(Object.keys(r)).not.toContain('token');
  });

  it('normalizes a missing doc to {hasToken:false}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue(null);
    const r = await getMcpStatus();
    expect(r).toEqual({ hasToken: false });
  });

  it('normalizes a falsy stored token (empty string) to {hasToken:false}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    userFindByIdLean.mockResolvedValue({ apiToken: '' });
    const r = await getMcpStatus();
    expect(r).toEqual({ hasToken: false });
  });
});

describe('generateApiToken', () => {
  it('checks the write gate before the session', async () => {
    assertCanWriteMock.mockRejectedValue(new Error('Read-only session'));
    getCurrentUserMock.mockResolvedValue(null);
    await expect(generateApiToken()).rejects.toThrow('Read-only session');
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false, error} without connecting when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await generateApiToken();
    expect(r).toEqual({ ok: false, error: 'Not signed in' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('generates a phk_-prefixed token, persists it, and returns it', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const r = await generateApiToken();
    expect(r.ok).toBe(true);
    expect(r.token).toMatch(/^phk_[A-Za-z0-9_-]+$/);
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'user1' }, { $set: { apiToken: r.token } });
  });

  it('rotates: two calls produce two different tokens', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const first = await generateApiToken();
    const second = await generateApiToken();
    expect(first.token).not.toBe(second.token);
  });
});

describe('revokeApiToken', () => {
  it('checks the write gate before the session', async () => {
    assertCanWriteMock.mockRejectedValue(new Error('Read-only session'));
    getCurrentUserMock.mockResolvedValue(null);
    await expect(revokeApiToken()).rejects.toThrow('Read-only session');
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false} (no error field) without connecting when logged out', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const r = await revokeApiToken();
    expect(r).toEqual({ ok: false });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('clears the stored token and returns {ok:true}', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const r = await revokeApiToken();
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'user1' }, { $set: { apiToken: null } });
  });
});
