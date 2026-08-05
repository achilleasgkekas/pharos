import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The impure DB wrappers over `User` (beginUserMfaEnrollment/confirmUserMfaEnrollment/
// disableUserMfa/verifyUserMfaLogin/describeUserMfaStatus). The PURE $set builders they call
// (planMfaEnrollStart/planMfaConfirm/planMfaDisable/mfaEnrollRequiresReauth) are already pinned
// by lib/tenancy/mfaStore.test.ts and re-exported/reused here unchanged, so they are not
// re-tested. secretCrypto/totp/recoveryCodes run FOR REAL (deterministic, already unit-tested
// elsewhere) rather than being mocked — same idiom as app/login/actions.test.ts trusting the
// real hashPassword/verifyPassword — so a test failure here means the actual wiring is wrong,
// not a stand-in.

const { userState, userUpdateOne, userFindById } = vi.hoisted(() => {
  const userState: { doc: Record<string, unknown> | null } = { doc: null };
  const userUpdateOne = vi.fn(async (_filter: unknown, _update: unknown) => ({ matchedCount: userState.doc ? 1 : 0 }));
  // findById(...).select(...) is awaited directly in two of the three read paths (no .lean()),
  // and .lean()'d in the third (describeUserMfaStatus) — mirror both call shapes off one mock.
  const userFindById = vi.fn((_id: string) => ({
    select: vi.fn(() => Object.assign(Promise.resolve(userState.doc), { lean: async () => userState.doc })),
  }));
  return { userState, userUpdateOne, userFindById };
});

vi.mock('@/models/User', () => ({ User: { updateOne: userUpdateOne, findById: userFindById } }));

import {
  beginUserMfaEnrollment,
  confirmUserMfaEnrollment,
  disableUserMfa,
  verifyUserMfaLogin,
  describeUserMfaStatus,
} from './userMfaStore';
import { encryptSecret } from './tenancy/secretCrypto';
import { generateTotpSecret, generateTotpCode, verifyTotpCode } from './tenancy/totp';
import { generateRecoveryCodes, hashRecoveryCodes } from './tenancy/recoveryCodes';

const SECRET = 'test-secret-at-least-16-chars-long';
let savedAuthSecret: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  userState.doc = null;
  savedAuthSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
  userUpdateOne.mockImplementation(async () => ({ matchedCount: userState.doc ? 1 : 0 }));
});

