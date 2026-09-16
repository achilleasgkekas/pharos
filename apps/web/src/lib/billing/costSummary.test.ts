import { describe, it, expect } from 'vitest';
import { microsToUnits, formatMicros, buildCostSummary, type CostSummaryInput } from './costSummary';

describe('microsToUnits', () => {
  it('converts micros to whole currency units', () => {
    expect(microsToUnits(1_000_000)).toBe(1);
    expect(microsToUnits(1_230_000)).toBe(1.23);
    expect(microsToUnits(500_000)).toBe(0.5);
  });

  it('is 0 for zero, negative, or garbage input', () => {
    expect(microsToUnits(0)).toBe(0);
    expect(microsToUnits(-100)).toBe(0);
    // @ts-expect-error intentional garbage
    expect(microsToUnits('x')).toBe(0);
    expect(microsToUnits(NaN)).toBe(0);
  });
});

describe('formatMicros', () => {
  it('formats with 2 decimals and the € symbol by default', () => {
    expect(formatMicros(1_230_000)).toBe('€1.23');
    expect(formatMicros(1_000_000)).toBe('€1.00');
    expect(formatMicros(0)).toBe('€0.00');
  });

  it('honours a custom currency', () => {
    expect(formatMicros(2_500_000, 'USD')).toBe('$2.50');
  });

  it('clamps negative/garbage to <symbol>0.00', () => {
    expect(formatMicros(-5_000_000)).toBe('€0.00');
    // @ts-expect-error intentional garbage
    expect(formatMicros(undefined)).toBe('€0.00');
  });
});

describe('buildCostSummary', () => {
  const base: CostSummaryInput = {
    period: '2026-07',
    aiCalls: 42,
    aiInputTokens: 100_000,
    aiOutputTokens: 25_000,
    aiCostMicros: 675_000,
  };

  it('rolls up calls, tokens and cost into a display-ready summary', () => {
    expect(buildCostSummary(base)).toEqual({
      period: '2026-07',
      aiCalls: 42,
      inputTokens: 100_000,
      outputTokens: 25_000,
      totalTokens: 125_000,
      costMicros: 675_000,
      costUnits: 0.675,
      costFormatted: '€0.68',
    });
  });

  it('passes the period through verbatim and honours a custom currency', () => {
    const s = buildCostSummary({ ...base, period: '2025-12' }, 'USD');
    expect(s.period).toBe('2025-12');
    expect(s.costFormatted).toBe('$0.68');
  });

  it('coerces partial/garbage figures to safe non-negative integers', () => {
    const s = buildCostSummary({
      period: '2026-07',
      aiCalls: NaN,
      aiInputTokens: -10,
      aiOutputTokens: 12.9,
      // @ts-expect-error intentional garbage
      aiCostMicros: 'x',
    });
    expect(s.aiCalls).toBe(0);
    expect(s.inputTokens).toBe(0);
    expect(s.outputTokens).toBe(12);
    expect(s.totalTokens).toBe(12);
    expect(s.costMicros).toBe(0);
    expect(s.costUnits).toBe(0);
    expect(s.costFormatted).toBe('€0.00');
  });
});

it('formats server-rendered ledger totals with the request locale', () => {
  expect(formatMicros(1_230_000, 'EUR', 'el')).toBe('1,23\u00a0€');
  expect(buildCostSummary({ period: '2026-09', aiCalls: 1, aiInputTokens: 1, aiOutputTokens: 1, aiCostMicros: 1_230_000 }, 'EUR', 'el').costFormatted).toBe('1,23\u00a0€');
});
