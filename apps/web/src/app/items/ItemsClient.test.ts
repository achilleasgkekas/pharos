import { describe, it, expect } from 'vitest';
import { lowestKnown, isDeal } from './ItemsClient';
import type { SerializedItem } from '@/types';

function mockItem(partial: Partial<SerializedItem>): SerializedItem {
  return {
    _id: 'item1',
    title: 'Test Item',
    category: 'other',
    status: 'researching',
    currentPrice: 0,
    purchasedPrice: null,
    targetPrice: null,
    links: [],
    photos: [],
    receiptIds: [],
    priceHistory: [],
    customFields: [],
    attachments: [],
    tags: [],
    specs: '',
    notes: '',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...partial,
  } as SerializedItem;
}

describe('lowestKnown & isDeal', () => {
  it('ignores currentPrice when valid priced links exist', () => {
    // Scenario: user manually inputs $50 as currentPrice and targetPrice $60.
    // Later adds a store link costing $80.
    const item = mockItem({
      currentPrice: 50,
      targetPrice: 60,
      links: [
        { label: 'Store A', url: 'https://storeA.com/item', price: 80 },
      ],
    });

    // lowestKnown should ignore stale currentPrice (50) and return best store link price (80)
    expect(lowestKnown(item)).toBe(80);
    // isDeal should return false since 80 > 60 (targetPrice)
    expect(isDeal(item)).toBe(false);
  });

  it('falls back to currentPrice when no valid priced links exist', () => {
    const itemWithPrice = mockItem({
      currentPrice: 50,
      targetPrice: 60,
      links: [
        { label: 'Store B', url: 'https://storeB.com/item', price: null },
      ],
    });

    expect(lowestKnown(itemWithPrice)).toBe(50);
    expect(isDeal(itemWithPrice)).toBe(true); // 50 <= 60

    const itemZeroPrice = mockItem({
      currentPrice: 0,
      targetPrice: 60,
      links: [],
    });

    expect(lowestKnown(itemZeroPrice)).toBeNull();
    expect(isDeal(itemZeroPrice)).toBe(false);
  });
});
