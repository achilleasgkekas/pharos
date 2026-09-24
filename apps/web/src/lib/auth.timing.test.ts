import { describe, it, expect, vi, beforeEach } from 'vitest';

// The login paths used to read `if (!user || !verifyPassword(...))`. With no matching account
// `!user` short-circuited and scrypt never ran, so a wrong USERNAME answered measurably faster
// than a wrong password — timing the endpoint revealed which usernames exist.
//
// This used to be a wall-clock test (median of five runs, ratio above 0.5). It passed alone and
// failed under the full parallel suite: timings measured at different moments of CPU contention
// swing too far. So it asserts the MECHANISM instead of the clock — scrypt runs exactly once on
// both paths. That is deterministic, and it is the property that actually matters: equal work
// is what makes the two failures indistinguishable.
//
// Its own file because it replaces `node:crypto`'s `scryptSync` with a counting spy (the real
// implementation underneath), and no other test should run against that.
const scryptCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>();
  return {
    ...real,
    scryptSync: (...args: Parameters<typeof real.scryptSync>) => {
      scryptCalls.n++;
      return real.scryptSync(...args);
    },
  };
});

import { hashPassword, verifyPasswordFor } from './auth';

const real = hashPassword('correct horse battery staple');

beforeEach(() => {
  // Build the lazy dummy hash first, so its one-off hashPassword call is not counted below.
  verifyPasswordFor('warm-up', null);
  scryptCalls.n = 0;
});

describe('verifyPasswordFor — no account costs the same work as a wrong password', () => {
  it('runs scrypt once for a wrong password against a real account', () => {
    expect(verifyPasswordFor('wrong', real)).toBe(false);
    expect(scryptCalls.n).toBe(1);
  });

  it('ALSO runs scrypt once when there is no account at all', () => {
    for (const stored of [null, undefined, '']) {
      scryptCalls.n = 0;
      expect(verifyPasswordFor('wrong', stored)).toBe(false);
      expect(scryptCalls.n, String(stored)).toBe(1);
    }
  });
});
