import { describe, it, expect } from 'vitest';
import {
  billDaysUntilDue, billStatus, billIsOpen, nextBillDue,
  billPaidAmount, billRemaining, billPaymentState, billIsSettledByPayments,
} from './bill';

const DAY = 86400000;
const NOW = Date.parse('2026-07-10T12:00:00Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe('billDaysUntilDue', () => {
  it('returns null for missing/invalid dates', () => {
    expect(billDaysUntilDue(null, NOW)).toBeNull();
    expect(billDaysUntilDue('', NOW)).toBeNull();
    expect(billDaysUntilDue('not-a-date', NOW)).toBeNull();
  });
  it('is positive for future, negative for past', () => {
    expect(billDaysUntilDue(iso(5), NOW)).toBe(5);
    expect(billDaysUntilDue(iso(-3), NOW)).toBe(-3);
  });
  it('ceils partial days', () => {
    expect(billDaysUntilDue(new Date(NOW + 0.5 * DAY).toISOString(), NOW)).toBe(1);
  });
});

describe('billStatus', () => {
  it('paid wins regardless of due date', () => {
    expect(billStatus(iso(-30), iso(-1), NOW)).toBe('paid');
    expect(billStatus(iso(10), iso(0), NOW)).toBe('paid');
  });
  it('overdue when unpaid and past due', () => {
    expect(billStatus(iso(-1), null, NOW)).toBe('overdue');
  });
  it('due-soon within the window', () => {
    expect(billStatus(iso(0), null, NOW)).toBe('due-soon');
    expect(billStatus(iso(7), null, NOW)).toBe('due-soon');
  });
  it('upcoming beyond the window', () => {
    expect(billStatus(iso(8), null, NOW)).toBe('upcoming');
    expect(billStatus(iso(60), null, NOW)).toBe('upcoming');
  });
  it('respects a custom soonDays', () => {
    expect(billStatus(iso(10), null, NOW, 14)).toBe('due-soon');
    expect(billStatus(iso(10), null, NOW, 3)).toBe('upcoming');
  });
  it('unpaid with no due date is upcoming, not overdue', () => {
    expect(billStatus(null, null, NOW)).toBe('upcoming');
  });
});

describe('billIsOpen', () => {
  it('open only when unpaid and not archived', () => {
    expect(billIsOpen(null, false)).toBe(true);
    expect(billIsOpen(iso(-1), false)).toBe(false);
    expect(billIsOpen(null, true)).toBe(false);
  });
});

// P61 — partial payments. The point of these: a bill that is half paid AND late must keep
// reporting `overdue`, and the arithmetic must not drift on the float sums that instalments
// inevitably produce (33.33 x 3).
describe('billPaidAmount', () => {
  it('is zero for a bill that was never part-paid', () => {
    expect(billPaidAmount(undefined)).toBe(0);
    expect(billPaidAmount(null)).toBe(0);
    expect(billPaidAmount([])).toBe(0);
  });
  it('sums instalments and rounds to cents', () => {
    expect(billPaidAmount([{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.34 }])).toBe(100);
    expect(billPaidAmount([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
  it('ignores junk entries instead of turning the total into NaN', () => {
    expect(billPaidAmount([{ amount: 10 }, { amount: null }, {}])).toBe(10);
  });
});

describe('billRemaining', () => {
  it('is the full amount when nothing was paid', () => {
    expect(billRemaining(120, [])).toBe(120);
  });
  it('subtracts the instalments', () => {
    expect(billRemaining(120, [{ amount: 50 }, { amount: 20 }])).toBe(50);
  });
  it('never goes negative on an overpayment', () => {
    expect(billRemaining(100, [{ amount: 150 }])).toBe(0);
  });
  it('is zero once the bill is explicitly paid', () => {
    expect(billRemaining(100, [{ amount: 20 }], iso(-1))).toBe(0);
  });
});

describe('billPaymentState', () => {
  it('unpaid when nothing was logged', () => {
    expect(billPaymentState(100, [])).toBe('unpaid');
  });
  it('partially-paid while a balance remains', () => {
    expect(billPaymentState(100, [{ amount: 40 }])).toBe('partially-paid');
  });
  it('paid once the instalments cover the amount', () => {
    expect(billPaymentState(100, [{ amount: 60 }, { amount: 40 }])).toBe('paid');
    expect(billPaymentState(100, [{ amount: 120 }])).toBe('paid');
  });
  it('an explicit paidAt wins over the instalments', () => {
    expect(billPaymentState(100, [{ amount: 40 }], iso(-1))).toBe('paid');
  });
  it('a zero-amount bill is never auto-settled by a payment', () => {
    expect(billPaymentState(0, [{ amount: 10 }])).toBe('partially-paid');
  });
});

describe('billIsSettledByPayments', () => {
  it('true only when a real total is covered', () => {
    expect(billIsSettledByPayments(100, [{ amount: 100 }])).toBe(true);
    expect(billIsSettledByPayments(100, [{ amount: 99.99 }])).toBe(false);
    expect(billIsSettledByPayments(0, [{ amount: 5 }])).toBe(false);
    expect(billIsSettledByPayments(100, [])).toBe(false);
  });
});

describe('billStatus with partial payments (orthogonality)', () => {
  it('a half-paid overdue bill still reports overdue, not progress', () => {
    // billStatus knows nothing about payments by design — urgency is never masked.
    expect(billStatus(iso(-5), null, NOW)).toBe('overdue');
    expect(billPaymentState(100, [{ amount: 40 }])).toBe('partially-paid');
  });
});

describe('nextBillDue', () => {
  const base = '2026-07-10T00:00:00Z';
  it('advances by cycle', () => {
    expect(nextBillDue(base, 'weekly').toISOString().slice(0, 10)).toBe('2026-07-17');
    expect(nextBillDue(base, 'monthly').toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(nextBillDue(base, 'quarterly').toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(nextBillDue(base, 'yearly').toISOString().slice(0, 10)).toBe('2027-07-10');
  });
  it('defaults unknown cycle to monthly', () => {
    expect(nextBillDue(base, '').toISOString().slice(0, 10)).toBe('2026-08-10');
  });
});
