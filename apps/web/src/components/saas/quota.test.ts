import { describe, it, expect } from 'vitest';
import { quotaBarView } from './quota';

describe('quotaBarView', () => {
  it('treats a null limit as unlimited (flat, no remaining)', () => {
    expect(quotaBarView({ used: 500, limit: null })).toEqual({
      unlimited: true,
      percent: 0,
      tone: 'ok',
      remaining: null,
    });
  });

  it('treats a non-positive limit as unlimited', () => {
    expect(quotaBarView({ used: 10, limit: 0 }).unlimited).toBe(true);
    expect(quotaBarView({ used: 10, limit: -5 }).unlimited).toBe(true);
  });

  it('computes percent + remaining from used/limit when ratio absent', () => {
    const v = quotaBarView({ used: 25, limit: 100 });
    expect(v).toEqual({ unlimited: false, percent: 25, tone: 'ok', remaining: 75 });
  });

  it('prefers an explicit ratio over used/limit', () => {
    // limit-derived would be 10%, but ratio says 80% → warn.
    const v = quotaBarView({ used: 10, limit: 100, ratio: 0.8 });
    expect(v.percent).toBe(80);
    expect(v.tone).toBe('warn');
  });

  it('flags warn at 75% and full at/over the limit', () => {
    expect(quotaBarView({ used: 75, limit: 100 }).tone).toBe('warn');
    expect(quotaBarView({ used: 100, limit: 100 }).tone).toBe('full');
    expect(quotaBarView({ used: 130, limit: 100 }).tone).toBe('full');
  });

  it('clamps an over-quota bar to 100% and floors remaining at 0', () => {
    const v = quotaBarView({ used: 130, limit: 100 });
    expect(v.percent).toBe(100);
    expect(v.remaining).toBe(0);
  });

  it('rounds percent to a whole number', () => {
    expect(quotaBarView({ used: 1, limit: 3 }).percent).toBe(33);
    expect(quotaBarView({ used: 2, limit: 3 }).percent).toBe(67);
  });

  it('is defensive against garbage used / ratio values', () => {
    expect(quotaBarView({ used: NaN, limit: 100 })).toEqual({
      unlimited: false,
      percent: 0,
      tone: 'ok',
      remaining: 100,
    });
    // Non-finite ratio → fall back to used/limit (50%).
    expect(quotaBarView({ used: 50, limit: 100, ratio: NaN }).percent).toBe(50);
    // Negative ratio clamps to 0.
    expect(quotaBarView({ used: 50, limit: 100, ratio: -1 }).percent).toBe(0);
  });
});
