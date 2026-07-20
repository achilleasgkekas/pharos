// MFA recovery-code generation + storage codec (TODO §9 "Accounts & auth (web-grade)": "MFA
// (TOTP + recovery codes)"). Companion to totp.ts's TOTP core — same scope note applies: this is
// the algorithm/storage-codec half only, not wired into any Account field or route yet.
//
// Reuses lib/auth.ts's scrypt hashPassword/verifyPassword AS-IS (it hashes any plaintext string,
// not just account passwords) instead of duplicating a KDF — recovery codes get the exact same
// at-rest protection with zero new crypto surface to review.
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/auth';

// Excludes 0/O/1/I/L — characters that are easy to mistype from a printed or handwritten copy.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** One human-typeable recovery code, "XXXX-XXXX" (8 chars from a look-alike-free alphabet). */
function oneCode(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Generate `count` fresh, unique recovery codes (default 10 — the common authenticator-app
 *  convention: enough to survive occasional use without immediate re-enrollment). Returns the
 *  PLAINTEXT codes — show them to the user exactly once; the caller must hash each with
 *  `hashRecoveryCodes` before persisting and never store the plaintext. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(oneCode());
  return [...codes];
}

/** Case/whitespace/dash-insensitive normalization, so "abcd efgh", "ABCD-EFGH" and "abcdefgh"
 *  all resolve to the same stored hash — these get retyped by hand from a printed or saved
 *  list, and the dash is a formatting aid, not part of the secret. */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

/** Hash a batch of plaintext codes for storage (same scrypt envelope as account passwords, via
 *  lib/auth.ts's hashPassword — normalizes each code first so storage and lookup agree). */
export function hashRecoveryCodes(codes: string[]): string[] {
  return codes.map((c) => hashPassword(normalizeCode(c)));
}

/**
 * Check `code` against a list of stored hashes; returns the index of the first match, or -1
 * when none match (including a blank/whitespace-only input). Each recovery code is single-use —
 * this function only answers "does it match", the caller is responsible for removing that entry
 * (e.g. `hashes.splice(index, 1)`) once consumed.
 */
export function matchRecoveryCode(code: string, hashes: string[]): number {
  const normalized = normalizeCode(code);
  if (!normalized) return -1;
  return hashes.findIndex((h) => verifyPassword(normalized, h));
}
