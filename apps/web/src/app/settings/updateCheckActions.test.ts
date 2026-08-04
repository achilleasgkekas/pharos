import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// P40 — the server half of the update check. The comparison rules live in
// lib/versionCheck.test.ts; what is pinned HERE is the caching and failure policy, which
// is where a well-meaning update check turns into a nuisance:
//  - SaaS never checks (nothing a customer could pull);
//  - the opt-out is honoured before any network call happens;
//  - at most one registry call per 24h, and the "Check now" button bypasses that;
//  - a FAILED check still backs off for a day but never wipes the last real answer;
//  - a database failure degrades to "here is your version" instead of an error.

const { connectDBMock, findOneLean, updateOneMock, fetchLatestMock, saasModeMock, revalidatePathMock } = vi.hoisted(
  () => ({
    connectDBMock: vi.fn(async () => {}),
    findOneLean: vi.fn(async () => ({}) as Record<string, any> | null),
    updateOneMock: vi.fn(async (_f: any, _u: any, _o?: any) => ({})),
    fetchLatestMock: vi.fn(async () => null as string | null),
    saasModeMock: vi.fn(() => false),
    revalidatePathMock: vi.fn(),
  })
);

const configModel = {
  findOne: () => ({ lean: findOneLean }),
  updateOne: updateOneMock,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: {} }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => configModel }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: () => saasModeMock() }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));
vi.mock('@/lib/versionCheck', async (importOriginal) => {
  // Keep the REAL pure helpers (parse/compare/isUpdateAvailable/checkIsDue) so this file
  // exercises the actual policy; only the network call is stubbed.
  const real = await importOriginal<typeof import('@/lib/versionCheck')>();
  return { ...real, fetchLatestVersion: (...a: unknown[]) => fetchLatestMock(...(a as [])) };
});

import { getUpdateStatus, setUpdateCheckEnabled } from './updateCheckActions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_VERSION', '1.4.2');
  saasModeMock.mockReturnValue(false);
  findOneLean.mockResolvedValue({});
  fetchLatestMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getUpdateStatus', () => {
  it('does not check at all on the managed SaaS', async () => {
    saasModeMock.mockReturnValue(true);
    const s = await getUpdateStatus();
    expect(s.supported).toBe(false);
    expect(s.version).toBe('1.4.2');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(fetchLatestMock).not.toHaveBeenCalled();
  });

  it('honours the opt-out BEFORE making any outbound call', async () => {
    findOneLean.mockResolvedValue({ updateCheckEnabled: false });
    const s = await getUpdateStatus();
    expect(s.enabled).toBe(false);
    expect(s.updateAvailable).toBe(false);
    expect(fetchLatestMock).not.toHaveBeenCalled();
  });

  it('checks on a fresh instance that has never checked, and reports a newer release', async () => {
    findOneLean.mockResolvedValue({});
    fetchLatestMock.mockResolvedValue('1.5.0');
    const s = await getUpdateStatus();
    expect(fetchLatestMock).toHaveBeenCalledTimes(1);
    expect(s.latest).toBe('1.5.0');
    expect(s.updateAvailable).toBe(true);
    expect(s.releasesUrl).toContain('/releases');
  });

  it('says nothing is available when the published version is the one running', async () => {
    fetchLatestMock.mockResolvedValue('1.4.2');
    const s = await getUpdateStatus();
    expect(s.updateAvailable).toBe(false);
  });

  it('serves the cached answer instead of calling the registry on every settings load', async () => {
    findOneLean.mockResolvedValue({ updateCheckAt: new Date(), updateCheckLatest: '1.5.0' });
    const s = await getUpdateStatus();
    expect(fetchLatestMock).not.toHaveBeenCalled();
    expect(s.latest).toBe('1.5.0');
    expect(s.updateAvailable).toBe(true);
  });

  it('re-checks once the cached answer is a day old', async () => {
    findOneLean.mockResolvedValue({
      updateCheckAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      updateCheckLatest: '1.5.0',
    });
    fetchLatestMock.mockResolvedValue('1.6.0');
    const s = await getUpdateStatus();
    expect(fetchLatestMock).toHaveBeenCalledTimes(1);
    expect(s.latest).toBe('1.6.0');
  });

  it('lets "Check now" bypass the cache', async () => {
    findOneLean.mockResolvedValue({ updateCheckAt: new Date(), updateCheckLatest: '1.5.0' });
    fetchLatestMock.mockResolvedValue('1.6.0');
    const s = await getUpdateStatus(true);
    expect(fetchLatestMock).toHaveBeenCalledTimes(1);
    expect(s.latest).toBe('1.6.0');
  });

  it('backs off after a FAILED check but keeps the last real answer', async () => {
    // A firewalled instance must not call out on every page load, and must not lose the
    // answer it already had just because today's attempt could not get through.
    findOneLean.mockResolvedValue({ updateCheckAt: null, updateCheckLatest: '1.5.0' });
    fetchLatestMock.mockResolvedValue(null);
    const s = await getUpdateStatus();

    const set = updateOneMock.mock.calls[0][1].$set;
    expect(set.updateCheckAt).toBeInstanceOf(Date); // attempt stamped → backs off
    expect(set).not.toHaveProperty('updateCheckLatest'); // previous answer untouched
    expect(s.latest).toBe('1.5.0');
  });

  it('never nags a build that was not stamped at release time', async () => {
    vi.stubEnv('APP_VERSION', '');
    fetchLatestMock.mockResolvedValue('9.9.9');
    const s = await getUpdateStatus();
    expect(s.version).toBe('dev');
    expect(s.updateAvailable).toBe(false);
  });

  it('degrades to the plain version row when the database is unreachable', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('no mongo'));
    const s = await getUpdateStatus();
    expect(s.version).toBe('1.4.2');
    expect(s.updateAvailable).toBe(false);
  });
});

describe('setUpdateCheckEnabled', () => {
  it('turning it off also clears the cached answer, so nothing lingers in the UI', async () => {
    expect(await setUpdateCheckEnabled(false)).toEqual({ ok: true });
    expect(updateOneMock.mock.calls[0][1].$set).toMatchObject({
      updateCheckEnabled: false,
      updateCheckLatest: '',
      updateCheckAt: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('turning it back on does not fabricate a cached answer', async () => {
    await setUpdateCheckEnabled(true);
    const set = updateOneMock.mock.calls[0][1].$set;
    expect(set).toEqual({ updateCheckEnabled: true });
  });

  it('reports failure instead of throwing at the client', async () => {
    updateOneMock.mockRejectedValueOnce(new Error('write failed'));
    expect(await setUpdateCheckEnabled(true)).toEqual({ ok: false });
  });
});
