import { describe, expect, it } from 'vitest';
import {
  CLAIM_STATUSES,
  CLAIM_STATUSES_APPLY_TO,
  DEFAULT_STALE_CLAIM_DAYS,
  MAX_WARRANTY_CLAIMS,
  activeClaim,
  claimDaysSinceUpdate,
  claimIsOpen,
  claimIsStale,
  normalizeClaimStatus,
  normalizeWarrantyClaims,
  openClaims,
  parseWarrantyClaims,
  warrantyClaimsApply,
  type WarrantyClaim,
} from './warrantyClaims';

const DAY = 86400000;
const NOW = Date.parse('2026-09-06T12:00:00Z');

function claim(over: Partial<WarrantyClaim> = {}): WarrantyClaim {
  return {
    ref: 'RMA-1',
    status: 'submitted',
    reportedAt: '2026-09-01',
    lastUpdateAt: null,
    trackingNumber: '',
    notes: '',
    ...over,
  };
}

describe('which items a claim applies to', () => {
  it('covers owned things you can still send back, including broken ones', () => {
    expect([...CLAIM_STATUSES_APPLY_TO]).toEqual(['received', 'installed', 'broken']);
    expect(warrantyClaimsApply('received')).toBe(true);
    expect(warrantyClaimsApply('installed')).toBe(true);
    expect(warrantyClaimsApply('broken')).toBe(true);
  });

  it('excludes a sold item: the claim went with the machine', () => {
    expect(warrantyClaimsApply('sold')).toBe(false);
  });

  it('excludes things not owned yet and missing input', () => {
    expect(warrantyClaimsApply('researching')).toBe(false);
    expect(warrantyClaimsApply('ordered')).toBe(false);
    expect(warrantyClaimsApply(null)).toBe(false);
    expect(warrantyClaimsApply(undefined)).toBe(false);
  });
});

describe('claim status', () => {
  it('keeps the five documented outcomes', () => {
    expect([...CLAIM_STATUSES]).toEqual(['submitted', 'in-repair', 'replaced', 'refunded', 'rejected']);
  });

  it('treats anything unrecognised as the state a claim starts in', () => {
    expect(normalizeClaimStatus('nonsense')).toBe('submitted');
    expect(normalizeClaimStatus('')).toBe('submitted');
    expect(normalizeClaimStatus(null)).toBe('submitted');
    expect(normalizeClaimStatus(7)).toBe('submitted');
  });

  it('accepts a stored value regardless of case or padding', () => {
    expect(normalizeClaimStatus(' In-Repair ')).toBe('in-repair');
    expect(normalizeClaimStatus('REFUNDED')).toBe('refunded');
  });

  it('counts only submitted and in-repair as still running', () => {
    expect(claimIsOpen('submitted')).toBe(true);
    expect(claimIsOpen('in-repair')).toBe(true);
    expect(claimIsOpen('replaced')).toBe(false);
    expect(claimIsOpen('refunded')).toBe(false);
    expect(claimIsOpen('rejected')).toBe(false);
  });
});

