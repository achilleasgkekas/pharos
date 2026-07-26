import { describe, expect, it } from 'vitest';
import { fxApplyPatch, isValidFxRate, FX_APPLY_SELECT } from './fxApply';

// lib/fxApply.ts — turning a rate-less foreign record into a converted one, in place from
// the /reports audit panel (P9 slice 9). This is the one place in the feature that can
// corrupt stored money, so the guards (never twice, never on a base-currency record) and
// the per-module field lists are pinned here.

const BASE = 'EUR';

describe('isValidFxRate', () => {
  it('accepts ordinary and extreme real-world rates', () => {
    expect(isValidFxRate(0.92)).toBe(true); // USD -> EUR
    expect(isValidFxRate(3.02)).toBe(true); // KWD -> EUR
    expect(isValidFxRate(0.00006)).toBe(true); // IDR -> EUR
  });

  it('rejects zero, negative, absurd and non-numeric input', () => {
    expect(isValidFxRate(0)).toBe(false);
    expect(isValidFxRate(-1)).toBe(false);
    expect(isValidFxRate(1e7)).toBe(false);
    expect(isValidFxRate('abc')).toBe(false);
    expect(isValidFxRate(NaN)).toBe(false);
    expect(isValidFxRate(undefined)).toBe(false);
  });
});

describe('fxApplyPatch — guards', () => {
  const doc = { currency: 'USD', origAmount: 100, fxRate: 0, amount: 100 };

  it('refuses an invalid rate', () => {
    expect(fxApplyPatch('expense', doc, 0, BASE)).toBeNull();
    expect(fxApplyPatch('expense', doc, -2, BASE)).toBeNull();
  });

  it('refuses a record that ALREADY has a rate (never converts twice)', () => {
    // The whole safety story: pressing Apply on a stale panel must be a no-op, not a
    // second multiplication.
    const converted = { currency: 'USD', origAmount: 100, fxRate: 0.92, amount: 92 };
    expect(fxApplyPatch('expense', converted, 0.92, BASE)).toBeNull();
  });

  it('refuses a base-currency record', () => {
    expect(fxApplyPatch('expense', { currency: 'EUR', origAmount: 100, fxRate: 0 }, 0.92, BASE)).toBeNull();
  });

  it('refuses a foreign record with no printed amount', () => {
    // origAmount 0 is how a pre-P9 row looks; there is nothing to convert from.
    expect(fxApplyPatch('expense', { currency: 'USD', origAmount: 0, fxRate: 0 }, 0.92, BASE)).toBeNull();
  });
});

describe('fxApplyPatch — expenses, income and bills (one amount)', () => {
  it('converts the amount from the printed figure and stores the rate', () => {
    const patch = fxApplyPatch('expense', { currency: 'USD', origAmount: 88, fxRate: 0, amount: 88 }, 0.92, BASE);
    expect(patch).toEqual({ fxRate: 0.92, amount: 80.96 });
  });

  it('treats income the same way', () => {
    const patch = fxApplyPatch('income', { currency: 'USD', origAmount: 200, fxRate: 0, amount: 200 }, 0.92, BASE);
    expect(patch).toEqual({ fxRate: 0.92, amount: 184 });
  });

  it('treats bills the same way', () => {
    const patch = fxApplyPatch('bill', { currency: 'GBP', origAmount: 50, fxRate: 0, amount: 50 }, 1.18, BASE);
    expect(patch).toEqual({ fxRate: 1.18, amount: 59 });
  });

  it('rounds to cents', () => {
    const patch = fxApplyPatch('expense', { currency: 'USD', origAmount: 33.33, fxRate: 0 }, 0.917, BASE) as Record<string, number>;
    expect(patch.amount).toBe(30.56);
  });

  it('leaves split shares alone (they are entered in base currency)', () => {
    const patch = fxApplyPatch(
      'expense',
      { currency: 'USD', origAmount: 88, fxRate: 0, amount: 88, split: [{ name: 'Nikos', share: 20 }] },
      0.92,
      BASE
    ) as Record<string, unknown>;
    expect(patch.split).toBeUndefined();
  });
});

describe('fxApplyPatch — subscriptions (recurring + first charge)', () => {
  it('converts both money figures with the same rate', () => {
    const patch = fxApplyPatch(
      'subscription',
      { currency: 'USD', origAmount: 20, fxRate: 0, amount: 20, firstChargeAmount: 10 },
      0.9,
      BASE
    );
    expect(patch).toEqual({ fxRate: 0.9, amount: 18, firstChargeAmount: 9 });
  });

  it('omits the first charge when there is none', () => {
    const patch = fxApplyPatch(
      'subscription',
      { currency: 'USD', origAmount: 20, fxRate: 0, amount: 20, firstChargeAmount: 0 },
      0.9,
      BASE
    ) as Record<string, unknown>;
    expect(patch.firstChargeAmount).toBeUndefined();
  });
});

