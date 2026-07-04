import { describe, it, expect } from 'vitest';
import { trialEndFrom, evaluateTrial, DEFAULT_TRIAL_DAYS } from './trial';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-04T00:00:00.000Z');

describe('trialEndFrom', () => {
  it('adds the default trial length to the start', () => {
    const end = trialEndFrom(NOW);
    expect(end.getTime()).toBe(NOW.getTime() + DEFAULT_TRIAL_DAYS * DAY);
  });

  it('honours an explicit day count', () => {
    expect(trialEndFrom(NOW, 30).getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(trialEndFrom(NOW, 0).getTime()).toBe(NOW.getTime());
  });

  it('accepts string / number starts', () => {
    expect(trialEndFrom('2026-07-04T00:00:00.000Z', 7).getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(trialEndFrom(NOW.getTime(), 7).getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it('falls back to now for a garbage start and to the default for a garbage day count', () => {
    expect(trialEndFrom('not-a-date', 10, NOW).getTime()).toBe(NOW.getTime() + 10 * DAY);
    // negative / NaN days → default length
    expect(trialEndFrom(NOW, -5).getTime()).toBe(NOW.getTime() + DEFAULT_TRIAL_DAYS * DAY);
    expect(trialEndFrom(NOW, Number.NaN).getTime()).toBe(NOW.getTime() + DEFAULT_TRIAL_DAYS * DAY);
  });

  it('floors fractional day counts', () => {
    expect(trialEndFrom(NOW, 3.9).getTime()).toBe(NOW.getTime() + 3 * DAY);
  });
});

describe('evaluateTrial', () => {
  it('reports no trial for a non-trialing tenant', () => {
    expect(evaluateTrial({ status: 'active', trialEndsAt: null }, NOW)).toEqual({
      onTrial: false,
      expired: false,
      daysLeft: null,
    });
    // even with a future end, a converted tenant is not on trial
    const future = new Date(NOW.getTime() + 5 * DAY);
    expect(evaluateTrial({ status: 'suspended', trialEndsAt: future }, NOW).onTrial).toBe(false);
  });

  it('treats a trialing tenant with no end date as an open-ended trial', () => {
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: null }, NOW)).toEqual({
      onTrial: true,
      expired: false,
      daysLeft: null,
    });
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: 'garbage' }, NOW).daysLeft).toBeNull();
  });

  it('counts up remaining days (ceil) for a future end', () => {
    const end = new Date(NOW.getTime() + 3 * DAY);
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: end }, NOW)).toEqual({
      onTrial: true,
      expired: false,
      daysLeft: 3,
    });
    // a partial final day still reads as 1
    const soon = new Date(NOW.getTime() + DAY / 2);
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: soon }, NOW).daysLeft).toBe(1);
  });

  it('marks the trial expired once the end is reached or passed', () => {
    const past = new Date(NOW.getTime() - DAY);
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: past }, NOW)).toEqual({
      onTrial: false,
      expired: true,
      daysLeft: 0,
    });
    // exact boundary (remaining 0) counts as expired
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: NOW }, NOW).expired).toBe(true);
  });

  it('accepts a serialized ISO / epoch end date', () => {
    const iso = new Date(NOW.getTime() + 2 * DAY).toISOString();
    expect(evaluateTrial({ status: 'trialing', trialEndsAt: iso }, NOW).daysLeft).toBe(2);
    expect(
      evaluateTrial({ status: 'trialing', trialEndsAt: NOW.getTime() + 2 * DAY }, NOW).daysLeft
    ).toBe(2);
  });
});
