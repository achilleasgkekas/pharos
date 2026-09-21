// MFA (TOTP + recovery codes) storage over the self-hosted `User` doc (P79). Same shape and same
// two-step enrollment (pending → confirmed) as lib/tenancy/mfaStore.ts's SaaS `Account` version —
// this file reuses that module's PURE `plan*`/`mfaEnrollRequiresReauth` builders (they only shape
// a Mongo `$set`, never touch a model) rather than re-deriving them, and reuses the same
// crypto/hashing primitives (lib/tenancy/secretCrypto.ts, totp.ts, recoveryCodes.ts). Only the
// impure DB wrappers below are new, because they target `User` instead of `Account`.
//
// Deliberately a separate file rather than a generic `mfaStore.ts<TModel>`: the two models
// (`User`, `Account`) live in different worlds (self-hosted single DB vs. SaaS tenant/control
// plane) that must never accidentally cross-wire, and the small duplication here is the price of
// keeping that boundary impossible to blur.
import { User } from '@/models/User';
import { encryptSecret, decryptSecret, secretCryptoReady } from './tenancy/secretCrypto';
import { generateTotpSecret, totpUri, verifyTotpCode } from './tenancy/totp';
import { generateRecoveryCodes, hashRecoveryCodes, matchRecoveryCode } from './tenancy/recoveryCodes';
import { planMfaEnrollStart, planMfaConfirm, planMfaDisable, mfaEnrollRequiresReauth } from './mfaPlan';

export { mfaEnrollRequiresReauth };

export type BeginEnrollResult =
  | { ok: true; secret: string; uri: string }
  | { ok: false; reason: 'crypto_unavailable' | 'not_found' };

/**
 * Start (or restart) TOTP enrollment for a self-hosted user: generates a fresh secret, encrypts
 * it at rest as `mfaPendingSecretEnc`, and returns the PLAINTEXT secret + an `otpauth://` URI
 * once — the caller renders it (manual-entry text) and never gets it again from storage. Does
 * NOT touch `mfaEnabled` — the account stays however it was until `confirmUserMfaEnrollment`
 * verifies a real code from an app that actually scanned this secret.
 */
export async function beginUserMfaEnrollment(userId: string, accountLabel: string): Promise<BeginEnrollResult> {
  if (!secretCryptoReady()) return { ok: false, reason: 'crypto_unavailable' };
  const secret = generateTotpSecret();
  const secretEnc = encryptSecret(secret);
  const res = await User.updateOne({ _id: userId }, planMfaEnrollStart(secretEnc));
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
 * pending secret. On any failure the user's MFA state is untouched.
 */
export async function confirmUserMfaEnrollment(userId: string, code: string): Promise<ConfirmEnrollResult> {
  const user = await User.findById(userId).select('_id mfaPendingSecretEnc');
  if (!user) return { ok: false, reason: 'not_found' };
  if (!user.mfaPendingSecretEnc) return { ok: false, reason: 'no_pending' };

  const secret = decryptSecret(user.mfaPendingSecretEnc);
  if (!secret) return { ok: false, reason: 'crypto_unavailable' };
  if (!verifyTotpCode(secret, code)) return { ok: false, reason: 'invalid_code' };

  const recoveryCodes = generateRecoveryCodes();
  const hashes = hashRecoveryCodes(recoveryCodes);
  await User.updateOne({ _id: userId }, planMfaConfirm(user.mfaPendingSecretEnc, hashes));
  return { ok: true, recoveryCodes };
}

/** Disable MFA and wipe every stored secret/recovery-code hash. Returns whether a user matched. */
export async function disableUserMfa(userId: string): Promise<boolean> {
  const res = await User.updateOne({ _id: userId }, planMfaDisable());
  return res.matchedCount > 0;
}

export type VerifyMfaLoginResult =
  | { ok: true; usedRecoveryCode: boolean }
  | { ok: false; reason: 'invalid_code' | 'not_enabled' | 'crypto_unavailable' | 'not_found' };

/**
 * Check a login-time second-factor submission against the user's ACTIVE (confirmed) secret/
 * recovery hashes — never the pending-enrollment ones. Tries the TOTP code first, then falls back
 * to a recovery code. A matched recovery code is immediately spliced out and persisted (single-
 * use — recoveryCodes.ts's matchRecoveryCode contract) so it can never be replayed. On any
 * failure the user's MFA state is left untouched.
 */
export async function verifyUserMfaLogin(userId: string, code: string): Promise<VerifyMfaLoginResult> {
  const user = await User.findById(userId).select('_id mfaEnabled mfaSecretEnc mfaRecoveryHashes');
  if (!user) return { ok: false, reason: 'not_found' };
  if (!user.mfaEnabled || !user.mfaSecretEnc) return { ok: false, reason: 'not_enabled' };

  const secret = decryptSecret(user.mfaSecretEnc);
  if (secret && verifyTotpCode(secret, code)) return { ok: true, usedRecoveryCode: false };

  const hashes = user.mfaRecoveryHashes || [];
  const idx = matchRecoveryCode(code, hashes);
  if (idx !== -1) {
    const remaining = hashes.slice();
    remaining.splice(idx, 1);
    await User.updateOne({ _id: userId }, { $set: { mfaRecoveryHashes: remaining } });
    return { ok: true, usedRecoveryCode: true };
  }

  return secret ? { ok: false, reason: 'invalid_code' } : { ok: false, reason: 'crypto_unavailable' };
}

export type MfaStatus = { enabled: boolean; pending: boolean; cryptoReady: boolean };

/** Current MFA state for the Settings account card: whether it's active, whether an unconfirmed
 *  enrollment is in progress, and whether the server can even run MFA crypto (AUTH_SECRET set). */
export async function describeUserMfaStatus(userId: string): Promise<MfaStatus | null> {
  const user = await User.findById(userId)
    .select('_id mfaEnabled mfaPendingSecretEnc')
    .lean<{ _id: unknown; mfaEnabled?: boolean; mfaPendingSecretEnc?: string | null } | null>();
  if (!user) return null;
  return { enabled: !!user.mfaEnabled, pending: !!user.mfaPendingSecretEnc, cryptoReady: secretCryptoReady() };
}
