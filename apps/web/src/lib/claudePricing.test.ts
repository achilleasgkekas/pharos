import { describe, expect, it } from 'vitest';
import {
  claudePrice,
  claudeRateMicros,
  estimateTaskCost,
  formatTaskCost,
  taskCostSummary,
  formatModelPrice,
  formatCacheTooltip,
  PRICING_VERIFIED_AT,
  PRICING_SOURCE_URL,
} from './claudePricing';
import {
  CLAUDE_MAIN_DEFAULT,
  CLAUDE_SCRAPER_DEFAULT,
  CLAUDE_SUGGESTIONS,
  CLAUDE_SCRAPER_SUGGESTIONS,
} from './claudeModels';

describe('claudePricing — metadata', () => {
  it('has verified date and source documentation URL', () => {
    expect(PRICING_VERIFIED_AT).toBe('2026-09-27');
    expect(PRICING_SOURCE_URL).toContain('pricing');
  });
});

describe('claudePrice — exact prices for current and active models', () => {
  it('prices Fable 5.1 and Fable 5 ($10 / $50)', () => {
    const f51 = claudePrice('claude-fable-5-1');
    expect(f51).toMatchObject({
      inputPerMTok: 10,
      outputPerMTok: 50,
      cacheWrite5mPerMTok: 12.5,
      cacheWrite1hPerMTok: 20,
      cacheReadPerMTok: 0.25,
      batchMultiplier: 0.5,
    });

    const f5 = claudePrice('claude-fable-5');
    expect(f5).toMatchObject({
      inputPerMTok: 10,
      outputPerMTok: 50,
      cacheWrite5mPerMTok: 12.5,
      cacheWrite1hPerMTok: 20,
      cacheReadPerMTok: 1.0,
      batchMultiplier: 0.5,
    });
  });

  it('prices Opus 5.5 ($4 / $20)', () => {
    const o55 = claudePrice('claude-opus-5-5');
    expect(o55).toMatchObject({
      inputPerMTok: 4,
      outputPerMTok: 20,
      cacheWrite5mPerMTok: 5.0,
      cacheWrite1hPerMTok: 8.0,
      cacheReadPerMTok: 0.2,
      batchMultiplier: 0.5,
    });
  });

  it('prices Opus 5, 4.8, 4.7, 4.6, 4.5 ($5 / $25)', () => {
    for (const id of [
      'claude-opus-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-5',
    ]) {
      const p = claudePrice(id);
      expect(p, id).toMatchObject({
        inputPerMTok: 5,
        outputPerMTok: 25,
        cacheWrite5mPerMTok: 6.25,
        cacheWrite1hPerMTok: 10.0,
        cacheReadPerMTok: 0.5,
        batchMultiplier: 0.5,
      });
    }
  });

  it('prices Sonnet 5 ($2 / $10)', () => {
    const s5 = claudePrice('claude-sonnet-5');
    expect(s5).toMatchObject({
      inputPerMTok: 2,
      outputPerMTok: 10,
      cacheWrite5mPerMTok: 2.5,
      cacheWrite1hPerMTok: 4.0,
      cacheReadPerMTok: 0.2,
      batchMultiplier: 0.5,
    });
  });

  it('prices Sonnet 4.6 and 4.5 ($3 / $15)', () => {
    for (const id of ['claude-sonnet-4-6', 'claude-sonnet-4-5']) {
      const p = claudePrice(id);
      expect(p, id).toMatchObject({
        inputPerMTok: 3,
        outputPerMTok: 15,
        cacheWrite5mPerMTok: 3.75,
        cacheWrite1hPerMTok: 6.0,
        cacheReadPerMTok: 0.3,
        batchMultiplier: 0.5,
      });
    }
  });

  it('prices Haiku 4.5 ($1 / $5)', () => {
    const h45 = claudePrice('claude-haiku-4-5');
    expect(h45).toMatchObject({
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheWrite5mPerMTok: 1.25,
      cacheWrite1hPerMTok: 2.0,
      cacheReadPerMTok: 0.1,
      batchMultiplier: 0.5,
    });
  });
});

