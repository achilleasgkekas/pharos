import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `requireSuperadminPage` is the SSR gate in front of the WHOLE /admin console: every page
// under app/admin/** calls it first, and it is the only thing standing between a stranger and
// cross-tenant platform data. Nothing in the suite executed it until now — the admin page
// view-modules are tested as pure functions, and the API-side `requireSuperadmin()` is a
// DIFFERENT function (it returns a NextResponse; this one throws notFound()). So a regression
// here (a branch that stops firing, an ordering slip that hits the DB before authorizing, a
// stale cookie that keeps working after the operator account is deleted) would have passed the
// whole suite green while making /admin reachable — including on a self-hosted install, where
// the console must not exist at all.
//
// Mocked ONLY at the node-only seams: next/navigation, connectDB, the two accountSession
// readers (AUTH_SECRET + the cookie) and the Account model. `saasMode()` and the superadmin
// allowlist helpers (`superadminAllowlist` / `isSuperadminEmail`) run FOR REAL off process.env,
// so the flag ladder and the email matching are pinned as WIRED rather than echoed from a mock.
//
// `notFound` is mocked as a THROWING function because that is the real contract (Next unwinds
// the render). Every "and does no work behind the gate" assertion below depends on that: if the
// production code ever stopped treating notFound as terminal, those assertions would fail.
// `redirect` is mocked purely so it can be asserted NEVER called — a login redirect would
// reveal that the console exists, which the module's ordering deliberately avoids.

/** Message the mocked `notFound()` throws, mirroring Next's terminal unwind. */
const NOT_FOUND = 'NEXT_NOT_FOUND';

const {
  notFoundMock,
  redirectMock,
  connectDBMock,
  accountAuthConfiguredMock,
  getCurrentAccountMock,
  findById,
  select,
  lean,
} = vi.hoisted(() => {
  const lean = vi.fn(async () => ({ _id: 'acc-1' }) as unknown);
  const select = vi.fn((_fields: string) => ({ lean }));
  const findById = vi.fn((_id: unknown) => ({ select }));
  return {
    notFoundMock: vi.fn((): never => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn(),
    connectDBMock: vi.fn(async () => undefined),
    accountAuthConfiguredMock: vi.fn(() => true),
    getCurrentAccountMock: vi.fn(async () => ({ sub: 'acc-1', email: 'op@pharos.dev' }) as unknown),
    findById,
    select,
    lean,
  };
});

vi.mock('next/navigation', () => ({ notFound: notFoundMock, redirect: redirectMock }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/accountSession', () => ({
  accountAuthConfigured: accountAuthConfiguredMock,
  getCurrentAccount: getCurrentAccountMock,
}));
vi.mock('@/models/Account', () => ({ Account: { findById } }));

import { requireSuperadminPage } from './superadminPage';

const ORIGINAL_MODE = process.env.SAAS_MODE;
const ORIGINAL_ALLOWLIST = process.env.SAAS_SUPERADMIN_EMAILS;

/** The happy path: SaaS on, auth configured, viewer is an allowlisted operator that still exists. */
function authorized() {
  process.env.SAAS_MODE = 'on';
  process.env.SAAS_SUPERADMIN_EMAILS = 'op@pharos.dev';
  accountAuthConfiguredMock.mockReturnValue(true);
  getCurrentAccountMock.mockResolvedValue({ sub: 'acc-1', email: 'op@pharos.dev' });
  lean.mockResolvedValue({ _id: 'acc-1' });
}

/** (Re-)arm the notFound mock to throw, since `clearAllMocks` also clears implementations. */
function armNotFound() {
  notFoundMock.mockImplementation((): never => {
    throw new Error(NOT_FOUND);
  });
}

/** Assert the call threw the notFound sentinel (i.e. never returned a value). */
async function expectNotFound() {
  await expect(requireSuperadminPage()).rejects.toThrow(NOT_FOUND);
  expect(notFoundMock).toHaveBeenCalled();
}

/** Nothing behind the gate ran: no cookie read, no DB connect, no account lookup. */
function expectNoWorkDone() {
  expect(connectDBMock).not.toHaveBeenCalled();
  expect(findById).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  armNotFound();
  authorized();
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.SAAS_MODE;
  else process.env.SAAS_MODE = ORIGINAL_MODE;
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.SAAS_SUPERADMIN_EMAILS;
  else process.env.SAAS_SUPERADMIN_EMAILS = ORIGINAL_ALLOWLIST;
});

