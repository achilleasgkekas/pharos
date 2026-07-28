import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `saasPage.ts` is the SSR gate in front of the ENTIRE tenant-facing (saas) segment: the
// segment's own layout.tsx calls `requireSaasUiEnabled()` and 10 of the 13 pages under it call
// `getSaasViewer()`. It is what makes the promise "SAAS_MODE off => the open-source build is
// byte-for-byte unchanged" true at the routing layer, and nothing in the suite executed it
// until now — the (saas) view-modules are tested as pure functions, and the API-side
// `saasAuthGate()` is a DIFFERENT function (it returns a NextResponse; this one throws
// notFound()). A regression here would pass the whole suite green while exposing signup/login
// forms on a self-hosted install, or (the other direction) 404ing the login page of a paying
// customer.
//
// The gate's second job is subtler than the flag: it is the ONLY reason a logged-out visitor
// can see /account/login at all. `getSaasViewer` must return null, not throw and not redirect,
// for anonymous viewers — otherwise the login and signup pages could never render and the
// product would have no way in.
//
// Mocked ONLY at the node-only seams: next/navigation and the two accountSession readers
// (AUTH_SECRET presence + the cookie). `saasMode()` runs FOR REAL off process.env, so the flag
// ladder is pinned as WIRED rather than echoed back from a mock.
//
// `notFound` is mocked as a THROWING function because that is the real contract (Next unwinds
// the render). Every "and does no work behind the gate" assertion depends on that. `redirect`
// is mocked purely so it can be asserted NEVER called: a redirect on the self-hosted app would
// leak that the SaaS segment exists, and a redirect for an anonymous viewer would break login.

/** Message the mocked `notFound()` throws, mirroring Next's terminal unwind. */
const NOT_FOUND = 'NEXT_NOT_FOUND';

