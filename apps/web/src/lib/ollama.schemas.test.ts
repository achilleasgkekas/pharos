import { describe, it, expect } from 'vitest';
import {
  ParsedReceiptSchema,
  ParsedStatementSchema,
  ParsedProductSchema,
  ParsedCardSchema,
  ParsedSubscriptionSchema,
  ParsedExpenseSchema,
  ParsedVoucherSchema,
} from './ollama';

/**
 * These Zod schemas are the trust boundary for untrusted AI JSON output: every
 * receipt / statement / product / card / subscription / expense / voucher the
 * model returns is `.parse()`-d through one of them before it touches the DB.
 * The tests below lock the coercion contract (string→number, sensible defaults,
 * `.catch()` fallbacks on invalid enums, the `tags` preprocess) so a model that
 * returns a slightly-off shape degrades predictably instead of throwing or
 * silently persisting garbage.
 */

describe('ParsedReceiptSchema', () => {
  it('parses a full well-formed receipt', () => {
    const r = ParsedReceiptSchema.parse({
      store: 'Πλαίσιο',
      date: '2025-09-23',
      total: 149.5,
      subtotal: 120.56,
      vatAmount: 28.94,
      warrantyMonths: 24,
      currency: 'EUR',
      paymentMethod: 'Mastercard 7791',
      lineItems: [{ name: 'WD BLUE SN570 250', qty: 1, price: 40, vatRate: 24 }],
    });
    expect(r.store).toBe('Πλαίσιο');
    expect(r.total).toBe(149.5);
    expect(r.lineItems).toHaveLength(1);
  });

  it('coerces numeric strings (model often emits numbers as strings)', () => {
    const r = ParsedReceiptSchema.parse({ store: 'X', date: '2026-01-01', total: '287.28' });
    expect(r.total).toBe(287.28);
    expect(typeof r.total).toBe('number');
  });

  it('applies defaults for the optional money + meta fields', () => {
    const r = ParsedReceiptSchema.parse({ store: 'X', date: '2026-01-01', total: 10 });
    expect(r.subtotal).toBe(0);
    expect(r.vatAmount).toBe(0);
    expect(r.warrantyMonths).toBe(0);
    expect(r.currency).toBe('EUR');
    expect(r.paymentMethod).toBe('');
    expect(r.lineItems).toEqual([]);
  });

  it('fills per-line-item defaults (qty 1, price 0, vatRate 24, refinedName "")', () => {
    const r = ParsedReceiptSchema.parse({
      store: 'X',
      date: '2026-01-01',
      total: 10,
      lineItems: [{ name: 'Coffee' }],
    });
    expect(r.lineItems[0]).toMatchObject({ name: 'Coffee', refinedName: '', qty: 1, price: 0, vatRate: 24 });
  });

  it('coerces line-item numeric strings', () => {
    const r = ParsedReceiptSchema.parse({
      store: 'X',
      date: '2026-01-01',
      total: 10,
      lineItems: [{ name: 'Item', qty: '2', price: '5.5', vatRate: '13' }],
    });
    expect(r.lineItems[0]).toMatchObject({ qty: 2, price: 5.5, vatRate: 13 });
  });

  it('throws when a required field is missing (store/date/total)', () => {
    expect(() => ParsedReceiptSchema.parse({ date: '2026-01-01', total: 10 })).toThrow();
    expect(() => ParsedReceiptSchema.parse({ store: 'X', total: 10 })).toThrow();
    expect(() => ParsedReceiptSchema.parse({ store: 'X', date: '2026-01-01' })).toThrow();
  });

  it('throws when total is non-numeric (comma decimals must be dot-normalized upstream)', () => {
    expect(() => ParsedReceiptSchema.parse({ store: 'X', date: '2026-01-01', total: '12,50' })).toThrow();
  });
});

describe('ParsedStatementSchema', () => {
  it('defaults everything for an empty object', () => {
    const s = ParsedStatementSchema.parse({});
    expect(s).toMatchObject({
      card: '',
      last4: '',
      period: '',
      statementDate: '',
      dueDate: '',
      totalAmount: 0,
      minimumPayment: 0,
      transactions: [],
    });
  });

  it('coerces statement totals and per-transaction amounts', () => {
    const s = ParsedStatementSchema.parse({
      totalAmount: '1234.56',
      minimumPayment: '50',
      transactions: [{ date: '2026-04-03', description: 'PLAISIO', amount: '39.47' }],
    });
    expect(s.totalAmount).toBe(1234.56);
    expect(s.minimumPayment).toBe(50);
    expect(s.transactions[0].amount).toBe(39.47);
  });

  it('keeps installment counters as coerced numbers when present, undefined when absent', () => {
    const s = ParsedStatementSchema.parse({
      transactions: [
        { date: '2026-04-03', description: 'PLAISIO', amount: 39.47, currentInstallment: '9', totalInstallments: '12' },
        { date: '2026-04-03', description: 'COFFEE', amount: 3.5 },
      ],
    });
    expect(s.transactions[0]).toMatchObject({ currentInstallment: 9, totalInstallments: 12 });
    expect(s.transactions[1].currentInstallment).toBeUndefined();
    expect(s.transactions[1].totalInstallments).toBeUndefined();
  });

  it('allows a negative amount (payments / credits)', () => {
    const s = ParsedStatementSchema.parse({
      transactions: [{ date: '2026-04-03', description: 'PAYMENT', amount: -100 }],
    });
    expect(s.transactions[0].amount).toBe(-100);
  });

  it('throws when a transaction is missing a required field', () => {
    expect(() =>
      ParsedStatementSchema.parse({ transactions: [{ description: 'X', amount: 1 }] })
    ).toThrow();
  });
});

