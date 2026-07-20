import { describe, it, expect } from 'vitest';
import { generateRecoveryCodes, hashRecoveryCodes, matchRecoveryCode } from './recoveryCodes';

describe('generateRecoveryCodes', () => {
  it('generates the requested count, all unique, in "XXXX-XXXX" shape', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('avoids look-alike characters (0/O/1/I/L)', () => {
    const codes = generateRecoveryCodes(50);
    for (const c of codes) expect(c).not.toMatch(/[01ILO]/);
  });

  it('defaults to 10 codes', () => {
    expect(generateRecoveryCodes()).toHaveLength(10);
  });

  it('supports a custom count', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });
});

describe('hashRecoveryCodes / matchRecoveryCode', () => {
  it('matches a plaintext code against its own hash batch, by index', () => {
    const codes = generateRecoveryCodes(5);
    const hashes = hashRecoveryCodes(codes);
    expect(hashes).toHaveLength(5);
    expect(matchRecoveryCode(codes[2], hashes)).toBe(2);
  });

  it('is case/whitespace/dash-insensitive on lookup', () => {
    const codes = ['ABCD-EFGH'];
    const hashes = hashRecoveryCodes(codes);
    expect(matchRecoveryCode('abcd-efgh', hashes)).toBe(0);
    expect(matchRecoveryCode('abcdefgh', hashes)).toBe(0);
    expect(matchRecoveryCode(' ABCD EFGH ', hashes)).toBe(0);
  });

  it('returns -1 for a non-matching or blank code', () => {
    const hashes = hashRecoveryCodes(generateRecoveryCodes(3));
    expect(matchRecoveryCode('ZZZZ-ZZZZ', hashes)).toBe(-1);
    expect(matchRecoveryCode('', hashes)).toBe(-1);
    expect(matchRecoveryCode('   ', hashes)).toBe(-1);
  });

  it('never stores the plaintext in the hash output', () => {
    const codes = ['WXYZ-2345'];
    const hashes = hashRecoveryCodes(codes);
    expect(hashes[0]).not.toContain('WXYZ2345');
    expect(hashes[0].startsWith('scrypt$')).toBe(true);
  });

  it('each hash batch call is independent (fresh salt) — same code hashes differently twice', () => {
    const [a] = hashRecoveryCodes(['SAME-CODE']);
    const [b] = hashRecoveryCodes(['SAME-CODE']);
    expect(a).not.toBe(b);
  });
});
