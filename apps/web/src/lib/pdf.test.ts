import { describe, expect, it } from 'vitest';
import { looksLikeScannedPdf } from './pdf';

// pdf.ts is import-side-effect-free: the only external dependency (pdfjs-dist) is a
// dynamic import INSIDE extractPdfText, which these tests never call. `looksLikeScannedPdf`
// is a pure heuristic — "almost no extractable text ⇒ probably an image-only (scanned) PDF".
// Rule under test: strip ALL whitespace, then `nonWhitespaceLength < 40`.
// These tests pin the exact 40-char boundary and the whitespace-stripping behaviour so a
// future tweak to the threshold (or the \s class) falls visibly.
// NOTE: Unicode whitespace is written with \u escapes, never as literal invisible glyphs —
// U+2028/U+2029 are source line terminators and would break the parser if pasted literally.

// Helper: a run of `n` non-whitespace characters.
const chars = (n: number) => 'x'.repeat(n);

describe('looksLikeScannedPdf', () => {
  describe('empty / whitespace-only input ⇒ scanned (true)', () => {
    it('treats the empty string as scanned', () => {
      expect(looksLikeScannedPdf('')).toBe(true);
    });

    it('treats spaces-only as scanned', () => {
      expect(looksLikeScannedPdf('     ')).toBe(true);
    });

    it('treats mixed ASCII whitespace (tab/newline/CR/FF/VT) as scanned', () => {
      expect(looksLikeScannedPdf('\t\n\r\f\v \t\n')).toBe(true);
    });

    it('strips Unicode whitespace the \\s class matches (NBSP, ideographic, line-sep, BOM)', () => {
      // NBSP, ideographic space, line separator, BOM — all matched by \s.
      expect(looksLikeScannedPdf('\u00A0\u3000\u2028\uFEFF')).toBe(true);
    });
  });

  describe('the 40 non-whitespace-character boundary', () => {
    it('39 non-whitespace chars ⇒ still scanned (< 40)', () => {
      expect(chars(39)).toHaveLength(39); // guard the fixture
      expect(looksLikeScannedPdf(chars(39))).toBe(true);
    });

    it('exactly 40 non-whitespace chars ⇒ NOT scanned (boundary is exclusive)', () => {
      expect(looksLikeScannedPdf(chars(40))).toBe(false);
    });

    it('41 non-whitespace chars ⇒ not scanned', () => {
      expect(looksLikeScannedPdf(chars(41))).toBe(false);
    });
  });

  describe('whitespace does not count toward the threshold', () => {
    it('40 real chars scattered among heavy whitespace ⇒ not scanned', () => {
      // 40 letters interleaved with spaces/newlines; only the letters count.
      const spread = chars(40).split('').join('  \n  ');
      expect(looksLikeScannedPdf(spread)).toBe(false);
    });

    it('39 real chars buried in whitespace ⇒ scanned (whitespace never rescues it)', () => {
      const padded = `\n\n\t   ${chars(39)}   \t\n\n`;
      expect(looksLikeScannedPdf(padded)).toBe(true);
    });

    it('a page of nothing but blank lines ⇒ scanned', () => {
      expect(looksLikeScannedPdf('\n'.repeat(500))).toBe(true);
    });
  });

  describe('real-world shapes', () => {
    it('a sparse OCR-failure snippet (a few glyphs) ⇒ scanned', () => {
      // Typical of an image-only PDF where pdfjs recovers 1-8 stray characters.
      expect(looksLikeScannedPdf('  a  1  .  ')).toBe(true);
    });

    it('a genuine extracted statement line ⇒ not scanned', () => {
      const line = '03/04/2026 PLAISIO COMPUTERS 09/12 39,47 EUR ATHENS';
      expect(line.replace(/\s/g, '').length).toBeGreaterThanOrEqual(40);
      expect(looksLikeScannedPdf(line)).toBe(false);
    });

    it('counts Greek (non-ASCII) glyphs as extractable text', () => {
      // 40 Greek letters, no Latin — must still register as extractable.
      const greek = 'α'.repeat(40);
      expect(looksLikeScannedPdf(greek)).toBe(false);
    });

    it('a short Greek store name (< 40 chars) ⇒ scanned', () => {
      expect(looksLikeScannedPdf('ΚΩΤΣΟΒΟΛΟΣ')).toBe(true);
    });
  });
});