describe('requireSuperadminPage — deployment gate (self-hosted must not have /admin)', () => {
  it('404s when SAAS_MODE is off — the console does not exist for the OSS app', async () => {
    process.env.SAAS_MODE = 'off';
    await expectNotFound();
    expectNoWorkDone();
  });

  it('404s when SAAS_MODE is unset (the DEFAULT for every self-hosted install)', async () => {
    delete process.env.SAAS_MODE;
    await expectNotFound();
    expectNoWorkDone();
  });

  it('does not even read AUTH_SECRET or the cookie when SaaS mode is off', async () => {
    // Ordering matters beyond privacy: a self-hosted deployment must pay nothing for a route
    // that does not exist for it — no env probe, no cookie parse, no DB round-trip.
    process.env.SAAS_MODE = 'off';
    await expectNotFound();
    expect(accountAuthConfiguredMock).not.toHaveBeenCalled();
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expectNoWorkDone();
  });

  it('honours the real saasMode ladder (1/true/yes all enable, garbage does not)', async () => {
    // saasMode() runs for real here, so this pins the gate to the canonical flag reader
    // instead of a boolean a mock handed back.
    for (const on of ['1', 'true', 'yes', 'ON']) {
      vi.clearAllMocks();
      process.env.SAAS_MODE = on;
      await expect(requireSuperadminPage()).resolves.toEqual({
        sub: 'acc-1',
        email: 'op@pharos.dev',
      });
      expect(notFoundMock).not.toHaveBeenCalled();
    }
    for (const off of ['', 'no', 'enabled', '0']) {
      vi.clearAllMocks();
      armNotFound();
      process.env.SAAS_MODE = off;
      await expectNotFound();
    }
  });

  it('404s (fail closed) when AUTH_SECRET is missing, rather than rendering an unusable console', async () => {
    accountAuthConfiguredMock.mockReturnValue(false);
    await expectNotFound();
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expectNoWorkDone();
  });
});

describe('requireSuperadminPage — allowlist gate (console not enabled)', () => {
  it('404s when no superadmin email is configured, without reading the cookie', async () => {
    // An empty allowlist means the operator never turned the console on. Reading the session
    // first would let ANY signed-in user probe for a 401-vs-404 difference; there is none.
    delete process.env.SAAS_SUPERADMIN_EMAILS;
    await expectNotFound();
    expect(getCurrentAccountMock).not.toHaveBeenCalled();
    expectNoWorkDone();
  });

  it('404s when the allowlist is blank or holds no usable email', async () => {
    for (const raw of ['', '   ', ',,;', 'not-an-email']) {
      vi.clearAllMocks();
      armNotFound();
      process.env.SAAS_SUPERADMIN_EMAILS = raw;
      await expectNotFound();
      expect(getCurrentAccountMock).not.toHaveBeenCalled();
    }
  });

  it('re-reads the allowlist on every call (env is the source of truth, never cached)', async () => {
    await expect(requireSuperadminPage()).resolves.toMatchObject({ email: 'op@pharos.dev' });

    // Operator revokes access by editing env; the very next render must lose the console.
    process.env.SAAS_SUPERADMIN_EMAILS = 'someone-else@pharos.dev';
    await expectNotFound();

    // ...and restoring it brings it back, with no stale negative cached either.
    process.env.SAAS_SUPERADMIN_EMAILS = 'op@pharos.dev';
    await expect(requireSuperadminPage()).resolves.toMatchObject({ email: 'op@pharos.dev' });
  });
});

describe('requireSuperadminPage — viewer gate', () => {
  it('404s when nobody is signed in, and NEVER redirects to a login form', async () => {
    // A login redirect would confirm /admin exists. The module documents this as deliberate:
    // an operator signs in through the ordinary SaaS flow, and only then does /admin resolve.
    getCurrentAccountMock.mockResolvedValue(null);
    await expectNotFound();
    expect(redirectMock).not.toHaveBeenCalled();
    expectNoWorkDone();
  });

  it('404s for a signed-in NON-operator without touching the database', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc-9', email: 'tenant-user@example.com' });
    await expectNotFound();
    expectNoWorkDone();
  });

  it('matches the allowlist case-insensitively and ignoring surrounding whitespace', async () => {
    // Real `isSuperadminEmail` runs, so this pins the normalization as wired: an operator who
    // typed their email with different casing in env must not be locked out of their own console.
    process.env.SAAS_SUPERADMIN_EMAILS = '  OP@Pharos.DEV ';
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc-1', email: 'Op@PHAROS.dev' });
    await expect(requireSuperadminPage()).resolves.toMatchObject({ sub: 'acc-1' });
  });

  it('accepts any allowlist entry, not just the first', async () => {
    process.env.SAAS_SUPERADMIN_EMAILS = 'first@pharos.dev, op@pharos.dev; third@pharos.dev';
    await expect(requireSuperadminPage()).resolves.toMatchObject({ email: 'op@pharos.dev' });
  });

  it('fails closed on a malformed session email (non-string / blank / missing)', async () => {
    for (const email of [undefined, null, '', '   ', 42, {}, ['op@pharos.dev']]) {
      vi.clearAllMocks();
      armNotFound();
      getCurrentAccountMock.mockResolvedValue({ sub: 'acc-1', email });
      await expectNotFound();
      expectNoWorkDone();
    }
  });

  it('does not treat a substring or lookalike email as a match', async () => {
    process.env.SAAS_SUPERADMIN_EMAILS = 'op@pharos.dev';
    for (const email of [
      'op@pharos.dev.attacker.com',
      'xop@pharos.dev',
      'op@pharos.de',
      'op+alias@pharos.dev',
    ]) {
      vi.clearAllMocks();
      armNotFound();
      getCurrentAccountMock.mockResolvedValue({ sub: 'acc-1', email });
      await expectNotFound();
    }
  });
});

