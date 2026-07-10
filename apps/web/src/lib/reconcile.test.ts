import { describe, it, expect } from 'vitest';
import {
  reconcile,
  DEFAULT_DAY_TOLERANCE,
  DEFAULT_AMOUNT_TOLERANCE,
  type ReconTxnInput,
  type ReconReceiptInput,
} from './reconcile';

const tx = (over: Partial<ReconTxnInput> = {}): ReconTxnInput => ({
  id: 't1',
  date: '2026-06-10',
  description: 'SKROUTZ ATHENS',
  amount: 129.98,
  matchedReceiptId: null,
  ...over,
});

const rc = (over: Partial<ReconReceiptInput> = {}): ReconReceiptInput => ({
  id: 'r1',
  store: 'Skroutz',
  date: '2026-06-10',
  total: 129.98,
  ...over,
});

describe('reconcile — amount matching', () => {
  it('matches an exact same-day charge to its receipt', () => {
    const res = reconcile([tx()], [rc()]);
    expect(res.txns[0].candidates).toHaveLength(1);
    expect(res.txns[0].candidates[0].receiptId).toBe('r1');
    expect(res.txns[0].candidates[0].amountDiff).toBeCloseTo(0);
    expect(res.txns[0].candidates[0].dayDiff).toBe(0);
    expect(res.txns[0].candidates[0].storeMatch).toBe(true);
  });

  it('rejects a receipt whose total differs beyond the amount tolerance', () => {
    const res = reconcile([tx({ amount: 129.98 })], [rc({ total: 131.5 })]);
    expect(res.txns[0].candidates).toHaveLength(0);
  });

  it('accepts a cent-level rounding difference within tolerance', () => {
    const res = reconcile([tx({ amount: 129.99 })], [rc({ total: 129.98 })]);
    expect(res.txns[0].candidates).toHaveLength(1);
    expect(res.txns[0].candidates[0].amountDiff).toBeCloseTo(0.01);
  });

  it('matches a refund/credit (negative charge) by absolute amount', () => {
    const res = reconcile([tx({ amount: -129.98 })], [rc()]);
    expect(res.txns[0].candidates).toHaveLength(1);
  });

  it('ignores receipts with a zero/absent total', () => {
    const res = reconcile([tx({ amount: 0 })], [rc({ total: 0 })]);
    expect(res.txns[0].candidates).toHaveLength(0);
  });
});

describe('reconcile — date window', () => {
  it('accepts a receipt within the ±3 day default window', () => {
    const res = reconcile([tx({ date: '2026-06-12' })], [rc({ date: '2026-06-10' })]);
    expect(res.txns[0].candidates).toHaveLength(1);
    expect(res.txns[0].candidates[0].dayDiff).toBe(2);
  });

  it('rejects a receipt outside the day tolerance', () => {
    const res = reconcile([tx({ date: '2026-06-20' })], [rc({ date: '2026-06-10' })]);
    expect(res.txns[0].candidates).toHaveLength(0);
  });

  it('ignores the time-of-day component (same calendar day = 0)', () => {
    const res = reconcile(
      [tx({ date: '2026-06-10T23:30:00Z' })],
      [rc({ date: '2026-06-10T01:00:00Z' })]
    );
    expect(res.txns[0].candidates[0].dayDiff).toBe(0);
  });

  it('honours a custom day tolerance', () => {
    const near = reconcile([tx({ date: '2026-06-15' })], [rc({ date: '2026-06-10' })], {
      dayTolerance: 7,
    });
    expect(near.txns[0].candidates).toHaveLength(1);
    expect(near.txns[0].candidates[0].dayDiff).toBe(5);
  });
});

describe('reconcile — ranking', () => {
  it('ranks a same-day store-token match above a distant no-token match', () => {
    const res = reconcile(
      [tx({ description: 'SKROUTZ' })],
      [
        rc({ id: 'far', store: 'Some Other Shop', date: '2026-06-13' }),
        rc({ id: 'near', store: 'Skroutz', date: '2026-06-10' }),
      ]
    );
    expect(res.txns[0].candidates[0].receiptId).toBe('near');
    expect(res.txns[0].candidates[0].score).toBeGreaterThan(res.txns[0].candidates[1].score);
  });

  it('caps the candidate list at maxCandidates', () => {
    const receipts = Array.from({ length: 6 }, (_, i) =>
      rc({ id: `r${i}`, store: 'Skroutz', date: '2026-06-10' })
    );
    const res = reconcile([tx()], receipts, { maxCandidates: 2 });
    expect(res.txns[0].candidates).toHaveLength(2);
  });

  it('is deterministic for identical-score candidates (stable id tiebreak)', () => {
    const receipts = [
      rc({ id: 'bbb', store: 'Skroutz', date: '2026-06-10' }),
      rc({ id: 'aaa', store: 'Skroutz', date: '2026-06-10' }),
    ];
    const a = reconcile([tx()], receipts);
    const b = reconcile([tx()], receipts.slice().reverse());
    expect(a.txns[0].candidates.map((c) => c.receiptId)).toEqual(['aaa', 'bbb']);
    expect(b.txns[0].candidates.map((c) => c.receiptId)).toEqual(['aaa', 'bbb']);
  });
});

describe('reconcile — confirmed links & unmatched flagging', () => {
  it('carries through an existing confirmed match', () => {
    const res = reconcile([tx({ matchedReceiptId: 'r1' })], [rc()]);
    expect(res.txns[0].matchedReceiptId).toBe('r1');
  });

  it('lists receipts not confirm-linked to any transaction as unmatched', () => {
    const res = reconcile(
      [tx({ id: 't1', matchedReceiptId: 'r1' })],
      [rc({ id: 'r1' }), rc({ id: 'r2', store: 'Public', total: 40 })]
    );
    expect(res.unmatchedReceiptIds).toEqual(['r2']);
  });

  it('treats every priced receipt as unmatched when nothing is linked', () => {
    const res = reconcile([tx()], [rc({ id: 'r1' }), rc({ id: 'r2', total: 5 })]);
    expect(res.unmatchedReceiptIds.sort()).toEqual(['r1', 'r2']);
  });

  it('surfaces a charge with no receipt as zero candidates (charge without receipt)', () => {
    const res = reconcile([tx({ amount: 999.99 })], [rc()]);
    expect(res.txns[0].candidates).toHaveLength(0);
    expect(res.txns[0].matchedReceiptId).toBeNull();
  });
});

describe('reconcile — defaults exported', () => {
  it('exposes sane defaults', () => {
    expect(DEFAULT_DAY_TOLERANCE).toBe(3);
    expect(DEFAULT_AMOUNT_TOLERANCE).toBeCloseTo(0.02);
  });
});
