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
 * PURE: whether beginning or restarting MFA enrollment must re-verify the
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