describe('requireSuperadminPage — stale-cookie defence in depth', () => {
  it('404s when the account row is gone even though the cookie still verifies', async () => {
    // The signed session outlives the row: a deleted/offboarded operator keeps a valid cookie
    // until it expires. Without this check they would keep full cross-tenant access.
    lean.mockResolvedValue(null);
    await expectNotFound();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('404s for every falsy lookup result (null / undefined)', async () => {
    for (const result of [null, undefined]) {
      vi.clearAllMocks();
      armNotFound();
      lean.mockResolvedValue(result);
      await expectNotFound();
    }
  });

  it('treats any truthy lean() result as existing (Mongoose returns a doc, not a boolean)', async () => {
    // `findById().select('_id').lean()` resolves to `{ _id }` — a `=== true` style check here
    // would 404 every legitimate operator.
    for (const result of [{ _id: 'acc-1' }, {}]) {
      vi.clearAllMocks();
      lean.mockResolvedValue(result);
      await expect(requireSuperadminPage()).resolves.toMatchObject({ sub: 'acc-1' });
      expect(notFoundMock).not.toHaveBeenCalled();
    }
  });

  it('looks the account up by the SESSION SUBJECT, never by the email', async () => {
    getCurrentAccountMock.mockResolvedValue({ sub: 'acc-42', email: 'op@pharos.dev' });
    await requireSuperadminPage();
    expect(findById).toHaveBeenCalledWith('acc-42');
    expect(findById).not.toHaveBeenCalledWith('op@pharos.dev');
  });

  it('projects only _id — an existence probe must not load the password hash', async () => {
    await requireSuperadminPage();
    expect(select).toHaveBeenCalledWith('_id');
  });

  it('connects before querying, exactly once', async () => {
    await requireSuperadminPage();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(connectDBMock.mock.invocationCallOrder[0]).toBeLessThan(
      findById.mock.invocationCallOrder[0],
    );
  });
});

describe('requireSuperadminPage — failures propagate instead of becoming a 404', () => {
  it('propagates a connectDB failure', async () => {
    // A registry outage must surface as an error, not as a 404 that tells the operator their
    // own console does not exist.
    connectDBMock.mockRejectedValueOnce(new Error('registry down'));
    await expect(requireSuperadminPage()).rejects.toThrow('registry down');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('propagates a lookup failure', async () => {
    lean.mockRejectedValueOnce(new Error('mongo timeout'));
    await expect(requireSuperadminPage()).rejects.toThrow('mongo timeout');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('propagates a session-read failure', async () => {
    getCurrentAccountMock.mockRejectedValueOnce(new Error('bad key'));
    await expect(requireSuperadminPage()).rejects.toThrow('bad key');
    expectNoWorkDone();
  });

  it('propagates whatever notFound() throws (the gate is terminal, not swallowed)', async () => {
    process.env.SAAS_MODE = 'off';
    notFoundMock.mockImplementation((): never => {
      throw new Error('unwound');
    });
    await expect(requireSuperadminPage()).rejects.toThrow('unwound');
  });
});

describe('requireSuperadminPage — authorized result', () => {
  it('returns the claims verbatim, by reference, with nothing added or stripped', async () => {
    // The admin shell renders these claims. Returning a rebuilt object would silently drop
    // any future claim (and hide bugs where the gate mutates the session).
    const claims = { sub: 'acc-1', email: 'op@pharos.dev', exp: 1893456000 };
    getCurrentAccountMock.mockResolvedValue(claims);
    const out = await requireSuperadminPage();
    expect(out).toBe(claims);
    expect(Object.keys(out)).toEqual(['sub', 'email', 'exp']);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('does not mutate the session claims', async () => {
    const claims = { sub: 'acc-1', email: 'op@pharos.dev' };
    getCurrentAccountMock.mockResolvedValue(claims);
    await requireSuperadminPage();
    expect(claims).toEqual({ sub: 'acc-1', email: 'op@pharos.dev' });
  });

  it('runs the full ladder once per call with no redundant reads', async () => {
    await requireSuperadminPage();
    expect(accountAuthConfiguredMock).toHaveBeenCalledTimes(1);
    expect(getCurrentAccountMock).toHaveBeenCalledTimes(1);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledTimes(1);
  });
});
