import { describe, it, expect } from 'vitest';
import { planMfaEnrollStart, planMfaConfirm, planMfaDisable } from './mfaStore';

// The DB-touching wrappers (beginMfaEnrollment/confirmMfaEnrollment/disableMfa/describeMfaStatus)
// are thin SaaS-gated node paths over these PURE $set builders — same testing convention as
// lib/billing/byoKeyStore.test.ts (only the planners get unit tests; the wrappers are exercised
// via the API routes / integration).

describe('planMfaEnrollStart', () => {
  it('builds a $set that stores the pending secret and nothing else', () => {
    expect(planMfaEnrollStart('gcm1$a$b$c')).toEqual({
      $set: { mfaPendingSecretEnc: 'gcm1$a$b$c' },
    });
  });
});

describe('planMfaConfirm', () => {
  it('builds a $set that activates MFA, stores the secret + recovery hashes, and clears pending', () => {
    const update = planMfaConfirm('gcm1$a$b$c', ['hash1', 'hash2']);
    expect(update).toEqual({
      $set: {
        mfaEnabled: true,
        mfaSecretEnc: 'gcm1$a$b$c',
        mfaRecoveryHashes: ['hash1', 'hash2'],
        mfaPendingSecretEnc: null,
      },
    });
  });

  it('accepts an empty recovery-hash list (still a valid, if unusual, activation)', () => {
    const update = planMfaConfirm('gcm1$a$b$c', []);
    expect(update.$set.mfaRecoveryHashes).toEqual([]);
    expect(update.$set.mfaEnabled).toBe(true);
  });
});

describe('planMfaDisable', () => {
  it('wipes every MFA field back to its off-state default', () => {
    expect(planMfaDisable()).toEqual({
      $set: {
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaPendingSecretEnc: null,
        mfaRecoveryHashes: [],
      },
    });
  });
});
