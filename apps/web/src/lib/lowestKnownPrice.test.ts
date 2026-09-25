import { describe, it, expect } from 'vitest';
import { lowestKnownPrice } from './lowestKnownPrice';
import { marketFor } from './shoppingRegion';

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

  it('prefers priced store links over currentPrice, even a lower one (#212)', () => {
    // A stale hand-typed 50 must not make an item a deal when the best shop asks 75.
    expect(
      lowestKnownPrice({
        currentPrice: 50,
        links: [{ price: 100 }, { price: 75 }],
      })
    ).toBe(75);

    // store link is lower
    expect(
      lowestKnownPrice({
        currentPrice: 100,
        links: [{ price: 120 }, { price: 65 }],
      })
    ).toBe(65);
  });

  it('falls back to currentPrice when no link carries a price', () => {
    expect(lowestKnownPrice({ currentPrice: 50, links: [{ price: null }, { price: 0 }] })).toBe(50);
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

describe('lowestKnownPrice with a shopping market (#319)', () => {
  const GR = marketFor('GR', ['amazon.de']);
  const links = [
    { url: 'https://www.newegg.com/p/1', price: 760 },
    { url: 'https://www.skroutz.gr/s/1', price: 794 },
    { url: 'https://www.amazon.de/dp/1', price: 820 },
  ];

  it('ignores shops outside the market', () => {
    expect(lowestKnownPrice({ links }, GR)).toBe(794);
  });

  it('is unchanged without a market', () => {
    expect(lowestKnownPrice({ links }, null)).toBe(760);
    expect(lowestKnownPrice({ links })).toBe(760);
  });

  it('has no price when every priced link is out of market, even with a currentPrice', () => {
    // currentPrice is derived from the cheapest link on save and by the scraper, so falling back
    // to it would bring the Newegg price straight back.
    expect(lowestKnownPrice({ currentPrice: 760, links: [links[0]] }, GR)).toBeNull();
  });

  it('still counts a link with no URL, and falls back to currentPrice when no link is priced', () => {
    expect(lowestKnownPrice({ links: [{ price: 700 }, links[1]] }, GR)).toBe(700);
    expect(lowestKnownPrice({ currentPrice: 650, links: [{ url: 'https://www.newegg.com/p/1', price: null }] }, GR)).toBe(650);
  });
});