afterEach(() => {
  if (savedAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedAuthSecret;
});

describe('beginUserMfaEnrollment', () => {
  it('crypto_unavailable when AUTH_SECRET is not configured — never touches the DB', async () => {
    delete process.env.AUTH_SECRET;
    const res = await beginUserMfaEnrollment('u1', 'ach');
    expect(res).toEqual({ ok: false, reason: 'crypto_unavailable' });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('not_found when no user matches the id', async () => {
    userState.doc = null;
    userUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const res = await beginUserMfaEnrollment('ghost', 'ach');
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  it('success: stores an ENCRYPTED pending secret (never the plaintext) and returns the plaintext secret + otpauth URI once', async () => {
    userState.doc = { _id: 'u1' };
    userUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const res = await beginUserMfaEnrollment('u1', 'ach');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.secret).toMatch(/^[A-Z2-7]{32}$/); // base32 20-byte secret
    expect(res.uri).toContain('otpauth://totp/Pharos%3Aach?');
    expect(res.uri).toContain(res.secret);

    expect(userUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = userUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'u1' });
    const stored = (update as { $set: { mfaPendingSecretEnc: string } }).$set.mfaPendingSecretEnc;
    expect(stored).not.toBe(res.secret); // never plaintext at rest
    expect(stored.startsWith('gcm1$')).toBe(true);
  });
});

describe('confirmUserMfaEnrollment', () => {
  it('not_found when no user matches the id', async () => {
    userState.doc = null;
    const res = await confirmUserMfaEnrollment('ghost', '123456');
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  it('no_pending when the user has no pending secret (nothing to confirm)', async () => {
    userState.doc = { _id: 'u1', mfaPendingSecretEnc: null };
    const res = await confirmUserMfaEnrollment('u1', '123456');
    expect(res).toEqual({ ok: false, reason: 'no_pending' });
  });

  it('invalid_code when the submitted code does not match the pending secret', async () => {
    const secret = generateTotpSecret();
    userState.doc = { _id: 'u1', mfaPendingSecretEnc: encryptSecret(secret) };
    const res = await confirmUserMfaEnrollment('u1', '000000');
    expect(res).toEqual({ ok: false, reason: 'invalid_code' });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('success: activates MFA, stores hashed recovery codes, clears the pending secret, and returns 10 PLAINTEXT codes once', async () => {
    const secret = generateTotpSecret();
    const pendingEnc = encryptSecret(secret);
    userState.doc = { _id: 'u1', mfaPendingSecretEnc: pendingEnc };
    const code = generateTotpCode(secret);
    const res = await confirmUserMfaEnrollment('u1', code);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.recoveryCodes).toHaveLength(10);
    expect(new Set(res.recoveryCodes).size).toBe(10); // all unique

    const [filter, update] = userUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'u1' });
    const set = (update as { $set: Record<string, unknown> }).$set;
    expect(set.mfaEnabled).toBe(true);
    expect(set.mfaSecretEnc).toBe(pendingEnc); // promotes the SAME encrypted secret, not a re-encryption
    expect(set.mfaPendingSecretEnc).toBeNull();
    expect(set.mfaRecoveryHashes).toHaveLength(10);
    // Hashes never contain any recovery code plaintext.
    for (const h of set.mfaRecoveryHashes as string[]) {
      for (const plain of res.recoveryCodes) expect(h).not.toContain(plain);
    }
  });
});

describe('disableUserMfa', () => {
  it('false when no user matches', async () => {
    userUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    expect(await disableUserMfa('ghost')).toBe(false);
  });

  it('true + wipes every MFA field on match', async () => {
    userUpdateOne.mockResolvedValueOnce({ matchedCount: 1 });
    expect(await disableUserMfa('u1')).toBe(true);
    const [filter, update] = userUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'u1' });
    expect(update).toEqual({
      $set: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaRecoveryHashes: [] },
    });
  });
});

describe('verifyUserMfaLogin', () => {
  it('not_found when no user matches', async () => {
    userState.doc = null;
    const res = await verifyUserMfaLogin('ghost', '123456');
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  it('not_enabled when mfaEnabled is false, even with a stored secret', async () => {
    const secret = generateTotpSecret();
    userState.doc = { _id: 'u1', mfaEnabled: false, mfaSecretEnc: encryptSecret(secret), mfaRecoveryHashes: [] };
    const code = generateTotpCode(secret);
    const res = await verifyUserMfaLogin('u1', code);
    expect(res).toEqual({ ok: false, reason: 'not_enabled' });
  });

  it('not_enabled when mfaEnabled is true but mfaSecretEnc is missing (inconsistent state, fail closed)', async () => {
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: null, mfaRecoveryHashes: [] };
    const res = await verifyUserMfaLogin('u1', '123456');
    expect(res).toEqual({ ok: false, reason: 'not_enabled' });
  });

  it('success via a correct TOTP code, usedRecoveryCode: false, no DB write (no state to consume)', async () => {
    const secret = generateTotpSecret();
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: encryptSecret(secret), mfaRecoveryHashes: [] };
    const code = generateTotpCode(secret);
    const res = await verifyUserMfaLogin('u1', code);
    expect(res).toEqual({ ok: true, usedRecoveryCode: false });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it('success via a recovery code: usedRecoveryCode true, the matched hash is spliced out and persisted', async () => {
    const secret = generateTotpSecret();
    const codes = generateRecoveryCodes(3);
    const hashes = hashRecoveryCodes(codes);
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: encryptSecret(secret), mfaRecoveryHashes: hashes };
    const res = await verifyUserMfaLogin('u1', codes[1]);
    expect(res).toEqual({ ok: true, usedRecoveryCode: true });
    expect(userUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = userUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'u1' });
    const remaining = (update as { $set: { mfaRecoveryHashes: string[] } }).$set.mfaRecoveryHashes;
    expect(remaining).toHaveLength(2);
    expect(remaining).not.toContain(hashes[1]);
  });

  it('a spent recovery code cannot be reused (single-use, matches the plan the caller persists)', async () => {
    const secret = generateTotpSecret();
    const codes = generateRecoveryCodes(2);
    const hashes = hashRecoveryCodes(codes);
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: encryptSecret(secret), mfaRecoveryHashes: hashes };
    const first = await verifyUserMfaLogin('u1', codes[0]);
    expect(first.ok).toBe(true);
    // Simulate the caller persisting the spliced list (the mock doesn't auto-apply updateOne).
    userState.doc = { ...userState.doc, mfaRecoveryHashes: [hashes[1]] };
    const second = await verifyUserMfaLogin('u1', codes[0]);
    expect(second).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('invalid_code when neither the TOTP code nor any recovery code match', async () => {
    const secret = generateTotpSecret();
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: encryptSecret(secret), mfaRecoveryHashes: [] };
    const res = await verifyUserMfaLogin('u1', '000000');
    expect(res).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('crypto_unavailable when the stored secret cannot be decrypted (e.g. AUTH_SECRET rotated) and no recovery code matches either', async () => {
    const secret = generateTotpSecret();
    const enc = encryptSecret(secret);
    process.env.AUTH_SECRET = 'a-totally-different-secret-16chars';
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaSecretEnc: enc, mfaRecoveryHashes: [] };
    const res = await verifyUserMfaLogin('u1', '123456');
    expect(res).toEqual({ ok: false, reason: 'crypto_unavailable' });
  });
});

describe('describeUserMfaStatus', () => {
  it('null when no user matches', async () => {
    userState.doc = null;
    expect(await describeUserMfaStatus('ghost')).toBeNull();
  });

  it('reflects enabled/pending/cryptoReady from the stored doc + current AUTH_SECRET', async () => {
    userState.doc = { _id: 'u1', mfaEnabled: true, mfaPendingSecretEnc: null };
    expect(await describeUserMfaStatus('u1')).toEqual({ enabled: true, pending: false, cryptoReady: true });

    userState.doc = { _id: 'u1', mfaEnabled: false, mfaPendingSecretEnc: 'gcm1$a$b$c' };
    expect(await describeUserMfaStatus('u1')).toEqual({ enabled: false, pending: true, cryptoReady: true });
  });

  it('cryptoReady is false without a configured AUTH_SECRET, independent of the stored flags', async () => {
    delete process.env.AUTH_SECRET;
    userState.doc = { _id: 'u1', mfaEnabled: false, mfaPendingSecretEnc: null };
    expect(await describeUserMfaStatus('u1')).toEqual({ enabled: false, pending: false, cryptoReady: false });
  });
});

// verifyTotpCode is exercised indirectly above via the real generateTotpCode/verifyUserMfaLogin
// round-trip; this just pins that the two stay in agreement (defence against a future signature
// drift between the two totp.ts functions this module calls).
describe('generateTotpCode / verifyTotpCode agreement (sanity)', () => {
  it('a freshly generated code always verifies against its own secret', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, generateTotpCode(secret))).toBe(true);
  });
});
