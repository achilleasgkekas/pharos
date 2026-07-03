import { describe, it, expect } from 'vitest';
import {
  normalizeAiUsage,
  estimateCostMicros,
  DEFAULT_AI_RATE,
  type AiRate,
} from './aiCost';

describe('normalizeAiUsage', () => {
  it('defaults calls to 1 and tokens/cost to 0 for an empty detail', () => {
    expect(normalizeAiUsage()).toEqual({ calls: 1, inputTokens: 0, outputTokens: 0, costMicros: 0 });
    expect(normalizeAiUsage({})).toEqual({ calls: 1, inputTokens: 0, outputTokens: 0, costMicros: 0 });
  });

  it('passes through valid non-negative integers', () => {
    expect(normalizeAiUsage({ calls: 2, inputTokens: 100, outputTokens: 50, costMicros: 900 })).toEqual({
      calls: 2,
      inputTokens: 100,
      outputTokens: 50,
      costMicros: 900,
    });
  });

  it('keeps an explicit calls:0 as 0 (does not apply the default)', () => {
    expect(normalizeAiUsage({ calls: 0 }).calls).toBe(0);
  });

  it('floors fractional values and clamps negatives to 0', () => {
    expect(normalizeAiUsage({ calls: 3.9, inputTokens: 10.7, outputTokens: -5, costMicros: -100 })).toEqual({
      calls: 3,
      inputTokens: 10,
      outputTokens: 0,
      costMicros: 0,
    });
  });

  it('is fail-safe against NaN / non-number garbage', () => {
    // @ts-expect-error intentional garbage input
    expect(normalizeAiUsage({ calls: NaN, inputTokens: 'x', outputTokens: null, costMicros: undefined })).toEqual({
      calls: 1,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    });
  });
});

describe('estimateCostMicros', () => {
  it('is 0 when no tokens', () => {
    expect(estimateCostMicros(0, 0)).toBe(0);
  });

  it('computes input+output cost from a rate (micros per 1M tokens)', () => {
    const rate: AiRate = { inputPerMTok: 3_000_000, outputPerMTok: 15_000_000 };
    // 1M input @ 3_000_000 micros/M = 3_000_000; 1M output @ 15_000_000 = 15_000_000.
    expect(estimateCostMicros(1_000_000, 1_000_000, rate)).toBe(18_000_000);
    // Half a million input tokens → half the input rate.
    expect(estimateCostMicros(500_000, 0, rate)).toBe(1_500_000);
  });

  it('uses DEFAULT_AI_RATE when no rate is passed', () => {
    expect(estimateCostMicros(1_000_000, 0)).toBe(DEFAULT_AI_RATE.inputPerMTok);
  });

  it('floors the result to an integer', () => {
    // 1 input token @ 3_000_000/M = 3 micros exactly; 7 tokens @ 3_000_000/M = 21.
    expect(estimateCostMicros(7, 0, { inputPerMTok: 3_000_000, outputPerMTok: 0 })).toBe(21);
    // A rate that yields a fraction is floored.
    expect(estimateCostMicros(1, 0, { inputPerMTok: 1_500_000, outputPerMTok: 0 })).toBe(1);
  });

  it('clamps negative/garbage tokens and rate to 0', () => {
    expect(estimateCostMicros(-100, -50)).toBe(0);
    // @ts-expect-error intentional garbage rate
    expect(estimateCostMicros(1_000_000, 0, { inputPerMTok: 'x', outputPerMTok: NaN })).toBe(0);
  });
});
