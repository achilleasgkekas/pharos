import { describe, it, expect } from 'vitest';
import {
  evaluateTrialLapse,
  planTrialLapses,
  lapsedTrialFilter,
  LAPSED_TRIAL_STATUS,
} from './trialLapse';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-05T00:00:00.000Z');
const future = new Date(NOW.getTime() + 5 * DAY);
const past = new Date(NOW.getTime() - DAY);

describe('evaluateTrialLapse', () => {
  it('lapses a trialing tenant whose end has passed → suspended', () => {
    const d = evaluateTrialLapse({ status: 'trialing', trialEndsAt: past }, NOW);
    expect(d).toEqual({ shouldLapse: true, nextStatus: 'suspended', reason: 'trial-expired' });
    expect(d.nextStatus).toBe(LAPSED_TRIAL_STATUS);
  });

  it('lapses exactly at the boundary (end === now)', () => {
    const d = evaluateTrialLapse({ status: 'trialing', trialEndsAt: NOW }, NOW);
    expect(d.shouldLapse).toBe(true);
    expect(d.reason).toBe('trial-expired');
  });

  it('does not lapse a trial still in the future', () => {
    const d = evaluateTrialLapse({ status: 'trialing', trialEndsAt: future }, NOW);
    expect(d).toEqual({ shouldLapse: false, nextStatus: null, reason: 'not-expired' });
  });

  it('does not lapse an open-ended trial (no end date)', () => {
    const d = evaluateTrialLapse({ status: 'trialing', trialEndsAt: null }, NOW);
    expect(d).toEqual({ shouldLapse: false, nextStatus: null, reason: 'not-expired' });
  });

  it('never lapses a non-trialing tenant even with a past end', () => {
    for (const status of ['active', 'suspended', 'canceled', 'pending']) {
      const d = evaluateTrialLapse({ status, trialEndsAt: past }, NOW);
      expect(d).toEqual({ shouldLapse: false, nextStatus: null, reason: 'not-trialing' });
    }
  });

  it('accepts a serialized (string) end date', () => {
    const d = evaluateTrialLapse({ status: 'trialing', trialEndsAt: past.toISOString() }, NOW);
    expect(d.shouldLapse).toBe(true);
  });
});

describe('planTrialLapses', () => {
  it('returns only the ids of lapsed trialing tenants', () => {
    const ids = planTrialLapses(
      [
        { id: 'a', status: 'trialing', trialEndsAt: past }, // lapse
        { id: 'b', status: 'trialing', trialEndsAt: future }, // active trial
        { id: 'c', status: 'active', trialEndsAt: past }, // converted
        { id: 'd', status: 'trialing', trialEndsAt: null }, // open-ended
        { id: 'e', status: 'trialing', trialEndsAt: past }, // lapse
      ],
      NOW
    );
    expect(ids).toEqual(['a', 'e']);
  });

  it('skips rows with a missing/blank id', () => {
    const ids = planTrialLapses(
      [
        { id: '', status: 'trialing', trialEndsAt: past },
        // @ts-expect-error deliberately malformed row
        { status: 'trialing', trialEndsAt: past },
        { id: 'ok', status: 'trialing', trialEndsAt: past },
      ],
      NOW
    );
    expect(ids).toEqual(['ok']);
  });

  it('is empty for a non-array / empty input', () => {
    expect(planTrialLapses([], NOW)).toEqual([]);
    // @ts-expect-error guarding runtime garbage
    expect(planTrialLapses(null, NOW)).toEqual([]);
  });
});

describe('lapsedTrialFilter', () => {
  it('narrows to trialing tenants with an end at/before now', () => {
    expect(lapsedTrialFilter(NOW)).toEqual({
      status: 'trialing',
      trialEndsAt: { $lte: NOW },
    });
  });
});