const { notFoundMock, redirectMock, accountAuthConfiguredMock, getCurrentAccountMock } =
  vi.hoisted(() => ({
    notFoundMock: vi.fn((): never => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn(),
    accountAuthConfiguredMock: vi.fn(() => true),
    getCurrentAccountMock: vi.fn(
      async () => ({ sub: 'acc-1', email: 'user@example.com' }) as unknown,
    ),
  }));

vi.mock('next/navigation', () => ({ notFound: notFoundMock, redirect: redirectMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({
  accountAuthConfigured: accountAuthConfiguredMock,
  getCurrentAccount: getCurrentAccountMock,
}));

import { requireSaasUiEnabled, getSaasViewer } from './saasPage';

const ORIGINAL_MODE = process.env.SAAS_MODE;

/** The happy path: SaaS on, AUTH_SECRET present, a signed-in viewer. */
function enabled() {
  process.env.SAAS_MODE = 'on';
  accountAuthConfiguredMock.mockReturnValue(true);
  getCurrentAccountMock.mockResolvedValue({ sub: 'acc-1', email: 'user@example.com' });
}

/** (Re-)arm the notFound mock to throw, since `clearAllMocks` also clears implementations. */
function armNotFound() {
  notFoundMock.mockImplementation((): never => {
    throw new Error(NOT_FOUND);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  armNotFound();
  enabled();
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.SAAS_MODE;
  else process.env.SAAS_MODE = ORIGINAL_MODE;
});

describe('requireSaasUiEnabled — deployment gate', () => {
  it('returns (undefined) and does not 404 when SaaS mode is on and auth is configured', () => {
    expect(requireSaasUiEnabled()).toBeUndefined();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('404s when SAAS_MODE is unset — the DEFAULT for every self-hosted install', () => {
    // This single branch is what keeps the OSS build unchanged: with no config at all, the
    // whole (saas) segment must not exist.
    delete process.env.SAAS_MODE;
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('404s when SAAS_MODE is explicitly off', () => {
    process.env.SAAS_MODE = 'off';
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
  });

  it('does not even probe AUTH_SECRET when SaaS mode is off (short-circuit ordering)', () => {
    // A self-hosted deployment must pay nothing for a route that does not exist for it: the
    // `||` short-circuit means no env probe behind the flag. If someone reordered the two
    // checks the gate would still 404, so only this test would notice the regression.
    process.env.SAAS_MODE = 'off';
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
    expect(accountAuthConfiguredMock).not.toHaveBeenCalled();
  });

  it('honours the real saasMode ladder (on/1/true/yes enable, garbage does not)', () => {
    // saasMode() runs for real here, so this pins the gate to the canonical flag reader rather
    // than to a boolean a mock handed back.
    for (const on of ['on', '1', 'true', 'yes', 'ON', 'True', '  yes  ']) {
      vi.clearAllMocks();
      expect(requireSaasUiEnabled()).toBeUndefined();
      expect(notFoundMock).not.toHaveBeenCalled();
    }
    for (const off of ['', '  ', '0', 'no', 'false', 'off', 'enabled', 'saas']) {
      vi.clearAllMocks();
      armNotFound();
      process.env.SAAS_MODE = off;
      expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
    }
  });

  it('404s (fail closed) when AUTH_SECRET is missing, rather than rendering a dead login form', () => {
    // Sign-in can never succeed without the signing secret. Rendering the form anyway would
    // give a paying customer a login page that silently refuses every attempt.
    accountAuthConfiguredMock.mockReturnValue(false);
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('re-reads the flag on every call (env is the source of truth, never cached)', () => {
    expect(requireSaasUiEnabled()).toBeUndefined();

    process.env.SAAS_MODE = 'off';
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);

    // ...and back on again, with no stale negative cached either.
    process.env.SAAS_MODE = 'on';
    expect(requireSaasUiEnabled()).toBeUndefined();
  });

  it('never redirects — a redirect would leak that the segment exists', () => {
    process.env.SAAS_MODE = 'off';
    expect(() => requireSaasUiEnabled()).toThrow(NOT_FOUND);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('propagates a thrown AUTH_SECRET probe instead of collapsing it into a 404', () => {
    // A misconfigured secret store must surface as an error, not as a 404 that tells the
    // operator their own deployment does not exist.
    accountAuthConfiguredMock.mockImplementation(() => {
      throw new Error('secret store unreachable');
    });
    expect(() => requireSaasUiEnabled()).toThrow('secret store unreachable');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe('getSaasViewer — gate first, then read the session', () => {
  it('returns the claims when a valid session cookie is present', async () => {
    await expect(getSaasViewer()).resolves.toEqual({ sub: 'acc-1', email: 'user@example.com' });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('returns null (does NOT throw or redirect) for an anonymous viewer', async () => {
    // This is what lets /account/login and /account/signup render at all. If this branch ever
    // started throwing, the product would have no reachable way in.
    getCurrentAccountMock.mockResolvedValue(null);
    await expect(getSaasViewer()).resolves.toBeNull();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('404s BEFORE parsing any cookie when SaaS mode is off', async () => {
    // Ordering, not just outcome: the self-hosted app must never read a session cookie for a
    // segment that does not exist for it.
    process.env.SAAS_MODE = 'off';
    await expect(getSaasViewer()).rejects.toThrow(NOT_FOUND);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });

  it('404s BEFORE parsing any cookie when AUTH_SECRET is missing', async () => {
    accountAuthConfiguredMock.mockReturnValue(false);
    await expect(getSaasViewer()).rejects.toThrow(NOT_FOUND);
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
  });

  it('applies exactly the same gate as requireSaasUiEnabled across the whole flag ladder', async () => {
    // The two exports must never drift: a page that calls getSaasViewer() has to be as hidden
    // as one that calls requireSaasUiEnabled() directly.
    for (const off of ['', 'off', '0', 'no', 'false']) {
      vi.clearAllMocks();
      armNotFound();
      process.env.SAAS_MODE = off;
      await expect(getSaasViewer()).rejects.toThrow(NOT_FOUND);
    }
    for (const on of ['on', '1', 'true', 'yes']) {
      vi.clearAllMocks();
      process.env.SAAS_MODE = on;
      await expect(getSaasViewer()).resolves.toMatchObject({ sub: 'acc-1' });
    }
  });

  it('returns the claims verbatim by reference, with no mutation or field stripping', async () => {
    // Pages read `viewer.sub` to scope every workspace query; a copy that dropped or rewrote a
    // field would silently mis-scope data. `exp` is optional on AccountClaims and must survive.
    const claims = { sub: 'acc-9', email: 'Owner@Example.COM', exp: 1893456000 };
    getCurrentAccountMock.mockResolvedValue(claims);
    const viewer = await getSaasViewer();
    expect(viewer).toBe(claims);
    expect(viewer).toEqual({ sub: 'acc-9', email: 'Owner@Example.COM', exp: 1893456000 });
  });

  it('does not second-guess the session reader (no email normalisation, no DB confirmation)', async () => {
    // Documented contract: token-only, no DB hit. Pages that need to know the account row still
    // exists confirm separately. Pinning it here means a future DB round-trip added inside the
    // gate would be a deliberate change, not an accidental per-render query on every page.
    getCurrentAccountMock.mockResolvedValue({ sub: 'deleted-account', email: 'gone@example.com' });
    await expect(getSaasViewer()).resolves.toMatchObject({ sub: 'deleted-account' });
    expect(getCurrentAccountMock).toHaveBeenCalledTimes(1);
    expect(getCurrentAccountMock).toHaveBeenCalledWith();
  });

  it('propagates a failing session read instead of masking it as logged-out', async () => {
    // Treating a crypto/verify failure as "anonymous" would quietly sign every viewer out and
    // look like a session bug rather than the infrastructure failure it is.
    getCurrentAccountMock.mockRejectedValue(new Error('jwt verify exploded'));
    await expect(getSaasViewer()).rejects.toThrow('jwt verify exploded');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('re-evaluates the gate per call — flipping SAAS_MODE off mid-process hides it immediately', async () => {
    await expect(getSaasViewer()).resolves.toMatchObject({ sub: 'acc-1' });
    process.env.SAAS_MODE = 'off';
    await expect(getSaasViewer()).rejects.toThrow(NOT_FOUND);
  });
});
