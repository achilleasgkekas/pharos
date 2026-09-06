import { describe, it, expect } from 'vitest';
import { rateForModel, callCostMicros } from './aiPricing';

// Pure pricing helpers behind the self-hosted spend cap. Rates are micros per 1M tokens
// (1 unit = 1_000_000 micros). These lock the model→rate mapping and the cost math so a
// mis-tabled model can't silently make the cap count the wrong amount (or treat a call as free).

describe('rateForModel', () => {
  it('prices the current families correctly (micros per 1M)', () => {
    expect(rateForModel('claude-sonnet-5')).toEqual({ inputPerMTok: 2_000_000, outputPerMTok: 10_000_000 });
    expect(rateForModel('claude-haiku-4-5')).toEqual({ inputPerMTok: 1_000_000, outputPerMTok: 5_000_000 });
    expect(rateForModel('claude-opus-5')).toEqual({ inputPerMTok: 5_000_000, outputPerMTok: 25_000_000 });
    expect(rateForModel('claude-fable-5-1')).toEqual({ inputPerMTok: 10_000_000, outputPerMTok: 50_000_000 });
  });

  it('resolves a dated / previous-gen id by substring', () => {
    expect(rateForModel('claude-sonnet-4-5-20250929')).toEqual({ inputPerMTok: 3_000_000, outputPerMTok: 15_000_000 });
    expect(rateForModel('claude-3-5-haiku-latest')).toEqual({ inputPerMTok: 800_000, outputPerMTok: 4_000_000 });
  });

  it('falls back to a Sonnet-class rate for an untabled model — never free', () => {
    expect(rateForModel('some-future-model')).toEqual({ inputPerMTok: 3_000_000, outputPerMTok: 15_000_000 });
    expect(rateForModel('')).toEqual({ inputPerMTok: 3_000_000, outputPerMTok: 15_000_000 });
  });
});

describe('callCostMicros', () => {
  it('computes cost from tokens × the model rate', () => {
    // Haiku 4.5: 1M in @ $1, 1M out @ $5 → 1_000_000 + 5_000_000 = 6_000_000 micros ($6)
    expect(callCostMicros('claude-haiku-4-5', 1_000_000, 1_000_000)).toBe(6_000_000);
    // Sonnet 5, 10k in + 2k out → 10000*2 + 2000*10 = 20_000 + 20_000 = 40_000 micros ($0.04)
    expect(callCostMicros('claude-sonnet-5', 10_000, 2_000)).toBe(40_000);
  });

  it('is zero for zero tokens and clamps garbage', () => {
    expect(callCostMicros('claude-sonnet-5', 0, 0)).toBe(0);
    expect(callCostMicros('claude-sonnet-5', -5, NaN)).toBe(0);
  });
});
