import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/setup/actions.ts is the first-run onboarding wizard (create the first admin, then
// currency/VAT, then AI provider) — never directly unit-tested before. Mocks only the true
// I/O seams: connectDB, the User/AppConfig models, and the cookie/session/cache-invalidation
// side effects. `hashPassword`/`verifyPassword` (lib/auth.ts) run FOR REAL — both are pure,
// deterministic, and already fully pinned in lib/auth.test.ts, so exercising the real
// implementation here proves createFirstAdmin actually stores a hash that the real
// verifyPassword accepts, instead of a hand-rolled stand-in. `setSessionCookie`/`requireAdmin`
// are mocked (they touch next/headers cookies() / redirect(), a true side-effect boundary).
// `saveAiConfig` (app/settings/actions.ts) is mocked too — a cross-module server action with
// its own dedicated coverage elsewhere; setup/actions.ts just delegates to it.
//
// Behaviour pinned:
//  - createFirstAdmin: refuses once ANY user exists ("Setup already completed."), validates
//    username length (>=2) and charset ([a-z0-9._-]) AFTER lowercasing, password length (>=8)
//    and password===confirm, BEFORE ever calling User.create; on success the stored
//    passwordHash round-trips through the real verifyPassword, role is hardcoded 'admin', and
//    the session cookie name falls back to the username when no display name was given.
//  - saveSetupBasics: requires admin, defaults currency to EUR / uppercases a given code, and
//    clamps VAT into [0,100] (NaN/blank input falls back to 24), then invalidates the cached
//    app settings.
//  - saveSetupAi: requires admin, delegates entirely to saveAiConfig, then flips
//    aiEnabled:true and invalidates the AI config cache.
//  - finishWithoutAi: requires admin, flips aiEnabled:false, invalidates the AI config cache.

const {
  connectDBMock,
  userCountDocuments,
  userCreate,
  appConfigUpdateOne,
  setSessionCookieMock,
  requireAdminMock,
  invalidateAiConfigCacheMock,
  invalidateAppSettingsMock,
  saveAiConfigMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  userCountDocuments: vi.fn(async () => 0),
  userCreate: vi.fn(async (doc: Record<string, unknown>) => ({ _id: 'user1', ...doc })),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({})),
  setSessionCookieMock: vi.fn(async (_claims: Record<string, unknown>) => {}),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  invalidateAiConfigCacheMock: vi.fn(),
  invalidateAppSettingsMock: vi.fn(),
  saveAiConfigMock: vi.fn(async (_formData: FormData) => ({ ok: true })),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({
  User: {
    countDocuments: userCountDocuments,
    create: userCreate,
  },
}));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: { updateOne: appConfigUpdateOne },
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, setSessionCookie: setSessionCookieMock, requireAdmin: requireAdminMock };
});
vi.mock('@/lib/aiConfig', () => ({ invalidateAiConfigCache: invalidateAiConfigCacheMock }));
vi.mock('@/lib/appSettings', () => ({ invalidateAppSettings: invalidateAppSettingsMock , invalidateAppSettingsForRequest: vi.fn(async () => {})}));
vi.mock('@/app/settings/actions', () => ({ saveAiConfig: saveAiConfigMock }));

import { createFirstAdmin, saveSetupBasics, saveSetupAi, finishWithoutAi } from './actions';
import { verifyPassword } from '@/lib/auth';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  userCountDocuments.mockImplementation(async () => 0);
  userCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: 'user1', ...doc }));
  appConfigUpdateOne.mockImplementation(async () => ({}));
  setSessionCookieMock.mockImplementation(async () => {});
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  invalidateAiConfigCacheMock.mockImplementation(() => undefined);
  invalidateAppSettingsMock.mockImplementation(() => undefined);
  saveAiConfigMock.mockImplementation(async () => ({ ok: true }));
});

