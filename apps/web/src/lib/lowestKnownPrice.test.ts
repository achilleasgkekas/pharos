import { describe, it, expect } from 'vitest';
import { lowestKnownPrice } from './lowestKnownPrice';

describe('lowestKnownPrice', () => {
  it('returns null when item has no currentPrice and no links', () => {
    expect(lowestKnownPrice({})).toBeNull();
    expect(lowestKnownPrice({ currentPrice: null, links: null })).toBeNull();
    expect(lowestKnownPrice({ currentPrice: 0, links: [] })).toBeNull();
    expect(lowestKnownPrice({ currentPrice: -10, links: [{ price: 0 }, { price: null }] })).toBeNull();
  });

  it('returns currentPrice when it is positive and there are no links', () => {
    expect(lowestKnownPrice({ currentPrice: 100 })).toBe(100);
    expect(lowestKnownPrice({ currentPrice: 49.99, links: [] })).toBe(49.99);
  });

  it('returns lowest link price when currentPrice is absent or non-positive', () => {
    expect(lowestKnownPrice({ links: [{ price: 150 }, { price: 120 }] })).toBe(120);
    expect(
      lowestKnownPrice({
        currentPrice: 0,
        links: [{ price: null }, { price: 80 }, { price: 95 }, { price: 0 }],
      })
    ).toBe(80);
  });

  it('returns the minimum between currentPrice and store links', () => {
    // currentPrice is lower
    expect(
      lowestKnownPrice({
        currentPrice: 50,
        links: [{ price: 100 }, { price: 75 }],
      })
    ).toBe(50);

    // store link is lower
    expect(
      lowestKnownPrice({
        currentPrice: 100,
        links: [{ price: 120 }, { price: 65 }],
      })
    ).toBe(65);
  });

  it('ignores non-positive and invalid prices', () => {
    expect(
      lowestKnownPrice({
        currentPrice: -5,
        links: [{ price: -10 }, { price: 0 }, { price: undefined }, { price: 25 }],
      })
    ).toBe(25);
  });
});
