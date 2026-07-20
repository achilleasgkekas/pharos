import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpUri,
  generateTotpCode,
  verifyTotpCode,
} from './totp';

describe('base32Encode/base32Decode', () => {
  it('round-trips arbitrary bytes', () => {
    for (const bytes of [
      Buffer.from([]),
      Buffer.from([0]),
      Buffer.from([255]),
      Buffer.from('hello world'),
      Buffer.from(Array.from({ length: 37 }, (_, i) => i * 7)),
    ]) {
      expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    }
  });

  it('matches known RFC 4648 test vectors', () => {
    // https://www.rfc-editor.org/rfc/rfc4648#section-10 (unpadded here — trailing '=' stripped)
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
    expect(base32Encode(Buffer.from('foob'))).toBe('MZXW6YQ');
    expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('decode is case-insensitive and ignores padding/whitespace', () => {
    expect(base32Decode('mzxw6ytboi')).toEqual(Buffer.from('foobar'));
    expect(base32Decode('MZXW6YTBOI======')).toEqual(Buffer.from('foobar'));
    expect(base32Decode(' MZXW 6YTB OI ')).toEqual(Buffer.from('foobar'));
  });

  it('throws on an invalid character', () => {
    expect(() => base32Decode('not-valid-1')).toThrow();
  });
});

describe('generateTotpSecret', () => {
  it('produces a 32-char base32 string (20 raw bytes) and is random each call', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toHaveLength(32);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});

describe('totpUri', () => {
  it('builds a well-formed otpauth:// URI', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'user@example.com', 'Pharos');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    const parsed = new URL(uri);
    expect(decodeURIComponent(parsed.pathname)).toBe('/Pharos:user@example.com');
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.searchParams.get('issuer')).toBe('Pharos');
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe('30');
  });

  it('strips colons from the account label (otpauth label separator)', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'weird:label', 'Pharos');
    expect(decodeURIComponent(new URL(uri).pathname)).toBe('/Pharos:weirdlabel');
  });
});

// RFC 6238 Appendix B published test vectors: secret = ASCII "12345678901234567890" (20 bytes),
// SHA1, 8-digit codes, 30s step. These pin the HOTP/TOTP core against the spec, not just
// self-consistency — the strongest correctness check available without a live authenticator app.
const RFC6238_SECRET = base32EncodeAscii('12345678901234567890');
function base32EncodeAscii(ascii: string): string {
  const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const buf = Buffer.from(ascii, 'ascii');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

describe('generateTotpCode against RFC 6238 Appendix B test vectors', () => {
  const cases: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];
  it.each(cases)('T=%i seconds → %s (8-digit)', (seconds, expected) => {
    expect(generateTotpCode(RFC6238_SECRET, seconds * 1000, 30, 8)).toBe(expected);
  });
});

describe('generateTotpCode / verifyTotpCode (6-digit default)', () => {
  it('a freshly generated code verifies at the same instant', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
  });

  it('rejects a code from a different secret', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secretA, now);
    expect(verifyTotpCode(secretB, code, now)).toBe(false);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const real = generateTotpCode(secret, now);
    const wrong = real === '000000' ? '111111' : '000000';
    expect(verifyTotpCode(secret, wrong, now)).toBe(false);
  });

  it('tolerates ±1 step clock drift by default', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000; // fixed instant, step-aligned math below
    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now + 30_000)).toBe(true); // one step later
    expect(verifyTotpCode(secret, code, now - 30_000)).toBe(true); // one step earlier
    expect(verifyTotpCode(secret, code, now + 90_000)).toBe(false); // three steps later
  });

  it('rejects malformed input without touching the secret', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '')).toBe(false);
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
    expect(verifyTotpCode(secret, '12345')).toBe(false); // too short
    expect(verifyTotpCode(secret, '1234567')).toBe(false); // too long
  });

  it('accepts a code with surrounding whitespace', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, ` ${code} `, now)).toBe(true);
  });
});
