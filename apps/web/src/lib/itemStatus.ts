// Items split into two views:
//   Inventory ("Αποθήκη")  = things you already own
//   Shopping  ("Προς αγορά") = things you want to buy / are tracking

export const OWNED_STATUSES = ['received', 'installed', 'sold', 'broken'] as const;
export const SHOPPING_STATUSES = ['researching', 'decided', 'ordered', 'deferred'] as const;

/**
 * Items whose warranty is still worth being told about: things you HAVE. A sold or broken item's
 * warranty expiring is not news, and a shopping-list entry has no warranty yet.
 *
 * One list, because three surfaces announce warranties — the calendar/agenda, the in-app bell and
 * the outbound push — and they must agree. When only the calendar learned to skip sold items, the
 * other two kept firing for them; this is the same drift #254 closed for prices.
 */
export const WARRANTY_ALERT_STATUSES = ['received', 'installed'] as const;

export type ItemView = 'inventory' | 'shopping';

export function statusesFor(view: ItemView): readonly string[] {
  return view === 'inventory' ? OWNED_STATUSES : SHOPPING_STATUSES;
}

export const VIEW_CONFIG: Record<
  ItemView,
  {
    title: string;
    eyebrow: string;
    defaultStatus: string;
    statusFilters: { label: string; value: string }[];
    emptyEmoji: string;
    emptyText: string;
  }
> = {
  inventory: {
    title: 'Inventory',
    eyebrow: 'Inventory · what I own',
    defaultStatus: 'received',
    statusFilters: [
      { label: 'All', value: '' },
      { label: 'Received', value: 'received' },
      { label: 'Installed', value: 'installed' },
      { label: 'Sold', value: 'sold' },
      { label: 'Broken', value: 'broken' },
    ],
    emptyEmoji: '📦',
    emptyText: 'Inventory is empty. Whatever you buy (or add from a receipt) shows up here.',
  },
  shopping: {
    title: 'Shopping',
    eyebrow: 'Shopping list · wishlist',
    defaultStatus: 'researching',
    statusFilters: [
      { label: 'All', value: '' },
      { label: 'Researching', value: 'researching' },
      { label: 'Decided', value: 'decided' },
      { label: 'Ordered', value: 'ordered' },
      { label: 'Deferred', value: 'deferred' },
    ],
    emptyEmoji: '🛒',
    emptyText: 'Nothing to buy yet. Hit + to add something.',
  },
};
