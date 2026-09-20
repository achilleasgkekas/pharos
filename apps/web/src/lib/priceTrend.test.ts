import { describe, it, expect } from 'vitest';
import { calculatePriceTrend } from './priceTrend';

describe('calculatePriceTrend', () => {
  it('does NOT create a phantom trend when scraping two different stores for the first time', () => {
    // Store A costs $100, scraped at T1. Store B costs $90, scraped at T2.
    const priceHistory = [
      { price: 100, store: 'Store A', url: 'https://store-a.com/item', date: '2026-03-01T10:00:00Z' },
      { price: 90, store: 'Store B', url: 'https://store-b.com/item', date: '2026-03-01T10:05:00Z' },
    ];

    // Best/cheapest store is Store B
    const targetStore = { store: 'Store B', url: 'https://store-b.com/item' };

    const trend = calculatePriceTrend(priceHistory, targetStore);

    // Should NOT report a -$10 drop between Store B and Store A
    expect(trend).toBeNull();
  });

  it('calculates trend correctly when the same store changes price over time', () => {
    const priceHistory = [
      { price: 100, store: 'Store A', url: 'https://store-a.com/item', date: '2026-03-01T10:00:00Z' },
      { price: 90, store: 'Store B', url: 'https://store-b.com/item', date: '2026-03-01T10:05:00Z' },
      { price: 85, store: 'Store B', url: 'https://store-b.com/item', date: '2026-03-02T10:00:00Z' },
    ];

    const targetStore = { store: 'Store B', url: 'https://store-b.com/item' };

    const trend = calculatePriceTrend(priceHistory, targetStore);

    // Store B went from 90 to 85 -> -5
    expect(trend).toBe(-5);
  });

  it('calculates trend for single-store / manual items without URLs', () => {
    const priceHistory = [
      { price: 100, store: 'manual', date: '2026-03-01T10:00:00Z' },
      { price: 80, store: 'manual', date: '2026-03-02T10:00:00Z' },
    ];

    const trend = calculatePriceTrend(priceHistory);

    expect(trend).toBe(-20);
  });
});
