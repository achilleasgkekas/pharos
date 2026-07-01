import { describe, expect, it } from 'vitest';
import {
  OWNED_STATUSES,
  SHOPPING_STATUSES,
  VIEW_CONFIG,
  statusesFor,
  type ItemView,
} from './itemStatus';

// itemStatus.ts is a pure, dependency-free module describing the two item views
// (inventory = owned, shopping = wishlist): their status vocabularies and the
// per-view UI config. No DB, no clock, no fs.

describe('statusesFor', () => {
  it('returns the owned statuses for the inventory view', () => {
    expect(statusesFor('inventory')).toBe(OWNED_STATUSES);
    expect([...statusesFor('inventory')]).toEqual(['received', 'installed', 'sold', 'broken']);
  });

  it('returns the shopping statuses for the shopping view', () => {
    expect(statusesFor('shopping')).toBe(SHOPPING_STATUSES);
    expect([...statusesFor('shopping')]).toEqual(['researching', 'decided', 'ordered', 'deferred']);
  });

  it('keeps the two vocabularies disjoint', () => {
    const owned = new Set<string>(OWNED_STATUSES);
    for (const s of SHOPPING_STATUSES) expect(owned.has(s)).toBe(false);
  });
});

describe('VIEW_CONFIG', () => {
  const views: ItemView[] = ['inventory', 'shopping'];

  it('has an entry for each view', () => {
    expect(Object.keys(VIEW_CONFIG).sort()).toEqual(['inventory', 'shopping']);
  });

  it("each view's defaultStatus belongs to that view's status vocabulary", () => {
    for (const v of views) {
      expect([...statusesFor(v)]).toContain(VIEW_CONFIG[v].defaultStatus);
    }
  });

  it('inventory config wires the expected copy and default', () => {
    const c = VIEW_CONFIG.inventory;
    expect(c.title).toBe('Inventory');
    expect(c.defaultStatus).toBe('received');
    expect(c.emptyEmoji).toBe('📦');
    expect(c.emptyText.length).toBeGreaterThan(0);
  });

  it('shopping config wires the expected copy and default', () => {
    const c = VIEW_CONFIG.shopping;
    expect(c.title).toBe('Shopping');
    expect(c.defaultStatus).toBe('researching');
    expect(c.emptyEmoji).toBe('🛒');
    expect(c.emptyText.length).toBeGreaterThan(0);
  });

  it('every statusFilters list leads with an "All" (empty-value) option', () => {
    for (const v of views) {
      const [first] = VIEW_CONFIG[v].statusFilters;
      expect(first).toEqual({ label: 'All', value: '' });
    }
  });

  it('non-"All" filter values map 1:1 onto the view status vocabulary', () => {
    for (const v of views) {
      const filterValues = VIEW_CONFIG[v].statusFilters
        .map((f) => f.value)
        .filter((val) => val !== '');
      expect(filterValues.sort()).toEqual([...statusesFor(v)].sort());
    }
  });

  it('filter values are unique within each view', () => {
    for (const v of views) {
      const values = VIEW_CONFIG[v].statusFilters.map((f) => f.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
