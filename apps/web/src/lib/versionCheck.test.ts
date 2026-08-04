import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  appVersion,
  updateCheckRepo,
  releasesUrl,
  parseVersion,
  compareVersions,
  pickLatestVersion,
  isUpdateAvailable,
  checkIsDue,
  fetchLatestVersion,
  UPDATE_CHECK_TTL_MS,
} from './versionCheck';

// P40 — the self-host "a newer image exists" check. What matters is everything this
// REFUSES to say: it must never nag a dev/edge build, never mistake a convenience tag
// (`latest`, `1`, `1.2`) or a pre-release for a version, never trust registry tag order,
// and never surface an error when the instance simply has no way out to the internet.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('appVersion / updateCheckRepo', () => {
  it('falls back to "dev" when the image was not stamped at build time', () => {
    vi.stubEnv('APP_VERSION', '');
    expect(appVersion()).toBe('dev');
  });

  it('uses the build-time stamp when there is one', () => {
    vi.stubEnv('APP_VERSION', '1.4.2');
    expect(appVersion()).toBe('1.4.2');
  });

  it('lets a fork point the check at its own package', () => {
    vi.stubEnv('UPDATE_CHECK_IMAGE', 'someone/their-fork');
    expect(updateCheckRepo()).toBe('someone/their-fork');
    expect(releasesUrl()).toBe('https://github.com/someone/their-fork/releases');
  });
});

describe('parseVersion', () => {
  it('accepts X.Y.Z with or without the v prefix', () => {
    expect(parseVersion('1.4.2')).toEqual({ major: 1, minor: 4, patch: 2 });
    expect(parseVersion('v1.4.2')).toEqual({ major: 1, minor: 4, patch: 2 });
    expect(parseVersion('  1.4.2 ')).toEqual({ major: 1, minor: 4, patch: 2 });
  });

  it('rejects the convenience tags the release workflow also pushes', () => {
    // release.yml publishes {version}, {major}.{minor}, {major}, latest, and edge.
    for (const tag of ['latest', 'edge', '1', '1.4']) expect(parseVersion(tag)).toBeNull();
  });

  it('rejects pre-releases, so an rc never nags someone on stable', () => {
    expect(parseVersion('1.5.0-rc1')).toBeNull();
    expect(parseVersion('1.36.0_55-dev')).toBeNull();
  });

  it('rejects junk instead of guessing', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('main')).toBeNull();
    expect(parseVersion('sha-abc123')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions(parseVersion('2.0.0')!, parseVersion('1.9.9')!)).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('1.10.0')!, parseVersion('1.9.0')!)).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('1.4.3')!, parseVersion('1.4.10')!)).toBeLessThan(0);
    expect(compareVersions(parseVersion('1.4.2')!, parseVersion('1.4.2')!)).toBe(0);
  });
});

describe('pickLatestVersion', () => {
  it('takes the highest version, not the last tag in the list', () => {
    // Registry order is lexical, where "1.9.0" sorts after "1.10.0". Trusting position
    // would report 1.9.0 as the newest release forever.
    expect(pickLatestVersion(['1.10.0', '1.2.0', '1.9.0'])).toBe('1.10.0');
  });

  it('ignores every non-version tag around it', () => {
    expect(pickLatestVersion(['latest', 'edge', '1', '1.4', '1.4.2', 'main'])).toBe('1.4.2');
  });

  it('normalises away the v prefix so the UI shows one shape', () => {
    expect(pickLatestVersion(['v2.0.1'])).toBe('2.0.1');
  });

  it('returns null when nothing in the list is a version', () => {
    expect(pickLatestVersion(['latest', 'edge'])).toBeNull();
    expect(pickLatestVersion([])).toBeNull();
  });
});

