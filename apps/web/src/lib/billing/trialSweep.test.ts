import { describe, it, expect } from 'vitest';
import {
  shouldWarnTrial,
  planTrialWarnings,
  trialWarningFilter,
  dunningEmail,
  WARN_BEFORE_DAYS,
} from './trialSweep';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-05T00:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

describe('shouldWarnTrial', () => {
  it('warns a trialing tenant ending within the window', () => {
    expect(shouldWarnTrial({ status: 'trialing', trialEndsAt: inDays(2) }, NOW)).toBe(true);
  });

  it('warns at the exact edge of the window (3 days out)', () => {
    expect(shouldWarnTrial({ status: 'trialing', trialEndsAt: inDays(WARN_BEFORE_DAYS) }, NOW)).toBe(true);
  });

  it('does not warn a trial ending beyond the window', () => {
    // 3.5 days → ceil(daysLeft) = 4 > 3
    expect(shouldWarnTrial({ status: 'trialing', trialEndsAt: inDays(3.5) }, NOW)).toBe(false);
  });

  it('does not warn an already-expired trial (that path suspends)', () => {
    expect(shouldWarnTrial({ status: 'trialing', trialEndsAt: inDays(-1) }, NOW)).toBe(false);
  });

  it('does not warn an open-ended trial (no end stamped)', () => {
    expect(shouldWarnTrial({ status: 'trialing', trialEndsAt: null }, NOW)).toBe(false);
  });

  it('does not warn a non-trialing tenant', () => {
    expect(shouldWarnTrial({ status: 'active', trialEndsAt: inDays(1) }, NOW)).toBe(false);
    expect(shouldWarnTrial({ status: 'suspended', trialEndsAt: inDays(1) }, NOW)).toBe(false);
  });
});

describe('planTrialWarnings', () => {
  it('returns only the ids inside the warn window, skipping blanks', () => {
    const ids = planTrialWarnings(
      [
        { id: 'a', status: 'trialing', trialEndsAt: inDays(1) }, // warn
        { id: 'b', status: 'trialing', trialEndsAt: inDays(10) }, // too far
        { id: 'c', status: 'active', trialEndsAt: inDays(1) }, // not trialing
        { id: '', status: 'trialing', trialEndsAt: inDays(1) }, // blank id skipped
        { id: 'd', status: 'trialing', trialEndsAt: inDays(-1) }, // expired → not warned
      ],
      NOW
    );
    expect(ids).toEqual(['a']);
  });

  it('tolerates empty / garbage input', () => {
    expect(planTrialWarnings([], NOW)).toEqual([]);
    // @ts-expect-error garbage guard
    expect(planTrialWarnings(null, NOW)).toEqual([]);
  });
});

describe('trialWarningFilter', () => {
  it('narrows to un-warned trialing tenants inside the window', () => {
    const f = trialWarningFilter(NOW) as {
      status: string;
      trialWarnEmailedAt: null;
      trialEndsAt: { $gt: Date; $lte: Date };
    };
    expect(f.status).toBe('trialing');
    expect(f.trialWarnEmailedAt).toBeNull();
    expect(f.trialEndsAt.$gt).toEqual(NOW);
    expect(f.trialEndsAt.$lte).toEqual(inDays(WARN_BEFORE_DAYS));
  });
});

describe('dunningEmail', () => {
  it('says "tomorrow" for 1 day left', () => {
    const e = dunningEmail('Acme', 1);
    expect(e.subject).toBe('Your Acme trial ends tomorrow');
    expect(e.html).toContain('Acme');
  });

  it('says "in N days" for multi-day, and clamps garbage to the window', () => {
    expect(dunningEmail('Acme', 3).subject).toBe('Your Acme trial ends in 3 days');
    // negative / out-of-range days are clamped into [1, WARN_BEFORE_DAYS]
    expect(dunningEmail('Acme', -5).subject).toBe('Your Acme trial ends tomorrow');
    expect(dunningEmail('Acme', 99).subject).toBe(`Your Acme trial ends in ${WARN_BEFORE_DAYS} days`);
    expect(dunningEmail('Acme', NaN).subject).toBe(`Your Acme trial ends in ${WARN_BEFORE_DAYS} days`);
  });

  it('falls back to a generic name when blank', () => {
    expect(dunningEmail('', 2).subject).toBe('Your your Pharos workspace trial ends in 2 days');
  });
});
