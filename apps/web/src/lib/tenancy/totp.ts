// RFC 6238 TOTP (Time-based One-Time Password) — pure, DB-free, Next-free (node:crypto only,
// zero new dependency — same "no native dep" idiom as lib/auth.ts's scrypt password hashing and
// secretCrypto.ts's AES-GCM). Scaffold for the account MFA feature (TODO §9 "Accounts & auth
// (web-grade)": "MFA (TOTP + recovery codes)").
//
// SCOPE: this file is the algorithm core only — secret generation, the otpauth:// enrollment
// URI, and code generation/verification with a clock-drift window. It is NOT wired into any
// Account field, API route, or the login flow yet. Wiring MFA into login is a separate, riskier
// increment (touches shared, security-critical plumbing) best done once this core is proven
// correct — which is why it ships with the RFC 6238 Appendix B published test vectors rather
// than only self-consistency tests. See recoveryCodes.ts for the companion backup-code half.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode, unpadded (Google Authenticator / Authy / 1Password all accept
 *  unpadded secrets — padding would just be stripped by every app that scans the QR code). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** RFC 4648 base32 decode. Case-insensitive, ignores '=' padding and whitespace (how users paste
 *  a secret back in). Throws on an invalid character — a corrupted/mistyped secret should fail
 *  loudly, not silently decode into the wrong key. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[=\s]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh random TOTP secret (20 bytes → 32 base32 chars — the RFC 6238 reference key length,
 *  and what every mainstream authenticator app expects). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** otpauth:// enrollment URI for rendering as a QR code. `accountLabel` is typically the user's
 *  email; colons are stripped (otpauth label syntax reserves ':' as the issuer/account
 *  separator, so a stray one in the label would corrupt the scanned account name). */
export function totpUri(secret: string, accountLabel: string, issuer = 'Pharos'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel.replace(/:/g, '')}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** HOTP (RFC 4226) at one counter value — the primitive TOTP is built on top of. */
function hotp(secretBytes: Buffer, counter: number, digits: number): string {
  const counterBuf = Buffer.alloc(8);
  // counter is seconds/step (≪ 2^32 until the year ~146140), but write both words for
  // RFC-correctness rather than assuming the high word is always zero.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secretBytes).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** digits).padStart(digits, '0');
}

/** The TOTP code for `secret` at a given instant (ms epoch, default now). 6 digits / 30s step —
 *  the near-universal authenticator-app default (Google/Microsoft/Authy/1Password). */
export function generateTotpCode(
  secret: string,
  at: number = Date.now(),
  step = 30,
  digits = 6
): string {
  const counter = Math.floor(at / 1000 / step);
  return hotp(base32Decode(secret), counter, digits);
}

/**
 * Verify a user-entered code, tolerating clock drift up to `window` steps either side (default
 * ±1 step = ±30s — the usual authenticator-app tolerance; wide enough for real drift, narrow
 * enough that it doesn't meaningfully widen the guessable window). Rejects anything that isn't
 * exactly `digits` decimal digits before touching the secret. Each candidate is compared with
 * `timingSafeEqual` (same care as lib/auth.ts's verifyPassword) so a match at one offset can't be
 * distinguished by timing from a match at another.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  at: number = Date.now(),
  window = 1,
  step = 30,
  digits = 6
): boolean {
  const trimmed = code.trim();
  if (!/^\d+$/.test(trimmed) || trimmed.length !== digits) return false;
  const secretBytes = base32Decode(secret);
  const counter = Math.floor(at / 1000 / step);
  const target = Buffer.from(trimmed);
  let matched = false;
  for (let offset = -window; offset <= window; offset++) {
    const candidate = Buffer.from(hotp(secretBytes, counter + offset, digits));
    if (timingSafeEqual(candidate, target)) matched = true;
  }
  return matched;
}
