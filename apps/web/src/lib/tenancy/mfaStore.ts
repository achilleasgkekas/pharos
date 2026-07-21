// MFA (TOTP + recovery codes) STORAGE over the Account doc (TODO §9 "Accounts & auth
// (web-grade)": "MFA (TOTP + recovery codes)"). This is the layer totp.ts + recoveryCodes.ts
// were scaffolded for (increment 79): it persists an encrypted TOTP secret + hashed recovery
// codes on `Account`, using a two-step enrollment (pending → confirmed) so a half-finished
// setup can never silently enable MFA on an account.
//
// Mirrors lib/billing/byoKeyStore.ts's shape deliberately: PURE `plan*` builders (unit-tested
// without a DB) + thin impure wrappers that are the only node paths touching Mongo. The secret
// envelope reuses lib/tenancy/secretCrypto (AES-256-GCM, same as the tenant BYO AI key) —
// plaintext never persists. Recovery codes reuse lib/auth.ts's scrypt hashing via
// recoveryCodes.ts, same as account passwords.
//
// SCOPE (increment 80a): storage + enrollment/disable only. NOT wired into the login flow yet —
// that is a separate, riskier increment (touches shared, security-critical plumbing) done once
// this layer is proven. Until wired, `mfaEnabled` has no effect on `POST /api/saas/auth/login`.
//
// OSS PARITY: only the SaaS Account path uses this. The self-hosted app's `User` model has no
// MFA fields and never calls this module.
import { Account } from '@/models/Account';
import { encryptSecret, decryptSecret, secretCryptoReady } from './secretCrypto';
import { generateTotpSecret, totpUri, verifyTotpCode } from './totp';
import { generateRecoveryCodes, hashRecoveryCodes, matchRecoveryCode } from './recoveryCodes';

/** Mongo `$set` that stashes a freshly generated (not yet confirmed) TOTP secret. */
export type MfaEnrollStartUpdate = { $set: { mfaPendingSecretEnc: string } };
/** Mongo `$set` that activates MFA: promotes the pending secret to confirmed + stores recovery-code hashes. */
export type MfaConfirmUpdate = {
  $set: { mfaEnabled: true; mfaSecretEnc: string; mfaRecoveryHashes: string[]; mfaPendingSecretEnc: null };
};
/** Mongo `$set` that turns MFA fully off and clears every stored secret/code. */
export type MfaDisableUpdate = {
  $set: { mfaEnabled: false; mfaSecretEnc: null; mfaPendingSecretEnc: null; mfaRecoveryHashes: string[] };
};

/** PURE: the update that stores an encrypted pending secret (overwrites any prior pending one — starting a new enrollment abandons an unfinished one, which is safe since it was never activated). */
export function planMfaEnrollStart(secretEnc: string): MfaEnrollStartUpdate {
  return { $set: { mfaPendingSecretEnc: secretEnc } };
}

/** PURE: the update that promotes a confirmed pending secret to active + stores hashed recovery codes. */
export function planMfaConfirm(secretEnc: string, recoveryHashes: string[]): MfaConfirmUpdate {
  return {
    $set: { mfaEnabled: true, mfaSecretEnc: secretEnc, mfaRecoveryHashes: recoveryHashes, mfaPendingSecretEnc: null },
  };
}

/** PURE: the update that disables MFA and wipes every stored secret/code (nothing left to leak or reuse). */
export function planMfaDisable(): MfaDisableUpdate {
  return { $set: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaRecoveryHashes: [] } };
}

/**
 * PURE: whether `POST /api/saas/account/mfa` (begin/restart enrollment) must re-verify the
 * caller's password before it may overwrite `mfaPendingSecretEnc`. True whenever MFA is
 * already active on the account — mirrors the `DELETE` (disable) path's re-auth requirement, so
 * a hijacked session alone can't silently replace an already-enrolled factor with one the
 * attacker controls. False only for a brand-new (never-enabled) enrollment, where there is
 * nothing yet to protect. (Flagged by review 2026-07-20, WEB_DEBT.md P2/S — the DELETE handler
 * already re-checked the password correctly; POST/confirm did not.)
 */
export function mfaEnrollRequiresReauth(mfaEnabled: boolean): boolean {
  return mfaEnabled;
}

export type BeginEnrollResult =
  | { ok: true; secret: string; uri: string }
  | { ok: false; reason: 'crypto_unavailable' | 'not_found' };

/**
 * Start (or restart) TOTP enrollment for an account: generates a fresh secret, encrypts it at
 * rest as `mfaPendingSecretEnc`, and returns the PLAINTEXT secret + an `otpauth://` URI once —
 * the caller renders it (QR code / manual-entry text) and never gets it again from storage.
 * Does NOT touch `mfaEnabled` — the account stays however it was until `confirmMfaEnrollment`
 * verifies a real code from an app that actually scanned this secret.
 */
