import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/users.actions.ts (91 lines) is a small, standalone concern (NOT part of
// the giant app/settings/actions.ts) — admin-only user management (list/create/delete/
// change-role/reset-password) plus the one self-service action any signed-in user gets
// (change their own password). Six functions, all operating on the User model.
//
// `@/lib/roles` (parseRole) is imported REAL, not mocked — it is pure and DB-free
// (see the file's own header comment), so exercising it for real is cheaper and more
// honest than re-stubbing its behaviour here.
//
// Behaviour pinned:
//  - listUsers: requireAdmin() first, then User.find().sort({createdAt:1}).lean().
//    KNOWN GAP (test-only per routine territory, not fixed here): the role projection
//    is `u.role === 'admin' ? 'admin' : 'member'` — a stored 'viewer' silently displays
//    as 'member' in this list, even though setUserRole (via parseRole) fully supports
//    the viewer role. The tests below document the CURRENT behaviour, not assert it is
//    correct.
//  - createUser: requireAdmin() first. Validates username (lowercase+trim, min 2 chars,
//    /^[a-z0-9._-]+$/) and password (min 8 chars) BEFORE touching connectDB/User at all.
//    role defaults to 'member' unless the form value is the exact string 'admin'.
//    Duplicate username (case-insensitive via the lowercase compare) -> error, still no
//    write. Success hashes the password (hashPassword, never stores the plaintext),
//    creates the user, and revalidates '/settings'.
//  - deleteUser: requireAdmin() first. Self-delete is blocked BEFORE connectDB (`id ===
//    me.id`). Missing target -> error. The last admin cannot be deleted (role==='admin'
//    AND countDocuments({role:'admin'}) <= 1) — deleting a non-last admin, or any
//    member/viewer, is allowed.
//  - setUserRole: requireAdmin() first. parseRole() rejects unknown role strings BEFORE
//    connectDB. Missing target -> error. Any move OFF admin (not just ->member, also
//    ->viewer) on the last admin is blocked — the demotion guard checks `next !== 'admin'`,
//    not `next === 'member'`.
//  - changeUserPassword (admin resets someone else's, no old-password check):
//    requireAdmin() first, password min 8 chars BEFORE connectDB, then a single
//    updateOne — matchedCount===0 -> 'User not found.'. Deliberately does NOT call
//    revalidatePath (no display data changes from a password reset).
//  - changeOwnPassword (self-service): requireUser() (NOT requireAdmin — any signed-in
//    role may change their own password), newPassword min 8 chars BEFORE connectDB, then
//    verifies the OLD password against the stored hash before writing the new one. Also
//    does not call revalidatePath.

const {
  connectDBMock,
  userFindMock,
  userFindOneLean,
  userCreate,
  userFindByIdLean,
  userDeleteOne,
  userUpdateOne,
  userCountDocuments,
  hashPasswordMock,
  verifyPasswordMock,
  requireAdminMock,
  requireUserMock,
  bumpSessionEpochMock,
  setSessionCookieMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  userFindMock: vi.fn(() => ({ sort: (_arg?: Record<string, unknown>) => ({ lean: async () => [] as Record<string, unknown>[] }) })),
  userFindOneLean: vi.fn(async (_filter: Record<string, unknown>): Promise<Record<string, unknown> | null> => null),
  userCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  userFindByIdLean: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
  userDeleteOne: vi.fn(async (_filter: Record<string, unknown>) => ({})),
  userUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({ matchedCount: 1 })),
  userCountDocuments: vi.fn(async (_filter: Record<string, unknown>) => 0),
  hashPasswordMock: vi.fn((plain: string) => `hashed:${plain}`),
  verifyPasswordMock: vi.fn((_plain: string, _stored: string) => false),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Achilleas' })),
  requireUserMock: vi.fn(async () => ({ id: 'user1', role: 'member' as const, name: 'Someone' })),
  bumpSessionEpochMock: vi.fn(async (_id: string) => 1),
  setSessionCookieMock: vi.fn(async (_claims: Record<string, unknown>) => {}),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({
  User: {
    find: userFindMock,
    findOne: (filter: Record<string, unknown>) => ({ lean: () => userFindOneLean(filter) }),
    create: userCreate,
    findById: (id: string) => ({ lean: () => userFindByIdLean(id) }),
    deleteOne: userDeleteOne,
    updateOne: userUpdateOne,
    countDocuments: userCountDocuments,
  },
}));
vi.mock('@/lib/auth', () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
  requireAdmin: requireAdminMock,
  requireUser: requireUserMock,
  bumpSessionEpoch: bumpSessionEpochMock,
  setSessionCookie: setSessionCookieMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { listUsers, createUser, deleteUser, setUserRole, changeUserPassword, changeOwnPassword, logoutOtherSessions } from './users.actions';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  userFindMock.mockImplementation(() => ({ sort: () => ({ lean: async () => [] }) }));
  userFindOneLean.mockImplementation(async () => null);
  userCreate.mockImplementation(async () => ({}));
  userFindByIdLean.mockImplementation(async () => null);
  userDeleteOne.mockImplementation(async () => ({}));
  userUpdateOne.mockImplementation(async () => ({ matchedCount: 1 }));
  userCountDocuments.mockImplementation(async () => 0);
  hashPasswordMock.mockImplementation((plain: string) => `hashed:${plain}`);
  verifyPasswordMock.mockImplementation(() => false);
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Achilleas' }));
  requireUserMock.mockImplementation(async () => ({ id: 'user1', role: 'member' as const, name: 'Someone' }));
  bumpSessionEpochMock.mockImplementation(async () => 1);
  setSessionCookieMock.mockImplementation(async () => {});
});