describe('normalizeWarrantyClaims', () => {
  it('drops a row with no usable report date: an empty form line is not a claim', () => {
    expect(normalizeWarrantyClaims([{ ref: 'RMA-9' }])).toEqual([]);
    expect(normalizeWarrantyClaims([{ ref: 'RMA-9', reportedAt: 'not a date' }])).toEqual([]);
    expect(normalizeWarrantyClaims([{ reportedAt: '' }])).toEqual([]);
  });

  it('keeps a claim that has no ticket number yet', () => {
    const out = normalizeWarrantyClaims([{ reportedAt: '2026-09-01' }]);
    expect(out).toHaveLength(1);
    expect(out[0].ref).toBe('');
    expect(out[0].status).toBe('submitted');
  });

  it('stores dates as plain ISO days', () => {
    const out = normalizeWarrantyClaims([
      { reportedAt: new Date('2026-09-01T22:30:00Z'), lastUpdateAt: '2026-09-04T05:00:00Z' },
    ]);
    expect(out[0].reportedAt).toBe('2026-09-01');
    expect(out[0].lastUpdateAt).toBe('2026-09-04');
  });

  it('discards an update dated before the claim existed', () => {
    const out = normalizeWarrantyClaims([{ reportedAt: '2026-09-05', lastUpdateAt: '2026-09-01' }]);
    expect(out[0].lastUpdateAt).toBeNull();
  });

  it('keeps an update on the same day as the report', () => {
    const out = normalizeWarrantyClaims([{ reportedAt: '2026-09-05', lastUpdateAt: '2026-09-05' }]);
    expect(out[0].lastUpdateAt).toBe('2026-09-05');
  });

  it('collapses the same ticket typed twice, keeping the first', () => {
    const out = normalizeWarrantyClaims([
      { ref: 'RMA-77', reportedAt: '2026-09-01', notes: 'first' },
      { ref: ' rma-77 ', reportedAt: '2026-09-03', notes: 'second' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].notes).toBe('first');
  });

  it('never collides two claims that have no number yet', () => {
    const out = normalizeWarrantyClaims([
      { reportedAt: '2026-09-01' },
      { reportedAt: '2026-09-03' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('trims and truncates instead of rejecting a long paste', () => {
    const out = normalizeWarrantyClaims([
      { reportedAt: '2026-09-01', ref: `  ${'R'.repeat(200)}  `, notes: 'x'.repeat(5000) },
    ]);
    expect(out[0].ref).toHaveLength(60);
    expect(out[0].notes).toHaveLength(1000);
  });

  it('caps the embedded array', () => {
    const many = Array.from({ length: MAX_WARRANTY_CLAIMS + 5 }, (_, i) => ({
      ref: `RMA-${i}`,
      reportedAt: '2026-09-01',
    }));
    expect(normalizeWarrantyClaims(many)).toHaveLength(MAX_WARRANTY_CLAIMS);
  });

  it('ignores junk input entirely', () => {
    expect(normalizeWarrantyClaims(null)).toEqual([]);
    expect(normalizeWarrantyClaims('nope')).toEqual([]);
    expect(normalizeWarrantyClaims([null, 5, 'x'])).toEqual([]);
  });
});

describe('parseWarrantyClaims', () => {
  it('round-trips the editor payload', () => {
    const json = JSON.stringify([{ ref: 'RMA-3', status: 'in-repair', reportedAt: '2026-09-02' }]);
    expect(parseWarrantyClaims(json)).toEqual([
      { ref: 'RMA-3', status: 'in-repair', reportedAt: '2026-09-02', lastUpdateAt: null, trackingNumber: '', notes: '' },
    ]);
  });

  it('returns an empty list rather than throwing on broken JSON', () => {
    expect(parseWarrantyClaims('{oops')).toEqual([]);
    expect(parseWarrantyClaims('')).toEqual([]);
  });
});

describe('openClaims / activeClaim', () => {
  it('keeps only running claims, newest report first', () => {
    const out = openClaims([
      claim({ ref: 'old', reportedAt: '2026-08-01' }),
      claim({ ref: 'done', reportedAt: '2026-09-05', status: 'replaced' }),
      claim({ ref: 'new', reportedAt: '2026-09-03', status: 'in-repair' }),
    ]);
    expect(out.map((c) => c.ref)).toEqual(['new', 'old']);
  });

  it('has nothing to show for an item that was never sent back', () => {
    expect(openClaims([])).toEqual([]);
    expect(openClaims(null)).toEqual([]);
    expect(activeClaim('received', [])).toBeNull();
    expect(activeClaim('received', undefined)).toBeNull();
  });

  it('picks the freshest running claim', () => {
    const a = activeClaim('broken', [claim({ ref: 'a', reportedAt: '2026-08-01' }), claim({ ref: 'b', reportedAt: '2026-09-02' })]);
    expect(a?.ref).toBe('b');
  });

  it('goes quiet once the item itself is sold', () => {
    expect(activeClaim('sold', [claim()])).toBeNull();
  });

  it('goes quiet when every claim is finished', () => {
    expect(activeClaim('received', [claim({ status: 'refunded' }), claim({ ref: 'x', status: 'rejected' })])).toBeNull();
  });
});

describe('claimDaysSinceUpdate', () => {
  it('counts from the last update when there is one', () => {
    expect(claimDaysSinceUpdate(claim({ lastUpdateAt: '2026-09-04' }), NOW)).toBe(2);
  });

  it('counts from the report date when nothing has ever moved', () => {
    expect(claimDaysSinceUpdate(claim({ reportedAt: '2026-09-01' }), NOW)).toBe(5);
  });

  it('never goes negative for a date in the future', () => {
    expect(claimDaysSinceUpdate(claim({ lastUpdateAt: '2026-09-30' }), NOW)).toBe(0);
  });

  it('says nothing about a finished claim', () => {
    expect(claimDaysSinceUpdate(claim({ status: 'replaced' }), NOW)).toBeNull();
    expect(claimDaysSinceUpdate(null, NOW)).toBeNull();
  });
});

describe('claimIsStale', () => {
  it('fires on an open claim nobody has touched for the window', () => {
    const old = claim({ reportedAt: new Date(NOW - DEFAULT_STALE_CLAIM_DAYS * DAY).toISOString().slice(0, 10) });
    expect(claimIsStale(old, DEFAULT_STALE_CLAIM_DAYS, NOW)).toBe(true);
  });

  it('stays quiet one day short of the window', () => {
    const recent = claim({ reportedAt: new Date(NOW - (DEFAULT_STALE_CLAIM_DAYS - 1) * DAY).toISOString().slice(0, 10) });
    expect(claimIsStale(recent, DEFAULT_STALE_CLAIM_DAYS, NOW)).toBe(false);
  });

  it('is reset by an update, however old the claim itself is', () => {
    const nudged = claim({ reportedAt: '2026-01-01', lastUpdateAt: '2026-09-05' });
    expect(claimIsStale(nudged, DEFAULT_STALE_CLAIM_DAYS, NOW)).toBe(false);
  });

  it('never fires on a closed claim, however long ago it ended', () => {
    expect(claimIsStale(claim({ reportedAt: '2020-01-01', status: 'rejected' }), DEFAULT_STALE_CLAIM_DAYS, NOW)).toBe(false);
  });
});