export async function beginMfaEnrollment(accountId: string, accountLabel: string): Promise<BeginEnrollResult> {
  if (!secretCryptoReady()) return { ok: false, reason: 'crypto_unavailable' };
  const secret = generateTotpSecret();
  const secretEnc = encryptSecret(secret);
  const res = await Account.updateOne({ _id: accountId }, planMfaEnrollStart(secretEnc));
  if (res.matchedCount === 0) return { ok: false, reason: 'not_found' };
  return { ok: true, secret, uri: totpUri(secret, accountLabel) };
}

export type ConfirmEnrollResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; reason: 'no_pending' | 'invalid_code' | 'crypto_unavailable' | 'not_found' };

/**
 * Confirm a pending enrollment with the first code from the user's authenticator app. On
 * success: activates MFA, mints a fresh batch of recovery codes (returned PLAINTEXT once — the
 * caller must show them to the user immediately, only the hashes persist), and clears the
 * pending secret. On any failure the account's MFA state is untouched (still whatever it was
 * before this call — no partial activation).
 */
export async function confirmMfaEnrollment(accountId: string, code: string): Promise<ConfirmEnrollResult> {
  const account = await Account.findById(accountId).select('_id mfaPendingSecretEnc');
  if (!account) return { ok: false, reason: 'not_found' };
  if (!account.mfaPendingSecretEnc) return { ok: false, reason: 'no_pending' };

  const secret = decryptSecret(account.mfaPendingSecretEnc);
  if (!secret) return { ok: false, reason: 'crypto_unavailable' };
  if (!verifyTotpCode(secret, code)) return { ok: false, reason: 'invalid_code' };

  const recoveryCodes = generateRecoveryCodes();
  const hashes = hashRecoveryCodes(recoveryCodes);
  await Account.updateOne({ _id: accountId }, planMfaConfirm(account.mfaPendingSecretEnc, hashes));
  return { ok: true, recoveryCodes };
}

/** Disable MFA and wipe every stored secret/recovery-code hash. Returns whether an account matched. */
export async function disableMfa(accountId: string): Promise<boolean> {
  const res = await Account.updateOne({ _id: accountId }, planMfaDisable());
  return res.matchedCount > 0;
}

export type VerifyMfaLoginResult =
  | { ok: true; usedRecoveryCode: boolean }
  | { ok: false; reason: 'invalid_code' | 'not_enabled' | 'crypto_unavailable' | 'not_found' };

/**
 * Check a login-time second-factor submission against the account's ACTIVE (confirmed) secret/
 * recovery hashes — never the pending-enrollment ones (increment 83, the login-flow wiring this
 * module's doc-comment flagged as a separate, riskier step). Tries the TOTP code first, then
 * falls back to a recovery code. A matched recovery code is immediately spliced out and
 * persisted (single-use — `recoveryCodes.ts`'s `matchRecoveryCode` contract) so it can never be
 * replayed. On any failure the account's MFA state is left untouched.
 */
export async function verifyMfaLogin(accountId: string, code: string): Promise<VerifyMfaLoginResult> {
  const account = await Account.findById(accountId).select('_id mfaEnabled mfaSecretEnc mfaRecoveryHashes');
  if (!account) return { ok: false, reason: 'not_found' };
  if (!account.mfaEnabled || !account.mfaSecretEnc) return { ok: false, reason: 'not_enabled' };

  const secret = decryptSecret(account.mfaSecretEnc);
  if (secret && verifyTotpCode(secret, code)) return { ok: true, usedRecoveryCode: false };

  const hashes = account.mfaRecoveryHashes || [];
  const idx = matchRecoveryCode(code, hashes);
  if (idx !== -1) {
    const remaining = hashes.slice();
    remaining.splice(idx, 1);
    await Account.updateOne({ _id: accountId }, { $set: { mfaRecoveryHashes: remaining } });
    return { ok: true, usedRecoveryCode: true };
  }

  return secret ? { ok: false, reason: 'invalid_code' } : { ok: false, reason: 'crypto_unavailable' };
}

export type MfaStatus = { enabled: boolean; pending: boolean };

/** Current MFA state for a settings UI: whether it's active, and whether an unconfirmed enrollment is in progress. */
export async function describeMfaStatus(accountId: string): Promise<MfaStatus | null> {
  const account = await Account.findById(accountId)
    .select('_id mfaEnabled mfaPendingSecretEnc')
    .lean<{ _id: unknown; mfaEnabled?: boolean; mfaPendingSecretEnc?: string | null } | null>();
  if (!account) return null;
  return { enabled: !!account.mfaEnabled, pending: !!account.mfaPendingSecretEnc };
}