describe('fxApplyPatch — receipts (total, net, VAT and every line)', () => {
  it('converts the whole money side, lines by dotted path', () => {
    // Reports sum vatAmount and line prices are copied into Item.purchasedPrice, so a
    // receipt converted only at the total would poison both.
    const patch = fxApplyPatch(
      'receipt',
      {
        currency: 'USD',
        origAmount: 100,
        fxRate: 0,
        total: 100,
        subtotal: 80,
        vatAmount: 20,
        lineItems: [{ name: 'Cable', price: 40 }, { name: 'Hub', price: 40 }],
      },
      0.5,
      BASE
    );
    expect(patch).toEqual({
      fxRate: 0.5,
      total: 50,
      subtotal: 40,
      vatAmount: 10,
      'lineItems.0.price': 20,
      'lineItems.1.price': 20,
    });
  });

  it('writes line prices as dotted paths, never replacing the array', () => {
    // Replacing lineItems wholesale would drop names, quantities and VAT rates.
    const patch = fxApplyPatch(
      'receipt',
      { currency: 'USD', origAmount: 10, fxRate: 0, total: 10, subtotal: 0, vatAmount: 0, lineItems: [{ name: 'X', price: 10 }] },
      2,
      BASE
    ) as Record<string, unknown>;
    expect(patch.lineItems).toBeUndefined();
    expect(patch['lineItems.0.price']).toBe(20);
  });

  it('handles a receipt with no line items', () => {
    const patch = fxApplyPatch('receipt', { currency: 'USD', origAmount: 10, fxRate: 0, total: 10 }, 2, BASE);
    expect(patch).toEqual({ fxRate: 2, total: 20, subtotal: 0, vatAmount: 0 });
  });
});

describe('fxApplyPatch — items (three prices, one rate)', () => {
  it('converts all three prices', () => {
    const patch = fxApplyPatch(
      'item',
      { currency: 'USD', origAmount: 500, fxRate: 0, currentPrice: 480, purchasedPrice: 500, targetPrice: 400 },
      0.9,
      BASE
    );
    expect(patch).toEqual({ fxRate: 0.9, currentPrice: 432, purchasedPrice: 450, targetPrice: 360 });
  });

  it('leaves an unset purchased/target price null rather than writing 0', () => {
    // A shopping item has no purchase price; writing 0 would read as "paid nothing".
    const patch = fxApplyPatch(
      'item',
      { currency: 'USD', origAmount: 300, fxRate: 0, currentPrice: 300, purchasedPrice: null, targetPrice: null },
      0.9,
      BASE
    ) as Record<string, unknown>;
    expect(patch).toEqual({ fxRate: 0.9, currentPrice: 270 });
    expect(patch.purchasedPrice).toBeUndefined();
    expect(patch.targetPrice).toBeUndefined();
  });
});

describe('fxApplyPatch — statements (headline, minimum, paid, every charge)', () => {
  it('converts the whole document, charges by dotted path', () => {
    // computeInstallmentPlans sums transaction amounts into the payoff figures shown on
    // the homepage, so the lines must move with the total.
    const patch = fxApplyPatch(
      'statement',
      {
        currency: 'USD',
        origAmount: 1000,
        fxRate: 0,
        totalAmount: 1000,
        minimumPayment: 100,
        paidAmount: 250,
        transactions: [{ amount: 600 }, { amount: 400 }],
      },
      0.5,
      BASE
    );
    expect(patch).toEqual({
      fxRate: 0.5,
      totalAmount: 500,
      minimumPayment: 50,
      paidAmount: 125,
      'transactions.0.amount': 300,
      'transactions.1.amount': 200,
    });
  });

  it('never replaces the transactions array (installment info and product links live there)', () => {
    const patch = fxApplyPatch(
      'statement',
      { currency: 'USD', origAmount: 10, fxRate: 0, totalAmount: 10, transactions: [{ amount: 10, matchedItemIds: ['x'] }] },
      2,
      BASE
    ) as Record<string, unknown>;
    expect(patch.transactions).toBeUndefined();
    expect(patch['transactions.0.amount']).toBe(20);
  });

  it('handles a statement with no charges parsed yet', () => {
    const patch = fxApplyPatch('statement', { currency: 'USD', origAmount: 10, fxRate: 0, totalAmount: 10 }, 2, BASE);
    expect(patch).toEqual({ fxRate: 2, totalAmount: 20, minimumPayment: 0, paidAmount: 0 });
  });
});

describe('FX_APPLY_SELECT', () => {
  it('loads every field the patch for that kind reads', () => {
    // A field missing from the projection reads as 0 and would silently zero a real amount.
    expect(FX_APPLY_SELECT.receipt).toContain('lineItems');
    expect(FX_APPLY_SELECT.receipt).toContain('vatAmount');
    expect(FX_APPLY_SELECT.statement).toContain('transactions');
    expect(FX_APPLY_SELECT.statement).toContain('minimumPayment');
    expect(FX_APPLY_SELECT.item).toContain('purchasedPrice');
    expect(FX_APPLY_SELECT.item).toContain('targetPrice');
    expect(FX_APPLY_SELECT.subscription).toContain('firstChargeAmount');
  });

  it('always loads the three P9 fields the guard needs', () => {
    for (const sel of Object.values(FX_APPLY_SELECT)) {
      expect(sel).toContain('currency');
      expect(sel).toContain('origAmount');
      expect(sel).toContain('fxRate');
    }
  });
});
