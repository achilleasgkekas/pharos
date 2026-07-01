import { describe, expect, it } from 'vitest';
import { buildCardLabel, detectCardType, normalizeLast4, periodLabel } from './cards';

// cards.ts is a pure, dependency-free helper shared by statement import (auto-match /
// auto-create a card from a parsed statement) and the cards settings UI. No DB, no clock,
// no fs, so every branch is exercisable in isolation.

describe('normalizeLast4', () => {
  it('keeps only the final 4 digits of a masked string', () => {
    expect(normalizeLast4('**** **** **** 1234')).toBe('1234');
    expect(normalizeLast4('•••• 5678')).toBe('5678');
  });

  it('strips every non-digit before slicing', () => {
    expect(normalizeLast4('4111-2222-3333-4444')).toBe('4444');
    expect(normalizeLast4('ends in 0773')).toBe('0773');
  });

  it('returns fewer than 4 chars when there are fewer digits', () => {
    expect(normalizeLast4('12')).toBe('12');
    expect(normalizeLast4('7')).toBe('7');
  });

  it('preserves leading zeros in the last group', () => {
    expect(normalizeLast4('card 0007')).toBe('0007');
    expect(normalizeLast4('7791 then 0091')).toBe('0091');
  });

  it('returns "" for null / undefined / empty / digitless input', () => {
    expect(normalizeLast4()).toBe('');
    expect(normalizeLast4(null)).toBe('');
    expect(normalizeLast4('')).toBe('');
    expect(normalizeLast4('no digits here')).toBe('');
  });

  it('coerces a non-string-ish value defensively', () => {
    // callers pass free-text; String() guards a stray number
    expect(normalizeLast4(1234 as unknown as string)).toBe('1234');
  });
});

describe('detectCardType', () => {
  it('detects mastercard (with and without a space)', () => {
    expect(detectCardType('Εθνική Mastercard')).toBe('mastercard');
    expect(detectCardType('MASTER CARD gold')).toBe('mastercard');
  });

  it('detects visa', () => {
    expect(detectCardType('Alpha Visa Classic')).toBe('visa');
    expect(detectCardType('VISA')).toBe('visa');
  });

  it('detects amex from both spellings', () => {
    expect(detectCardType('Amex Platinum')).toBe('amex');
    expect(detectCardType('American Express')).toBe('amex');
  });

  it('detects maestro', () => {
    expect(detectCardType('Piraeus Maestro')).toBe('maestro');
  });

  it('is case-insensitive', () => {
    expect(detectCardType('mastercard')).toBe('mastercard');
    expect(detectCardType('vIsA')).toBe('visa');
  });

  it('falls back to "other" for unknown / empty / nullish names', () => {
    expect(detectCardType('Revolut prepaid')).toBe('other');
    expect(detectCardType('')).toBe('other');
    expect(detectCardType(undefined as unknown as string)).toBe('other');
  });

  it('prefers mastercard when it appears before visa in the checks', () => {
    // both keywords present: the mastercard branch wins by order
    expect(detectCardType('Mastercard / Visa co-brand')).toBe('mastercard');
  });
});

describe('buildCardLabel', () => {
  it('appends the last4 when it is not already in the name', () => {
    expect(buildCardLabel('Εθνική Mastercard', '7791')).toBe('Εθνική Mastercard 7791');
    expect(buildCardLabel('Alpha Visa', '**** 4444')).toBe('Alpha Visa 4444');
  });

  it('does not duplicate the last4 when the name already contains it', () => {
    expect(buildCardLabel('Mastercard 7791', '7791')).toBe('Mastercard 7791');
    expect(buildCardLabel('card ...0773', '0773')).toBe('card ...0773');
  });

  it('trims surrounding whitespace on the name', () => {
    expect(buildCardLabel('  Alpha Visa  ', '4444')).toBe('Alpha Visa 4444');
  });

  it('defaults the base name to "Card" when name is missing', () => {
    expect(buildCardLabel(null, '1234')).toBe('Card 1234');
    expect(buildCardLabel(undefined, '1234')).toBe('Card 1234');
    expect(buildCardLabel('', '1234')).toBe('Card 1234');
  });

  it('returns just the name when there is no usable last4', () => {
    expect(buildCardLabel('Alpha Visa')).toBe('Alpha Visa');
    expect(buildCardLabel('Alpha Visa', null)).toBe('Alpha Visa');
    expect(buildCardLabel('Alpha Visa', 'no digits')).toBe('Alpha Visa');
  });

  it('returns "Card" when both inputs are empty', () => {
    expect(buildCardLabel('', '')).toBe('Card');
    expect(buildCardLabel(null, null)).toBe('Card');
  });
});

describe('periodLabel', () => {
  it('formats a valid YYYY-MM period to "Month YYYY"', () => {
    expect(periodLabel('2026-06')).toBe('June 2026');
    expect(periodLabel('2026-01')).toBe('January 2026');
    expect(periodLabel('2025-12')).toBe('December 2025');
  });

  it('returns the raw string for a malformed period', () => {
    expect(periodLabel('2026/06')).toBe('2026/06');
    expect(periodLabel('June 2026')).toBe('June 2026');
    expect(periodLabel('2026-6')).toBe('2026-6');
    expect(periodLabel('26-06')).toBe('26-06');
  });

  it('returns the raw string for an out-of-range month index', () => {
    // regex matches but MONTHS[13-1] is undefined → falls back to raw
    expect(periodLabel('2026-13')).toBe('2026-13');
    expect(periodLabel('2026-00')).toBe('2026-00');
  });

  it('returns "" for null / undefined / empty', () => {
    expect(periodLabel()).toBe('');
    expect(periodLabel(null)).toBe('');
    expect(periodLabel('')).toBe('');
  });
});