describe('createFirstAdmin', () => {
  it('refuses when a user already exists, before touching any of the form fields', async () => {
    userCountDocuments.mockResolvedValueOnce(1);
    const res = await createFirstAdmin(formData({ username: 'ach', password: 'longenough1', confirm: 'longenough1' }));
    expect(res).toEqual({ ok: false, error: 'Setup already completed.' });
    expect(userCreate).not.toHaveBeenCalled();
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it('rejects a username shorter than 2 characters', async () => {
    const res = await createFirstAdmin(formData({ username: 'a', password: 'longenough1', confirm: 'longenough1' }));
    expect(res).toEqual({ ok: false, error: 'Username must be at least 2 characters.' });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rejects a username with characters outside [a-z0-9._-] (checked after lowercasing)', async () => {
    const res = await createFirstAdmin(formData({ username: 'ach illeas', password: 'longenough1', confirm: 'longenough1' }));
    expect(res).toEqual({ ok: false, error: 'Username can use letters, numbers, . _ - only.' });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('accepts an uppercase/mixed-case username by lowercasing it first', async () => {
    const res = await createFirstAdmin(formData({ username: 'Achilleas', password: 'longenough1', confirm: 'longenough1' }));
    expect(res).toEqual({ ok: true });
    expect(userCreate.mock.calls[0][0].username).toBe('achilleas');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await createFirstAdmin(formData({ username: 'ach', password: 'short1', confirm: 'short1' }));
    expect(res).toEqual({ ok: false, error: 'Password must be at least 8 characters.' });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rejects a password/confirm mismatch', async () => {
    const res = await createFirstAdmin(formData({ username: 'ach', password: 'longenough1', confirm: 'longenough2' }));
    expect(res).toEqual({ ok: false, error: 'Passwords do not match.' });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('on success: stores a passwordHash the real verifyPassword accepts, role is admin, session cookie set with sub/role/name', async () => {
    const res = await createFirstAdmin(
      formData({ username: 'ach', name: 'Achilleas', password: 'correct horse battery', confirm: 'correct horse battery' })
    );
    expect(res).toEqual({ ok: true });
    expect(userCreate).toHaveBeenCalledTimes(1);
    const doc = userCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.username).toBe('ach');
    expect(doc.name).toBe('Achilleas');
    expect(doc.role).toBe('admin');
    expect(verifyPassword('correct horse battery', doc.passwordHash as string)).toBe(true);
    expect(verifyPassword('wrong password', doc.passwordHash as string)).toBe(false);
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'admin', name: 'Achilleas' });
  });

  it('falls back the session-cookie name to the username when no display name was given', async () => {
    await createFirstAdmin(formData({ username: 'ach', password: 'longenough1', confirm: 'longenough1' }));
    expect(setSessionCookieMock).toHaveBeenCalledWith({ sub: 'user1', role: 'admin', name: 'ach' });
  });
});

describe('saveSetupBasics', () => {
  it('requires admin before writing anything', async () => {
    await saveSetupBasics('USD', 20);
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
  });

  it('uppercases a given currency code and clamps a valid VAT through unchanged', async () => {
    await saveSetupBasics('usd', 13);
    expect(appConfigUpdateOne).toHaveBeenCalledWith(
      { key: 'singleton' },
      { $set: { currency: 'USD', defaultVatRate: 13 } },
      { upsert: true }
    );
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('defaults a blank currency to EUR', async () => {
    await saveSetupBasics('', 24);
    expect(appConfigUpdateOne.mock.calls[0][1]).toEqual({ $set: { currency: 'EUR', defaultVatRate: 24 } });
  });

  it('clamps a negative VAT up to 0', async () => {
    await saveSetupBasics('EUR', -5);
    expect(appConfigUpdateOne.mock.calls[0][1]).toEqual({ $set: { currency: 'EUR', defaultVatRate: 0 } });
  });

  it('clamps a VAT above 100 down to 100', async () => {
    await saveSetupBasics('EUR', 250);
    expect(appConfigUpdateOne.mock.calls[0][1]).toEqual({ $set: { currency: 'EUR', defaultVatRate: 100 } });
  });

  it('falls back a NaN VAT to the 24% default', async () => {
    await saveSetupBasics('EUR', Number('not-a-number'));
    expect(appConfigUpdateOne.mock.calls[0][1]).toEqual({ $set: { currency: 'EUR', defaultVatRate: 24 } });
  });
});

describe('saveSetupAi', () => {
  it('requires admin, delegates the whole form to saveAiConfig, then enables AI and invalidates its cache', async () => {
    const fd = formData({ provider: 'anthropic' });
    const res = await saveSetupAi(fd);
    expect(res).toEqual({ ok: true });
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(saveAiConfigMock).toHaveBeenCalledWith(fd);
    expect(appConfigUpdateOne).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { aiEnabled: true } }, { upsert: true });
    expect(invalidateAiConfigCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe('finishWithoutAi', () => {
  it('requires admin, disables AI and invalidates its cache', async () => {
    const res = await finishWithoutAi();
    expect(res).toEqual({ ok: true });
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(appConfigUpdateOne).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { aiEnabled: false } }, { upsert: true });
    expect(invalidateAiConfigCacheMock).toHaveBeenCalledTimes(1);
  });
});