describe('isUpdateAvailable', () => {
  it('is true only when the published version is strictly newer', () => {
    expect(isUpdateAvailable('1.4.2', '1.5.0')).toBe(true);
    expect(isUpdateAvailable('1.4.2', '1.4.2')).toBe(false);
    expect(isUpdateAvailable('1.4.2', '1.4.1')).toBe(false);
  });

  it('never nags a build that is not a release', () => {
    // A dev/edge/local build has not "fallen behind" — it may well be ahead.
    expect(isUpdateAvailable('dev', '9.9.9')).toBe(false);
    expect(isUpdateAvailable('edge', '9.9.9')).toBe(false);
  });

  it('says nothing when the check produced no answer', () => {
    expect(isUpdateAvailable('1.4.2', null)).toBe(false);
    expect(isUpdateAvailable('1.4.2', 'latest')).toBe(false);
  });
});

describe('checkIsDue', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  it('is due when nothing was ever checked', () => {
    expect(checkIsDue(null, now)).toBe(true);
    expect(checkIsDue('not a date', now)).toBe(true);
  });

  it('holds off for a day after a check, then allows another', () => {
    expect(checkIsDue(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(checkIsDue(new Date(now.getTime() - UPDATE_CHECK_TTL_MS + 1000), now)).toBe(false);
    expect(checkIsDue(new Date(now.getTime() - UPDATE_CHECK_TTL_MS), now)).toBe(true);
  });
});

describe('fetchLatestVersion', () => {
  function mockFetch(handler: (url: string) => { ok: boolean; body?: unknown }) {
    const fn = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      const r = handler(String(url));
      return { ok: r.ok, json: async () => r.body } as Response;
    });
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('does the anonymous token dance, then reads the tag list', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('/token')
        ? { ok: true, body: { token: 'anon-token' } }
        : { ok: true, body: { tags: ['latest', '1.4.2', '1.10.0', '1.9.0'] } }
    );
    expect(await fetchLatestVersion('owner/pkg')).toBe('1.10.0');

    const [tokenUrl] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toContain('repository%3Aowner%2Fpkg%3Apull');
    const [, tagOpts] = fetchMock.mock.calls[1];
    expect((tagOpts as RequestInit).headers).toMatchObject({ Authorization: 'Bearer anon-token' });
  });

  it('gives up quietly when the registry refuses a token (private package)', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchLatestVersion('owner/private')).toBeNull();
  });

  it('gives up quietly when the tag list is denied', async () => {
    mockFetch((url) => (url.includes('/token') ? { ok: true, body: { token: 't' } } : { ok: false }));
    expect(await fetchLatestVersion('owner/pkg')).toBeNull();
  });

  it('never throws when the instance has no way out to the internet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND ghcr.io'); }));
    await expect(fetchLatestVersion('owner/pkg')).resolves.toBeNull();
  });

  it('stops after one page when the registry returns a short page', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('/token') ? { ok: true, body: { token: 't' } } : { ok: true, body: { tags: ['1.0.0'] } }
    );
    await fetchLatestVersion('owner/pkg');
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + exactly one tag page
  });

  it('keeps paging past a full page, so version 101 is still seen', async () => {
    // A project that ships long enough pushes more than one page of tags. Reading only
    // the first page would silently freeze the "latest version" at whatever it holds.
    const page1 = Array.from({ length: 100 }, (_, i) => `1.0.${i}`);
    const fetchMock = mockFetch((url) => {
      if (url.includes('/token')) return { ok: true, body: { token: 't' } };
      return { ok: true, body: { tags: url.includes('last=') ? ['2.0.0'] : page1 } };
    });
    expect(await fetchLatestVersion('owner/pkg')).toBe('2.0.0');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it('stops paging at the cap instead of looping forever', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => `1.0.${i}`);
    const fetchMock = mockFetch((url) =>
      url.includes('/token') ? { ok: true, body: { token: 't' } } : { ok: true, body: { tags: fullPage } }
    );
    await fetchLatestVersion('owner/pkg');
    expect(fetchMock).toHaveBeenCalledTimes(1 + 5); // token + MAX_TAG_PAGES
  });
});