describe('claudePrice — aliases, dated IDs and unknown models', () => {
  it('resolves dated IDs and -latest aliases', () => {
    expect(claudePrice('claude-sonnet-5-latest')).toMatchObject({ inputPerMTok: 2, outputPerMTok: 10 });
    expect(claudePrice('claude-opus-4-5-20251101')).toMatchObject({ inputPerMTok: 5, outputPerMTok: 25 });
    expect(claudePrice('claude-sonnet-4-5-20250929')).toMatchObject({ inputPerMTok: 3, outputPerMTok: 15 });
    expect(claudePrice('claude-haiku-4-5-20251001')).toMatchObject({ inputPerMTok: 1, outputPerMTok: 5 });
  });

  it('returns null for unknown models', () => {
    expect(claudePrice('claude-unknown-99')).toBeNull();
    expect(claudePrice('gpt-4o')).toBeNull();
    expect(claudePrice('')).toBeNull();
  });
});

describe('every recommended and suggested model has a price', () => {
  const models = [
    CLAUDE_MAIN_DEFAULT,
    CLAUDE_SCRAPER_DEFAULT,
    ...CLAUDE_SUGGESTIONS,
    ...CLAUDE_SCRAPER_SUGGESTIONS,
  ];

  it('has a non-null price for every model offered in UI', () => {
    for (const m of models) {
      const p = claudePrice(m);
      expect(p, m).not.toBeNull();
      expect(p!.inputPerMTok, `${m} in`).toBeGreaterThan(0);
      expect(p!.outputPerMTok, `${m} out`).toBeGreaterThan(0);
    }
  });
});

describe('claudeRateMicros — fallback for untabled models', () => {
  it('returns exact micros for known models with isApproximate: false', () => {
    const r = claudeRateMicros('claude-sonnet-5');
    expect(r).toEqual({
      inputPerMTok: 2_000_000,
      outputPerMTok: 10_000_000,
      cacheWrite5mPerMTok: 2_500_000,
      cacheWrite1hPerMTok: 4_000_000,
      cacheReadPerMTok: 200_000,
      isApproximate: false,
    });
  });

  it('falls back conservatively with isApproximate: true for unknown models', () => {
    const r = claudeRateMicros('claude-unknown-model');
    expect(r.isApproximate).toBe(true);
    expect(r.inputPerMTok).toBe(3_000_000);
    expect(r.outputPerMTok).toBe(15_000_000);
  });
});

describe('estimateTaskCost', () => {
  it('estimates receipt photo cost for Sonnet 5', () => {
    // 1600 in * $2/1M + 400 out * $10/1M = 3200 + 4000 = 7200 / 1M = $0.0072
    const cost = estimateTaskCost('claude-sonnet-5', 'receipt');
    expect(cost).toBeCloseTo(0.0072, 4);
    expect(formatTaskCost(cost)).toBe('$0.007');
  });

  it('estimates statement page cost for Sonnet 5', () => {
    // 2500 in * $2/1M + 800 out * $10/1M = 5000 + 8000 = 13000 / 1M = $0.013
    const cost = estimateTaskCost('claude-sonnet-5', 'statement');
    expect(cost).toBeCloseTo(0.013, 3);
    expect(formatTaskCost(cost)).toBe('$0.01');
  });

  it('estimates price check cost for Haiku 4.5', () => {
    // 1500 in * $1/1M + 50 out * $5/1M = 1500 + 250 = 1750 / 1M = $0.00175
    const cost = estimateTaskCost('claude-haiku-4-5', 'priceSearch');
    expect(cost).toBeCloseTo(0.00175, 5);
    expect(formatTaskCost(cost)).toBe('$0.002');
  });

  it('provides a formatted task cost summary', () => {
    const summary = taskCostSummary('claude-sonnet-5');
    expect(summary).toContain('About $0.007 per receipt photo');
    expect(summary).toContain('per statement page');
    expect(summary).toContain('per price check');
  });
});

describe('UI formatting helpers', () => {
  it('formatModelPrice formats input and output per 1M tokens', () => {
    const p = claudePrice('claude-sonnet-5')!;
    expect(formatModelPrice(p)).toBe('$2 input / $10 output per 1M tokens');
  });

  it('formatCacheTooltip displays 5m write, 1h write, and read cache rates', () => {
    const p = claudePrice('claude-sonnet-5')!;
    expect(formatCacheTooltip(p)).toContain('Cache write: $2.5 (5m) / $4 (1h)');
    expect(formatCacheTooltip(p)).toContain('Cache read: $0.2 per 1M tokens');
  });
});
