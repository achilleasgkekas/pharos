import { describe, it, expect } from 'vitest';
import { isByoKey, aiKeyMode, meterAiUsage, unmeteredAiQuota } from './aiKeyPolicy';

describe('isByoKey', () => {
  it('is true only for a strict true', () => {
    expect(isByoKey(true)).toBe(true);
  });

  it('is false for false / null / undefined', () => {
    expect(isByoKey(false)).toBe(false);
    expect(isByoKey(null)).toBe(false);
    expect(isByoKey(undefined)).toBe(false);
  });

  it('does not treat truthy non-true values as BYO (fail-safe)', () => {
    // @ts-expect-error — exercising a defensive runtime path
    expect(isByoKey(1)).toBe(false);
    // @ts-expect-error — exercising a defensive runtime path
    expect(isByoKey('true')).toBe(false);
  });
});

describe('aiKeyMode', () => {
  it('maps BYO flag → "byo"', () => {
    expect(aiKeyMode(true)).toBe('byo');
  });

  it('maps everything else → "platform"', () => {
    expect(aiKeyMode(false)).toBe('platform');
    expect(aiKeyMode(null)).toBe('platform');
    expect(aiKeyMode(undefined)).toBe('platform');
  });
});

describe('meterAiUsage', () => {
  it('does NOT meter a BYO-key tenant', () => {
    expect(meterAiUsage(true)).toBe(false);
  });

  it('meters platform-key tenants (default: absent flag)', () => {
    expect(meterAiUsage(false)).toBe(true);
    expect(meterAiUsage(null)).toBe(true);
    expect(meterAiUsage(undefined)).toBe(true);
  });
});

describe('unmeteredAiQuota', () => {
  it('is unlimited + always allowed', () => {
    expect(unmeteredAiQuota()).toEqual({
      used: 0,
      limit: null,
      remaining: null,
      allowed: true,
      ratio: 0,
    });
  });

  it('surfaces the used count, clamped at 0', () => {
    expect(unmeteredAiQuota(42).used).toBe(42);
    expect(unmeteredAiQuota(-5).used).toBe(0);
  });

  it('never has a cap or a non-zero ratio regardless of used', () => {
    const s = unmeteredAiQuota(9_999);
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
    expect(s.allowed).toBe(true);
    expect(s.ratio).toBe(0);
  });
});
