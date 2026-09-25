import { describe, it, expect } from 'vitest';
import {
  billDaysUntilDue, billStatus, billIsOpen, nextBillDue,
  billPaidAmount, billNeedsRate, billRemaining, billPaymentState, billIsSettledByPayments,
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
    expect(billRemaining({ amount: 120, payments: [] }, 'EUR')).toBe(120);
  });
  it('subtracts the instalments', () => {
    expect(billRemaining({ amount: 120, payments: [{ amount: 50 }, { amount: 20 }] }, 'EUR')).toBe(50);
  });
  it('never goes negative on an overpayment', () => {
    expect(billRemaining({ amount: 100, payments: [{ amount: 150 }] }, 'EUR')).toBe(0);
  });
  it('is zero once the bill is explicitly paid', () => {
    expect(billRemaining({ amount: 100, payments: [{ amount: 20 }], paidAt: iso(-1) }, 'EUR')).toBe(0);
  });
});

describe('billPaymentState', () => {
  it('unpaid when nothing was logged', () => {
    expect(billPaymentState({ amount: 100, payments: [] }, 'EUR')).toBe('unpaid');
  });
  it('partially-paid while a balance remains', () => {
    expect(billPaymentState({ amount: 100, payments: [{ amount: 40 }] }, 'EUR')).toBe('partially-paid');
  });
  it('paid once the instalments cover the amount', () => {
    expect(billPaymentState({ amount: 100, payments: [{ amount: 60 }, { amount: 40 }] }, 'EUR')).toBe('paid');
    expect(billPaymentState({ amount: 100, payments: [{ amount: 120 }] }, 'EUR')).toBe('paid');
  });
  it('an explicit paidAt wins over the instalments', () => {
    expect(billPaymentState({ amount: 100, payments: [{ amount: 40 }], paidAt: iso(-1) }, 'EUR')).toBe('paid');
  });
  it('a zero-amount bill is never auto-settled by a payment', () => {
    expect(billPaymentState({ amount: 0, payments: [{ amount: 10 }] }, 'EUR')).toBe('partially-paid');
  });
});

describe('billIsSettledByPayments', () => {
  it('true only when a real total is covered', () => {
    expect(billIsSettledByPayments({ amount: 100, payments: [{ amount: 100 }] }, 'EUR')).toBe(true);
    expect(billIsSettledByPayments({ amount: 100, payments: [{ amount: 99.99 }] }, 'EUR')).toBe(false);
    expect(billIsSettledByPayments({ amount: 0, payments: [{ amount: 5 }] }, 'EUR')).toBe(false);
    expect(billIsSettledByPayments({ amount: 100, payments: [] }, 'EUR')).toBe(false);
  });
});

describe('billStatus with partial payments (orthogonality)', () => {
  it('a half-paid overdue bill still reports overdue, not progress', () => {
    // billStatus knows nothing about payments by design — urgency is never masked.
    expect(billStatus(iso(-5), null, NOW)).toBe('overdue');
    expect(billPaymentState({ amount: 100, payments: [{ amount: 40 }] }, 'EUR')).toBe('partially-paid');
  });
});

describe('#297: a foreign bill with no exchange rate', () => {
  // $100 printed, no rate: `amount` still holds 100, but it is dollars, not euros.
  const noRate = { amount: 100, currency: 'USD', origAmount: 100, fxRate: 0 };

  it('is flagged by billNeedsRate, and stops being flagged once a rate is in', () => {
    expect(billNeedsRate(noRate, 'EUR')).toBe(true);
    expect(billNeedsRate({ ...noRate, amount: 92, fxRate: 0.92 }, 'EUR')).toBe(false);
    // Printed in the base currency after all: nothing to convert.
    expect(billNeedsRate(noRate, 'USD')).toBe(false);
  });

  it('has no base-currency remaining, rather than the printed figure', () => {
    expect(billRemaining(noRate, 'EUR')).toBeNull();
    expect(billRemaining({ ...noRate, payments: [{ amount: 40 }] }, 'EUR')).toBeNull();
    // Once explicitly paid there is nothing left, whatever the currency.
    expect(billRemaining({ ...noRate, paidAt: iso(-1) }, 'EUR')).toBe(0);
  });

  it('is never settled by base-currency instalments that numerically reach the printed amount', () => {
    const paid = { ...noRate, payments: [{ amount: 60 }, { amount: 40 }] };
    expect(billIsSettledByPayments(paid, 'EUR')).toBe(false);
    expect(billPaymentState(paid, 'EUR')).toBe('partially-paid');
    expect(billPaymentState(noRate, 'EUR')).toBe('unpaid');
  });

  it('settles normally once converted: EUR 92 of instalments cover $100 @ 0.92', () => {
    const converted = { ...noRate, amount: 92, fxRate: 0.92, payments: [{ amount: 92 }] };
    expect(billIsSettledByPayments(converted, 'EUR')).toBe(true);
    expect(billRemaining({ ...converted, payments: [{ amount: 50 }] }, 'EUR')).toBe(42);
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
