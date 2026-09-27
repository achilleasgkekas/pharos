import { describe, it, expect } from 'vitest';
import { MAX_BUNDLE_LENGTH, normalizeBundle, summarizeBundles } from './bundles';

describe('normalizeBundle', () => {
  it('treats blank, whitespace and non-strings as "no bundle"', () => {
    expect(normalizeBundle('')).toBe('');
    expect(normalizeBundle('   ')).toBe('');
    expect(normalizeBundle(null)).toBe('');
    expect(normalizeBundle(42)).toBe('');
  });

  it('trims and collapses inner whitespace so one build does not split in two', () => {
    expect(normalizeBundle('  Battle   Station ')).toBe('Battle Station');
  });

  it('caps the length', () => {
    expect(normalizeBundle('x'.repeat(200))).toHaveLength(MAX_BUNDLE_LENGTH);
  });
});

describe('summarizeBundles', () => {
  it('skips items that are not part of a bundle', () => {
    expect(summarizeBundles([{ bundle: '', status: 'installed', purchasedPrice: 100 }, { status: 'received' }])).toEqual([]);
  });

  it('rolls up invested, left to buy and the per-stage counts', () => {
    const [s] = summarizeBundles([
      { bundle: 'Battle Station', status: 'installed', purchasedPrice: 400, currentPrice: 350 },
      { bundle: 'Battle Station', status: 'received', purchasedPrice: null, currentPrice: 120.5 },
      { bundle: 'Battle Station', status: 'ordered', purchasedPrice: 80 },
      { bundle: 'Battle Station', status: 'researching', currentPrice: 60 },
      { bundle: 'Battle Station', status: 'decided', currentPrice: 40 },
      { bundle: 'Battle Station', status: 'deferred', currentPrice: 999 },
    ]);
    expect(s).toEqual({
      name: 'Battle Station',
      parts: 6,
      invested: 600.5, // 400 paid + 120.5 asking (no purchase price typed) + 80 ordered
      toBuy: 100, // deferred is parked, not about to be paid
      planned: 3,
      ordered: 1,
      received: 1,
      installed: 1,
    });
  });

  it('keeps sold and broken parts in the invested money but not in a stage count', () => {
    const [s] = summarizeBundles([
      { bundle: 'NAS', status: 'sold', purchasedPrice: 200 },
      { bundle: 'NAS', status: 'broken', purchasedPrice: 50 },
    ]);
    expect(s.parts).toBe(2);
    expect(s.invested).toBe(250);
    expect(s.planned + s.ordered + s.received + s.installed).toBe(0);
  });

  it('groups names that differ only by stray whitespace and sorts by name', () => {
    const out = summarizeBundles([
      { bundle: 'Rack', status: 'installed', purchasedPrice: 10 },
      { bundle: ' 10G  upgrade', status: 'installed', purchasedPrice: 5 },
      { bundle: '10G upgrade', status: 'ordered', purchasedPrice: 5 },
    ]);
    expect(out.map((s) => [s.name, s.parts])).toEqual([
      ['10G upgrade', 2],
      ['Rack', 1],
    ]);
  });

  it('ignores negative and non-finite prices', () => {
    const [s] = summarizeBundles([
      { bundle: 'X', status: 'installed', purchasedPrice: -5, currentPrice: Number.NaN },
      { bundle: 'X', status: 'researching', currentPrice: -1 },
    ]);
    expect(s.invested).toBe(0);
    expect(s.toBuy).toBe(0);
  });
});