describe('ParsedProductSchema', () => {
  it('defaults everything for an empty object', () => {
    const p = ParsedProductSchema.parse({});
    expect(p).toEqual({ title: '', price: 0, currency: 'EUR', store: '', category: 'other', specs: '', tags: [] });
  });

  it('keeps a valid category and falls back to "other" for an invalid one', () => {
    expect(ParsedProductSchema.parse({ category: 'network' }).category).toBe('network');
    expect(ParsedProductSchema.parse({ category: 'nonsense' }).category).toBe('other');
  });

  it('passes an array of tags through unchanged', () => {
    expect(ParsedProductSchema.parse({ tags: ['wifi', 'router'] }).tags).toEqual(['wifi', 'router']);
  });

  it('splits a comma or semicolon tag string into an array', () => {
    expect(ParsedProductSchema.parse({ tags: 'wifi,router' }).tags).toEqual(['wifi', 'router']);
    expect(ParsedProductSchema.parse({ tags: 'a;b;c' }).tags).toEqual(['a', 'b', 'c']);
  });

  it('coerces a non-string / non-array tags value to an empty array', () => {
    expect(ParsedProductSchema.parse({ tags: 42 }).tags).toEqual([]);
    expect(ParsedProductSchema.parse({ tags: null }).tags).toEqual([]);
  });

  it('coerces the price string to a number', () => {
    expect(ParsedProductSchema.parse({ price: '299' }).price).toBe(299);
  });
});

describe('ParsedCardSchema', () => {
  it('defaults everything for an empty object', () => {
    expect(ParsedCardSchema.parse({})).toEqual({ name: '', last4: '', bank: '', type: 'other', kind: 'credit' });
  });

  it('keeps valid type/kind and falls back on invalid ones', () => {
    expect(ParsedCardSchema.parse({ type: 'visa', kind: 'debit' })).toMatchObject({ type: 'visa', kind: 'debit' });
    expect(ParsedCardSchema.parse({ type: 'discover', kind: 'prepaid' })).toMatchObject({ type: 'other', kind: 'credit' });
  });
});

describe('ParsedSubscriptionSchema', () => {
  it('defaults everything for an empty object', () => {
    expect(ParsedSubscriptionSchema.parse({})).toEqual({
      provider: '',
      category: 'other',
      amount: 0,
      currency: 'EUR',
      billingCycle: 'monthly',
      url: '',
      notes: '',
    });
  });

  it('keeps valid category/cycle and falls back on invalid ones', () => {
    expect(ParsedSubscriptionSchema.parse({ category: 'streaming', billingCycle: 'yearly' })).toMatchObject({
      category: 'streaming',
      billingCycle: 'yearly',
    });
    expect(ParsedSubscriptionSchema.parse({ category: 'bogus', billingCycle: 'biweekly' })).toMatchObject({
      category: 'other',
      billingCycle: 'monthly',
    });
  });

  it('coerces the amount string to a number', () => {
    expect(ParsedSubscriptionSchema.parse({ amount: '15.99' }).amount).toBe(15.99);
  });
});

describe('ParsedExpenseSchema', () => {
  it('defaults everything for an empty object', () => {
    expect(ParsedExpenseSchema.parse({})).toMatchObject({
      kind: 'expense',
      vendor: '',
      category: 'other',
      amount: 0,
      currency: 'EUR',
      date: '',
      period: '',
      paymentMethod: '',
      recurringCycle: '',
    });
  });

  it('keeps a valid kind and falls back to "expense" on an invalid one', () => {
    expect(ParsedExpenseSchema.parse({ kind: 'income' }).kind).toBe('income');
    expect(ParsedExpenseSchema.parse({ kind: 'refund' }).kind).toBe('expense');
  });

  it('falls back to "other" for an invalid category', () => {
    expect(ParsedExpenseSchema.parse({ category: 'nonsense' }).category).toBe('other');
  });

  it('tolerates the empty-string recurringCycle (one-off bills) and falls back on invalid', () => {
    expect(ParsedExpenseSchema.parse({ recurringCycle: '' }).recurringCycle).toBe('');
    expect(ParsedExpenseSchema.parse({ recurringCycle: 'monthly' }).recurringCycle).toBe('monthly');
    expect(ParsedExpenseSchema.parse({ recurringCycle: 'fortnightly' }).recurringCycle).toBe('');
  });

  it('coerces the amount string to a number', () => {
    expect(ParsedExpenseSchema.parse({ amount: '84.50' }).amount).toBe(84.5);
  });
});

describe('ParsedVoucherSchema', () => {
  it('defaults every field to an empty string', () => {
    expect(ParsedVoucherSchema.parse({})).toEqual({
      title: '',
      code: '',
      store: '',
      discount: '',
      expiresAt: '',
      url: '',
      notes: '',
    });
  });

  it('parses a full voucher unchanged', () => {
    const v = ParsedVoucherSchema.parse({
      title: '15% off at Skroutz',
      code: 'SUMMER15',
      store: 'Skroutz',
      discount: '15%',
      expiresAt: '2026-12-31',
      url: 'https://skroutz.gr',
      notes: 'min €50',
    });
    expect(v.code).toBe('SUMMER15');
    expect(v.expiresAt).toBe('2026-12-31');
  });
});
