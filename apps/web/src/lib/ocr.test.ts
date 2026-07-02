import { describe, it, expect } from 'vitest';
import { looksLikeUsableOcr } from './ocr';

// `looksLikeUsableOcr` is the pure gate in the receipt/statement OCR pipeline: after
// Tesseract runs, this decides whether the extracted text has enough real characters
// to feed the text model, or whether we should fall back to a vision parse instead.
// The rule is deliberately simple — strip all whitespace, then require at least 40
// characters — but the threshold matters: too low and we feed the model garbage OCR
// (empty/€0 receipts), too high and we needlessly pay for a vision call on text that
// was fine. These tests pin the ≥40 boundary and the whitespace-stripping behaviour.
// The module imports sharp/node built-ins at the top, but that is import-time only
// (no image work runs), so loading it here is side-effect-free.
describe('looksLikeUsableOcr', () => {
  it('returns false for the empty string', () => {
    expect(looksLikeUsableOcr('')).toBe(false);
  });

  it('returns false for whitespace-only text (spaces, tabs, newlines, CR)', () => {
    expect(looksLikeUsableOcr('   \t\n\r  \n\t ')).toBe(false);
  });

  it('returns false just below the threshold (39 non-whitespace chars)', () => {
    expect(looksLikeUsableOcr('a'.repeat(39))).toBe(false);
  });

  it('returns true exactly at the threshold (40 non-whitespace chars)', () => {
    expect(looksLikeUsableOcr('a'.repeat(40))).toBe(true);
  });

  it('returns true above the threshold', () => {
    expect(looksLikeUsableOcr('a'.repeat(400))).toBe(true);
  });

  it('does not count surrounding whitespace toward the length', () => {
    // 39 real chars wrapped in a lot of whitespace must still be too short.
    expect(looksLikeUsableOcr('\n\n   ' + 'a'.repeat(39) + '   \n\n')).toBe(false);
    // 40 real chars wrapped in whitespace is enough.
    expect(looksLikeUsableOcr('\n\n   ' + 'a'.repeat(40) + '   \n\n')).toBe(true);
  });

  it('does not count interspersed whitespace between characters', () => {
    // "a " * 40 = 40 letters + 40 spaces; stripped length is 40 → usable.
    expect(looksLikeUsableOcr('a '.repeat(40))).toBe(true);
    // "a " * 39 = 39 letters → still short.
    expect(looksLikeUsableOcr('a '.repeat(39))).toBe(false);
  });

  it('counts Greek (non-ASCII BMP) characters one-for-one', () => {
    expect(looksLikeUsableOcr('α'.repeat(39))).toBe(false);
    expect(looksLikeUsableOcr('α'.repeat(40))).toBe(true);
    // A realistic short Greek receipt fragment (well under 40 real chars) is not usable.
    expect(looksLikeUsableOcr('ΚΩΤΣΟΒΟΛΟΣ\nΣΥΝΟΛΟ 12,00')).toBe(false);
  });
});
