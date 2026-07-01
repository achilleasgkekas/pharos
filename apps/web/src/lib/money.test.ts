import { afterEach, describe, expect, it } from 'vitest';
import { CURRENCIES, cur, currencySymbol, setCurrencySymbol } from './money';

// money.ts is a pure, single-currency-per-deployment helper. `cur()` reads a module
// variable set on every render; these tests reset it after each case so ordering can't
// leak state between assertions.
afterEach(() => {
  setCurrencySymbol('€');
});

describe('currencySymbol', () => {
  it('resolves known ISO codes to their symbol', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('JPY')).toBe('¥');
  });

  it('is case-insensitive on the code', () => {
    expect(currencySymbol('usd')).toBe('$');
    expect(currencySymbol('eur')).toBe('€');
  });

  it('defaults to € for null/undefined/empty input', () => {
    expect(currencySymbol()).toBe('€');
    expect(currencySymbol(null)).toBe('€');
    expect(currencySymbol('')).toBe('€');
  });

  it('falls back to "<code> " for an unknown code', () => {
    expect(currencySymbol('XYZ')).toBe('XYZ ');
  });

  it('has a symbol for every catalogued currency', () => {
    for (const c of CURRENCIES) {
      expect(currencySymbol(c.code)).toBe(c.symbol);
    }
  });
});

describe('cur / setCurrencySymbol', () => {
  it('defaults to € before any setter call', () => {
    expect(cur()).toBe('€');
  });

  it('reflects the active symbol after setCurrencySymbol', () => {
    setCurrencySymbol('$');
    expect(cur()).toBe('$');
    setCurrencySymbol('CHF ');
    expect(cur()).toBe('CHF ');
  });

  it('treats an empty symbol as a reset to €', () => {
    setCurrencySymbol('$');
    setCurrencySymbol('');
    expect(cur()).toBe('€');
  });
});

describe('CURRENCIES catalogue', () => {
  it('has no duplicate ISO codes', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('includes the default EUR entry', () => {
    expect(CURRENCIES.some((c) => c.code === 'EUR' && c.symbol === '€')).toBe(true);
  });
});
