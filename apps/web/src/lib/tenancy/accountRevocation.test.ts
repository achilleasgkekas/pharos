import { describe, it, expect, vi, beforeEach } from 'vitest';

// #182/#193 — "sign out everywhere" for a HOSTED account.
//
// The account cookie was token-only: a valid signature was the whole answer, so nothing the
// server did could take a session away before it expired on its own — days later. That made a
// password reset, the one flow you use precisely because someone else may be holding your
// session, leave that session working with the new password in place.
//
// The revocation is one counter compared on read. What is pinned here is exactly that
// comparison, plus the two policy calls around it: what happens to a token minted before the
// counter existed, and what happens when the control plane cannot answer.
//
// `next/headers` and the Account model are the seams; the claims/verify path is mocked because
// this file is about the epoch decision, not about JWT verification (accountSession.test.ts
// covers that).
const { cookieValue, verifyMock, findByIdSelect, findByIdLean, signMock, cookieSet } = vi.hoisted(() => ({
  cookieValue: { token: 'a-token' as string | undefined },
  verifyMock: vi.fn(),
  findByIdSelect: vi.fn(),
  findByIdLean: vi.fn(),
  signMock: vi.fn(async (claims: unknown) => `signed:${JSON.stringify(claims)}`),
  cookieSet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (_name: string) => (cookieValue.token === undefined ? undefined : { value: cookieValue.token }),
    set: cookieSet,
    delete: vi.fn(),
  }),
}));
vi.mock('./accountToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./accountToken')>()),
  verifyAccountToken: verifyMock,
  signAccountToken: signMock,
}));
vi.mock('../db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/Account', () => ({
  Account: { findById: (...a: unknown[]) => findByIdSelect(...a) },
}));

import { getCurrentAccount, setAccountCookie } from './accountSession';

/** The stored counter the control plane would answer with. */
function storedEpoch(value: number | undefined | Error) {
  findByIdSelect.mockReturnValue({ select: () => ({ lean: findByIdLean }) });
  if (value instanceof Error) findByIdLean.mockRejectedValue(value);
  else findByIdLean.mockResolvedValue(value === undefined ? null : { sessionEpoch: value });
}

const claims = (epoch?: number) => ({ sub: 'acc1', email: 'a@example.com', ...(epoch === undefined ? {} : { epoch }) });

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue.token = 'a-token';
  verifyMock.mockResolvedValue(claims(2));
  storedEpoch(2);
});

describe('getCurrentAccount — a hosted session can be revoked', () => {
  it('accepts a token whose epoch matches the stored counter', async () => {
    expect(await getCurrentAccount()).toMatchObject({ sub: 'acc1' });
  });

  it('rejects a token minted before the counter was bumped — this is the revocation', async () => {
    verifyMock.mockResolvedValue(claims(2));
    storedEpoch(3);
    expect(await getCurrentAccount()).toBeNull();
  });

  it('rejects a token from the FUTURE too — a mismatch either way is not this account’s session', async () => {
    verifyMock.mockResolvedValue(claims(9));
    storedEpoch(3);
    expect(await getCurrentAccount()).toBeNull();
  });

  // Tokens minted before this shipped carry no epoch. They must keep working — logging every
  // customer out on deploy is not a security win — and they must still be revocable.
  it('treats a pre-#182 token as epoch 0: valid until the first bump, dead after it', async () => {
    verifyMock.mockResolvedValue(claims(undefined));
    storedEpoch(0);
    expect(await getCurrentAccount()).toMatchObject({ sub: 'acc1' });

    storedEpoch(1);
    expect(await getCurrentAccount()).toBeNull();
  });

  it('an account row that no longer exists reads as 0, so its old tokens do not survive a bump', async () => {
    verifyMock.mockResolvedValue(claims(4));
    storedEpoch(undefined); // findById → null
    expect(await getCurrentAccount()).toBeNull();
  });

  it('no cookie, or one that fails verification, is still just "logged out" — no query is made', async () => {
    verifyMock.mockResolvedValue(null);
    expect(await getCurrentAccount()).toBeNull();
    expect(findByIdSelect).not.toHaveBeenCalled();
  });

  // The opposite call to the self-hosted `getCurrentUser`, on purpose: there, a local Mongo
  // hiccup must not lock the owner out of their own house. Here the control plane is already
  // load-bearing for the same request (the workspace membership is read through it), so failing
  // open would not keep anyone working — it would only revive revoked sessions during an outage.
  it('fails CLOSED when the control plane cannot answer, after one retry', async () => {
    storedEpoch(new Error('control plane down'));
    expect(await getCurrentAccount()).toBeNull();
    expect(findByIdLean).toHaveBeenCalledTimes(2);
  });

  it('a single blip is absorbed by that retry', async () => {
    findByIdSelect.mockReturnValue({ select: () => ({ lean: findByIdLean }) });
    findByIdLean.mockRejectedValueOnce(new Error('one blip')).mockResolvedValue({ sessionEpoch: 2 });
    expect(await getCurrentAccount()).toMatchObject({ sub: 'acc1' });
  });
});

describe('setAccountCookie — every new session is bound to the counter as it stands', () => {
  it('embeds the account’s current epoch when the caller does not state one', async () => {
    storedEpoch(5);
    await setAccountCookie({ sub: 'acc1', email: 'a@example.com' });
    expect(signMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'a@example.com', epoch: 5 });
  });

  it('honours an explicit epoch — how the device that just changed its password stays signed in', async () => {
    storedEpoch(5);
    await setAccountCookie({ sub: 'acc1', email: 'a@example.com', epoch: 6 });
    expect(signMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'a@example.com', epoch: 6 });
    expect(findByIdSelect).not.toHaveBeenCalled(); // told the answer, no need to ask
  });

  it('mints without an epoch rather than failing the login when the lookup throws', async () => {
    storedEpoch(new Error('control plane down'));
    await setAccountCookie({ sub: 'acc1', email: 'a@example.com' });
    expect(signMock).toHaveBeenCalledWith({ sub: 'acc1', email: 'a@example.com', epoch: undefined });
    expect(cookieSet).toHaveBeenCalled();
  });
});
