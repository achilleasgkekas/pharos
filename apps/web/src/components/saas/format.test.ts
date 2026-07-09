import { describe, it, expect } from 'vitest';
import { formatInt, formatBytes, formatCostMicros, formatWhen } from './format';

describe('formatInt', () => {
  it('groups thousands', () => {
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(0)).toBe('0');
  });
  it('rounds and coerces', () => {
    expect(formatInt(12.6)).toBe('13');
    expect(formatInt('42')).toBe('42');
  });
  it('non-finite → "0"', () => {
    expect(formatInt(NaN)).toBe('0');
    expect(formatInt(Infinity)).toBe('0');
    expect(formatInt(undefined)).toBe('0');
    expect(formatInt('abc')).toBe('0');
  });
});

describe('formatBytes', () => {
  it('scales units base-1024', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });
  it('whole numbers for large in-unit values', () => {
    expect(formatBytes(250 * 1024)).toBe('250 KB');
  });
  it('non-finite / negative → "0 B"', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
  });
});

describe('formatCostMicros', () => {
  it('formats micros as USD', () => {
    expect(formatCostMicros(1_000_000)).toBe('$1.00');
    expect(formatCostMicros(2_500_000)).toBe('$2.50');
  });
  it('keeps precision for sub-unit amounts', () => {
    expect(formatCostMicros(1234)).toBe('$0.0012');
  });
  it('non-finite / negative → $0.00', () => {
    expect(formatCostMicros(-1)).toBe('$0.00');
    expect(formatCostMicros(NaN)).toBe('$0.00');
    expect(formatCostMicros(undefined)).toBe('$0.00');
  });
  it('unknown currency falls back without throwing', () => {
    expect(() => formatCostMicros(1_000_000, 'NOTACODE')).not.toThrow();
  });
});

describe('formatWhen', () => {
  it('formats a valid ISO string', () => {
    expect(formatWhen('2026-07-10T00:00:00.000Z')).not.toBe('—');
  });
  it('invalid / empty → "—"', () => {
    expect(formatWhen('')).toBe('—');
    expect(formatWhen('not-a-date')).toBe('—');
    expect(formatWhen(undefined)).toBe('—');
    expect(formatWhen(123)).toBe('—');
  });
});
