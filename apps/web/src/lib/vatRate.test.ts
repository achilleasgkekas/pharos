import { describe, expect, it } from 'vitest';
import { normalizeVatRate } from './vatRate';

describe('normalizeVatRate (#402)', () => {
  it('keeps 0 as 0', () => {
    expect(normalizeVatRate(0)).toBe(0);
    expect(normalizeVatRate('0')).toBe(0);
  });

  it('keeps valid rates and clamps to 0–100', () => {
    expect(normalizeVatRate(24)).toBe(24);
    expect(normalizeVatRate('5.5')).toBe(5.5);
    expect(normalizeVatRate(-5)).toBe(0);
    expect(normalizeVatRate(250)).toBe(100);
  });

  it('reads blank, missing and non-numeric input as the neutral 0', () => {
    for (const v of [null, undefined, '', '  ', 'abc', NaN, Infinity]) expect(normalizeVatRate(v), String(v)).toBe(0);
  });
});
