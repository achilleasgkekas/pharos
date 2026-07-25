import { describe, expect, it } from 'vitest';
import { fxNeedsRateFilter, fxIssueHref, itemFxKindRoute, sortFxIssues, type FxIssueRow } from './fxAudit';

// lib/fxAudit.ts — the DB-free half of the missing-exchange-rate audit (P9 slice 7):
// which stored records still carry a foreign amount with no rate, and where each one
// is edited. The DB query itself is covered by the shape asserted here.

describe('fxNeedsRateFilter', () => {
  it('excludes the base currency and blank codes', () => {
    const f = fxNeedsRateFilter('EUR') as { currency: { $nin: string[] } };
    expect(f.currency.$nin).toEqual(['', 'EUR']);
  });

  it('normalizes the base code it is given', () => {
    const f = fxNeedsRateFilter('usd') as { currency: { $nin: string[] } };
    expect(f.currency.$nin).toEqual(['', 'USD']);
  });

  it('falls back to EUR for a junk base code', () => {
    const f = fxNeedsRateFilter('') as { currency: { $nin: string[] } };
    expect(f.currency.$nin).toEqual(['', 'EUR']);
  });

  it('requires a printed amount, so base-currency records never match', () => {
    // Every model defaults `currency` to 'EUR', so pre-P9 rows carry a code but no
    // origAmount; this clause is what keeps them out of the audit.
    const f = fxNeedsRateFilter('EUR') as { origAmount: { $gt: number } };
    expect(f.origAmount).toEqual({ $gt: 0 });
  });

  it('matches a missing fxRate field as well as a zero one', () => {
    const f = fxNeedsRateFilter('EUR') as { $or: Record<string, unknown>[] };
    expect(f.$or).toEqual([{ fxRate: { $lte: 0 } }, { fxRate: null }]);
  });
});

describe('fxIssueHref', () => {
  it('routes expenses and income to their separate pages', () => {
    // Same model, two routes: linking both to /expenses would open nothing for income.
    expect(fxIssueHref('expense', 'a1')).toBe('/expenses?open=a1');
    expect(fxIssueHref('income', 'a1')).toBe('/income?open=a1');
  });

  it('uses the ?open= deep-link convention for every other kind', () => {
    expect(fxIssueHref('receipt', 'r1')).toBe('/receipts?open=r1');
    expect(fxIssueHref('item', 'i1')).toBe('/items?open=i1');
    expect(fxIssueHref('subscription', 's1')).toBe('/subscriptions?open=s1');
    expect(fxIssueHref('statement', 'st1')).toBe('/statements?open=st1');
  });
});

describe('itemFxKindRoute', () => {
  it('sends owned items to /items', () => {
    expect(itemFxKindRoute('received')).toBe('/items');
    expect(itemFxKindRoute('installed')).toBe('/items');
    expect(itemFxKindRoute('sold')).toBe('/items');
  });

  it('sends everything else to /shopping', () => {
    expect(itemFxKindRoute('researching')).toBe('/shopping');
    expect(itemFxKindRoute('ordered')).toBe('/shopping');
    expect(itemFxKindRoute('')).toBe('/shopping');
    expect(itemFxKindRoute(null)).toBe('/shopping');
  });
});

describe('sortFxIssues', () => {
  const row = (id: string, origAmount: number): FxIssueRow => ({
    kind: 'expense',
    id,
    title: id,
    subtitle: '',
    currency: 'USD',
    origAmount,
    href: `/expenses?open=${id}`,
  });

  it('puts the biggest printed amount first', () => {
    const out = sortFxIssues([row('a', 4), row('b', 900), row('c', 88)]);
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const input = [row('a', 4), row('b', 900)];
    sortFxIssues(input);
    expect(input.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