describe('listUsers', () => {
  it('requires admin before connecting', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden: admin access required'));
    await expect(listUsers()).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('maps admin/member rows straight through', async () => {
    userFindMock.mockReturnValue({
      sort: () => ({
        lean: async () => [
          { _id: 'u1', username: 'achilleas', name: 'Achilleas', role: 'admin' },
          { _id: 'u2', username: 'guest', name: '', role: 'member' },
        ],
      }),
    });
    const rows = await listUsers();
    expect(rows).toEqual([
      { id: 'u1', username: 'achilleas', name: 'Achilleas', role: 'admin' },
      { id: 'u2', username: 'guest', name: '', role: 'member' },
    ]);
  });

  it('KNOWN GAP: a stored viewer role displays as member', async () => {
    userFindMock.mockReturnValue({
      sort: () => ({ lean: async () => [{ _id: 'u3', username: 'watcher', name: '', role: 'viewer' }] }),
    });
    const rows = await listUsers();
    expect(rows[0].role).toBe('member');
  });

  it('sorts by createdAt ascending', async () => {
    let sortArg: Record<string, unknown> | undefined;
    userFindMock.mockReturnValue({
      sort: (arg?: Record<string, unknown>) => {
        sortArg = arg;
        return { lean: async () => [] };
      },
    });
    await listUsers();
    expect(sortArg).toEqual({ createdAt: 1 });
  });
});

describe('createUser', () => {
  it('requires admin before reading the form', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden'));
    await expect(createUser(fd({ username: 'x', password: 'longenough1' }))).rejects.toThrow('Forbidden');
  });

  it('rejects a too-short username without connecting', async () => {
    const r = await createUser(fd({ username: 'a', password: 'longenough1' }));
    expect(r).toEqual({ ok: false, error: 'Username: letters, numbers, . _ - (min 2).' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a username with illegal characters', async () => {
    const r = await createUser(fd({ username: 'bad user!', password: 'longenough1' }));
    expect(r.ok).toBe(false);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short password without connecting', async () => {
    const r = await createUser(fd({ username: 'validname', password: 'short' }));
    expect(r).toEqual({ ok: false, error: 'Password must be at least 8 characters.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a duplicate username without creating', async () => {
    userFindOneLean.mockResolvedValue({ _id: 'existing' });
    const r = await createUser(fd({ username: 'taken', password: 'longenough1' }));
    expect(r).toEqual({ ok: false, error: 'Username already taken.' });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('lowercases+trims the username, hashes the password, defaults role to member, and revalidates', async () => {
    const r = await createUser(fd({ username: '  Achilleas2  ', name: '  Achilleas  ', password: 'longenough1' }));
    expect(r).toEqual({ ok: true });
    expect(userCreate).toHaveBeenCalledWith({
      username: 'achilleas2',
      name: 'Achilleas',
      passwordHash: 'hashed:longenough1',
      role: 'member',
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('only the exact string "admin" promotes; anything else defaults to member', async () => {
    await createUser(fd({ username: 'promoted', password: 'longenough1', role: 'admin' }));
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
    userCreate.mockClear();
    await createUser(fd({ username: 'notpromoted', password: 'longenough1', role: 'viewer' }));
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ role: 'member' }));
  });
});

describe('deleteUser', () => {
  it('requires admin first', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden'));
    await expect(deleteUser('u1')).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('blocks self-delete before connecting', async () => {
    const r = await deleteUser('admin1');
    expect(r).toEqual({ ok: false, error: 'You cannot delete your own account.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the target does not exist', async () => {
    userFindByIdLean.mockResolvedValue(null);
    const r = await deleteUser('ghost');
    expect(r).toEqual({ ok: false, error: 'User not found.' });
    expect(userDeleteOne).not.toHaveBeenCalled();
  });

  it('blocks deleting the last admin', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(1);
    const r = await deleteUser('u2');
    expect(r).toEqual({ ok: false, error: 'Cannot delete the last admin.' });
    expect(userDeleteOne).not.toHaveBeenCalled();
  });

  it('allows deleting an admin when others remain', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(2);
    const r = await deleteUser('u2');
    expect(r).toEqual({ ok: true });
    expect(userDeleteOne).toHaveBeenCalledWith({ _id: 'u2' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('allows deleting a non-admin without checking the admin count', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u3', role: 'member' });
    const r = await deleteUser('u3');
    expect(r).toEqual({ ok: true });
    expect(userCountDocuments).not.toHaveBeenCalled();
  });
});

describe('setUserRole', () => {
  it('requires admin first', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden'));
    await expect(setUserRole('u1', 'admin')).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown role string before connecting', async () => {
    const r = await setUserRole('u1', 'superadmin' as never);
    expect(r).toEqual({ ok: false, error: 'Unknown role.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the target does not exist', async () => {
    userFindByIdLean.mockResolvedValue(null);
    const r = await setUserRole('ghost', 'member');
    expect(r).toEqual({ ok: false, error: 'User not found.' });
  });

  it('blocks demoting the last admin to member', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(1);
    const r = await setUserRole('u2', 'member');
    expect(r).toEqual({ ok: false, error: 'Cannot demote the last admin.' });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('blocks demoting the last admin to viewer too (not just member)', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(1);
    const r = await setUserRole('u2', 'viewer');
    expect(r).toEqual({ ok: false, error: 'Cannot demote the last admin.' });
  });

  it('allows re-affirming admin on the last admin (next === admin, guard does not trip)', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(1);
    const r = await setUserRole('u2', 'admin');
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'u2' }, { $set: { role: 'admin' } });
  });

  it('allows demoting an admin when others remain, and revalidates', async () => {
    userFindByIdLean.mockResolvedValue({ _id: 'u2', role: 'admin' });
    userCountDocuments.mockResolvedValue(2);
    const r = await setUserRole('u2', 'viewer');
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'u2' }, { $set: { role: 'viewer' } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('changeUserPassword', () => {
  it('requires admin first', async () => {
    requireAdminMock.mockRejectedValue(new Error('Forbidden'));
    await expect(changeUserPassword('u1', 'longenough1')).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short password before connecting', async () => {
    const r = await changeUserPassword('u1', 'short');
    expect(r).toEqual({ ok: false, error: 'Password must be at least 8 characters.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when nothing matched', async () => {
    userUpdateOne.mockResolvedValue({ matchedCount: 0 });
    const r = await changeUserPassword('ghost', 'longenough1');
    expect(r).toEqual({ ok: false, error: 'User not found.' });
  });

  it('hashes and stores the new password, and does NOT revalidate', async () => {
    const r = await changeUserPassword('u1', 'longenough1');
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { passwordHash: 'hashed:longenough1' } });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('changeOwnPassword', () => {
  it('uses requireUser, not requireAdmin (any signed-in role)', async () => {
    await changeOwnPassword('oldpass1', 'newpass12');
    expect(requireUserMock).toHaveBeenCalled();
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short new password before connecting', async () => {
    const r = await changeOwnPassword('oldpass1', 'short');
    expect(r).toEqual({ ok: false, error: 'New password must be at least 8 characters.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('errors when the account is missing', async () => {
    userFindByIdLean.mockResolvedValue(null);
    const r = await changeOwnPassword('oldpass1', 'newpass12');
    expect(r).toEqual({ ok: false, error: 'Current password is wrong.' });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('errors when the old password does not verify', async () => {
    userFindByIdLean.mockResolvedValue({ passwordHash: 'stored-hash' });
    verifyPasswordMock.mockReturnValue(false);
    const r = await changeOwnPassword('wrongold', 'newpass12');
    expect(r).toEqual({ ok: false, error: 'Current password is wrong.' });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('verifies against the stored hash, writes the new hash, and does NOT revalidate', async () => {
    userFindByIdLean.mockResolvedValue({ passwordHash: 'stored-hash' });
    verifyPasswordMock.mockReturnValue(true);
    const r = await changeOwnPassword('correctold', 'newpass12');
    expect(verifyPasswordMock).toHaveBeenCalledWith('correctold', 'stored-hash');
    expect(r).toEqual({ ok: true });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: 'user1' }, { $set: { passwordHash: 'hashed:newpass12' } });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  // P91: a self password change signs out other sessions but keeps THIS device signed in.
  it('bumps the session epoch and re-mints this device cookie with the new epoch', async () => {
    userFindByIdLean.mockResolvedValue({ passwordHash: 'stored-hash' });
    verifyPasswordMock.mockReturnValue(true);
    bumpSessionEpochMock.mockResolvedValue(4);
    await changeOwnPassword('correctold', 'newpass12');
    expect(bumpSessionEpochMock).toHaveBeenCalledWith('user1');
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'member', name: 'Someone', epoch: 4 });
  });
});

describe('changeUserPassword · P91', () => {
  it('bumps the target user epoch so an admin reset invalidates their sessions', async () => {
    await changeUserPassword('u1', 'longenough1');
    expect(bumpSessionEpochMock).toHaveBeenCalledWith('u1');
    // The admin is not that user, so their own cookie is not re-minted here.
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });
});

describe('logoutOtherSessions · P91', () => {
  it('bumps the epoch and re-mints the current device cookie', async () => {
    bumpSessionEpochMock.mockResolvedValue(9);
    const r = await logoutOtherSessions();
    expect(r).toEqual({ ok: true });
    expect(bumpSessionEpochMock).toHaveBeenCalledWith('user1');
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'member', name: 'Someone', epoch: 9 });
  });
});
