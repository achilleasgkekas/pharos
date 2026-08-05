import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIVATION_RATE_DEFAULT,
  activationRateConfig,
  pruneExpired,
  rateHit,
  rateLimitConfig,
  type RateEntry,
} from './apiRateLimit';

describe('rateHit (fixed-window counter)', () => {
  it('allows hits up to the limit, then blocks', () => {
    const store = new Map<string, RateEntry>();
    const now = 1000;
    const r1 = rateHit(store, 'k', now, 3, 60_000);
    const r2 = rateHit(store, 'k', now, 3, 60_000);
    const r3 = rateHit(store, 'k', now, 3, 60_000);
    const r4 = rateHit(store, 'k', now, 3, 60_000);
    expect([r1.allowed, r2.allowed, r3.allowed, r4.allowed]).toEqual([true, true, true, false]);
  });

  it('reports remaining counting down to 0 (never negative)', () => {
    const store = new Map<string, RateEntry>();
    expect(rateHit(store, 'k', 0, 2, 1000).remaining).toBe(1);
    expect(rateHit(store, 'k', 0, 2, 1000).remaining).toBe(0);
    expect(rateHit(store, 'k', 0, 2, 1000).remaining).toBe(0); // blocked, still 0
  });

  it('sets the window resetAt from the first hit and keeps it stable within the window', () => {
    const store = new Map<string, RateEntry>();
    const first = rateHit(store, 'k', 5_000, 5, 60_000);
    expect(first.resetAt).toBe(65_000);
    const second = rateHit(store, 'k', 30_000, 5, 60_000);
    expect(second.resetAt).toBe(65_000); // unchanged mid-window
  });

  it('starts a fresh window once the previous one has elapsed', () => {
    const store = new Map<string, RateEntry>();
    rateHit(store, 'k', 0, 1, 1000); // allowed
    expect(rateHit(store, 'k', 500, 1, 1000).allowed).toBe(false); // still in window
    const fresh = rateHit(store, 'k', 1000, 1, 1000); // window elapsed → reset
    expect(fresh.allowed).toBe(true);
    expect(fresh.resetAt).toBe(2000);
  });

  it('computes retryAfterSec as ceil(seconds to reset), at least 1 when blocked', () => {
    const store = new Map<string, RateEntry>();
    rateHit(store, 'k', 0, 1, 60_000); // allowed
    const blocked = rateHit(store, 'k', 100, 1, 60_000); // 59_900ms left → 60s
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('returns retryAfterSec 0 while allowed', () => {
    const store = new Map<string, RateEntry>();
    expect(rateHit(store, 'k', 0, 5, 1000).retryAfterSec).toBe(0);
  });

  it('keys are independent', () => {
    const store = new Map<string, RateEntry>();
    rateHit(store, 'a', 0, 1, 1000);
    expect(rateHit(store, 'a', 0, 1, 1000).allowed).toBe(false);
    expect(rateHit(store, 'b', 0, 1, 1000).allowed).toBe(true); // fresh key
  });
});

describe('pruneExpired', () => {
  it('drops only entries whose window has elapsed', () => {
    const store = new Map<string, RateEntry>([
      ['live', { count: 1, resetAt: 2000 }],
      ['dead', { count: 9, resetAt: 500 }],
      ['edge', { count: 3, resetAt: 1000 }], // now >= resetAt → dead
    ]);
    pruneExpired(store, 1000);
    expect([...store.keys()].sort()).toEqual(['live']);
  });
});

describe('rateLimitConfig', () => {
  const orig = { limit: process.env.API_RATE_LIMIT, win: process.env.API_RATE_WINDOW_MS };
  afterEach(() => {
    if (orig.limit === undefined) delete process.env.API_RATE_LIMIT;
    else process.env.API_RATE_LIMIT = orig.limit;
    if (orig.win === undefined) delete process.env.API_RATE_WINDOW_MS;
    else process.env.API_RATE_WINDOW_MS = orig.win;
  });

  it('is disabled when API_RATE_LIMIT is unset', () => {
    delete process.env.API_RATE_LIMIT;
    expect(rateLimitConfig()).toEqual({ enabled: false, limit: 0, windowMs: 0 });
  });

  it('is disabled for zero or negative or non-numeric limits', () => {
    for (const v of ['0', '-5', 'abc', '']) {
      process.env.API_RATE_LIMIT = v;
      expect(rateLimitConfig().enabled).toBe(false);
    }
  });

  it('enables with a positive limit and defaults the window to 60s', () => {
    process.env.API_RATE_LIMIT = '120';
    delete process.env.API_RATE_WINDOW_MS;
    expect(rateLimitConfig()).toEqual({ enabled: true, limit: 120, windowMs: 60_000 });
  });

  it('honours a custom positive window and falls back to 60s otherwise', () => {
    process.env.API_RATE_LIMIT = '10';
    process.env.API_RATE_WINDOW_MS = '5000';
    expect(rateLimitConfig().windowMs).toBe(5000);
    process.env.API_RATE_WINDOW_MS = '0';
    expect(rateLimitConfig().windowMs).toBe(60_000);
    process.env.API_RATE_WINDOW_MS = 'nope';
    expect(rateLimitConfig().windowMs).toBe(60_000);
  });
});

describe('activationRateConfig', () => {
  // The paywall's budget is deliberately NOT the general one. These pin the three ways it
  // differs, because each was a decision rather than a default falling out of the code.
  const KEYS = ['SAAS_ACTIVATE_RATE_LIMIT', 'SAAS_ACTIVATE_RATE_WINDOW_MS'] as const;
  const orig = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
  });

  it('is ON by default, at 5 per hour', () => {
    for (const k of KEYS) delete process.env[k];
    expect(activationRateConfig({})).toEqual({
      enabled: true,
      limit: ACTIVATION_RATE_DEFAULT.limit,
      windowMs: ACTIVATION_RATE_DEFAULT.windowMs,
    });
  });

  it('is far tighter than the general API budget', () => {
    // Not a tautology: it is the reason the separate variable exists at all.
    process.env.API_RATE_LIMIT = '30';
    process.env.API_RATE_WINDOW_MS = '60000';
    const general = rateLimitConfig();
    const activation = activationRateConfig({});
    const perHour = (c: { limit: number; windowMs: number }) => (c.limit / c.windowMs) * 3_600_000;
    expect(perHour(activation)).toBeLessThan(perHour(general) / 100);
  });

  it('honours an explicit override of count and window', () => {
    const cfg = activationRateConfig({
      SAAS_ACTIVATE_RATE_LIMIT: '2',
      SAAS_ACTIVATE_RATE_WINDOW_MS: '900000',
    });
    expect(cfg).toEqual({ enabled: true, limit: 2, windowMs: 900_000 });
  });

  it('turns off ONLY for an explicit zero or negative', () => {
    for (const v of ['0', '-1']) {
      expect(activationRateConfig({ SAAS_ACTIVATE_RATE_LIMIT: v
    }).enabled)
        .toBe(false);
    }
  });

  it('falls back to the default for a typo, never to off', () => {
    // The failure mode this exists to prevent: a fat-fingered env value silently removing
    // the only guard on the paid-plan door.
    for (const v of ['abc', '', '  ', 'five']) {
      const cfg = activationRateConfig({ SAAS_ACTIVATE_RATE_LIMIT: v
    });
      expect(cfg.enabled).toBe(true);
      expect(cfg.limit).toBe(ACTIVATION_RATE_DEFAULT.limit);
    }
  });
});
