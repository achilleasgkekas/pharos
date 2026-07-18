import { describe, expect, it } from 'vitest';
import { guessBarcodeFormat, resolveBarcodeFormat, isValidForFormat, isBarcodeFormat } from './loyaltyCard';

describe('guessBarcodeFormat', () => {
  it('picks EAN13 for a 13-digit number', () => {
    expect(guessBarcodeFormat('1234567890128')).toBe('EAN13');
  });

  it('picks UPC for a 12-digit number', () => {
    expect(guessBarcodeFormat('123456789012')).toBe('UPC');
  });

  it('falls back to CODE128 for anything else', () => {
    expect(guessBarcodeFormat('AB-1234')).toBe('CODE128');
    expect(guessBarcodeFormat('12345')).toBe('CODE128');
    expect(guessBarcodeFormat('')).toBe('CODE128');
  });

  it('trims whitespace before checking shape', () => {
    expect(guessBarcodeFormat('  1234567890128  ')).toBe('EAN13');
  });
});

describe('isBarcodeFormat', () => {
  it('accepts the four supported formats', () => {
    expect(isBarcodeFormat('CODE128')).toBe(true);
    expect(isBarcodeFormat('EAN13')).toBe(true);
    expect(isBarcodeFormat('UPC')).toBe(true);
    expect(isBarcodeFormat('CODE39')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBarcodeFormat('QR')).toBe(false);
    expect(isBarcodeFormat('')).toBe(false);
    expect(isBarcodeFormat(undefined)).toBe(false);
    expect(isBarcodeFormat(42)).toBe(false);
  });
});

describe('resolveBarcodeFormat', () => {
  it('keeps a valid stored format as-is', () => {
    expect(resolveBarcodeFormat('CODE39', '1234567890128')).toBe('CODE39');
  });

  it('falls back to the shape guess when missing/invalid', () => {
    expect(resolveBarcodeFormat('', '1234567890128')).toBe('EAN13');
    expect(resolveBarcodeFormat('bogus', 'AB-1234')).toBe('CODE128');
    expect(resolveBarcodeFormat(undefined, '123456789012')).toBe('UPC');
  });
});

describe('isValidForFormat', () => {
  it('EAN13 requires exactly 13 digits', () => {
    expect(isValidForFormat('1234567890128', 'EAN13')).toBe(true);
    expect(isValidForFormat('123456789012', 'EAN13')).toBe(false);
    expect(isValidForFormat('12345678901ab', 'EAN13')).toBe(false);
  });

  it('UPC requires exactly 12 digits', () => {
    expect(isValidForFormat('123456789012', 'UPC')).toBe(true);
    expect(isValidForFormat('1234567890128', 'UPC')).toBe(false);
  });

  it('CODE39 allows uppercase/digits/limited punctuation only', () => {
    expect(isValidForFormat('ABC-123', 'CODE39')).toBe(true);
    expect(isValidForFormat('abc-123', 'CODE39')).toBe(false);
    expect(isValidForFormat('ABC#123', 'CODE39')).toBe(false);
  });

  it('CODE128 accepts anything reasonably short', () => {
    expect(isValidForFormat('any-text_123', 'CODE128')).toBe(true);
    expect(isValidForFormat('x'.repeat(81), 'CODE128')).toBe(false);
  });

  it('is false for an empty card number regardless of format', () => {
    expect(isValidForFormat('', 'CODE128')).toBe(false);
    expect(isValidForFormat('   ', 'EAN13')).toBe(false);
  });
});
