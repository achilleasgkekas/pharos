import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/search-actions.ts `searchAll()` — the cross-collection global search that backs both
// the web navbar search dropdown AND (verbatim, via GET /api/v1/search — see
// api/v1/search/route.test.ts, which mocks searchAll entirely) the v1 search endpoint.
// Never directly unit-tested before; the route test only proves the auth/projection wiring,
// and lib/receiptSearch.test.ts only proves the pure `matchedLineItemName` helper in
// isolation. Neither pins the actual behaviour this file adds on top (P22): a receipt hit's
// `subtitle` gets `· <matched line item>` appended when the query matched a line item rather
// than the store name — the ONLY signal an API client has, since the v1 route drops
// everything except { type, id, title, subtitle }. That appended text is what closes the
// "API search doesn't show matched line-item" gap (P22) —
// pin it here so a refactor of search-actions.ts can't silently regress it.
//
// Approach: mock connectDB + all 7 model .find().limit().select().lean() chains (identical
// shape across every collection) via one shared chain factory, table-driven per model.

const {
  connectDBMock,
  itemFind,
  receiptFind,
  statementFind,
  taskFind,
  subscriptionFind,
  expenseFind,
  voucherFind,
  billFind,
  goalFind,
  giftCardFind,
  loyaltyCardFind,
  shoppingListFind,
} = vi.hoisted(() => {
  function chain(rows: unknown[]) {
    return { limit: () => ({ select: () => ({ lean: async () => rows }) }) };
  }
  return {
    connectDBMock: vi.fn(async () => {}),
    itemFind: vi.fn(() => chain([])),
    receiptFind: vi.fn(() => chain([])),
    statementFind: vi.fn(() => chain([])),
    taskFind: vi.fn(() => chain([])),
    subscriptionFind: vi.fn(() => chain([])),
    expenseFind: vi.fn(() => chain([])),
    voucherFind: vi.fn(() => chain([])),
    billFind: vi.fn(() => chain([])),
    goalFind: vi.fn(() => chain([])),
    giftCardFind: vi.fn(() => chain([])),
    loyaltyCardFind: vi.fn(() => chain([])),
    shoppingListFind: vi.fn(() => chain([])),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
// Tenancy seam mocked the same way as the sibling tenancy-wrapped action modules
// (bills/actions.test.ts, vouchers/actions.test.ts): withRequestTenant runs the body inline
// and currentModel hands back the very model it was given, so these tests keep pinning the
// hit-building behaviour. Tenant isolation itself lives in search-actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Task', () => ({ Task: { find: taskFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { find: voucherFind } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/models/Goal', () => ({ Goal: { find: goalFind } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { find: giftCardFind } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: { find: loyaltyCardFind } }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: { find: shoppingListFind } }));

import { searchAll } from './search-actions';

function chainOf(rows: unknown[]) {
  return { limit: () => ({ select: () => ({ lean: async () => rows }) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  itemFind.mockReturnValue(chainOf([]));
  receiptFind.mockReturnValue(chainOf([]));
  statementFind.mockReturnValue(chainOf([]));
  taskFind.mockReturnValue(chainOf([]));
  subscriptionFind.mockReturnValue(chainOf([]));
  expenseFind.mockReturnValue(chainOf([]));
  voucherFind.mockReturnValue(chainOf([]));
  billFind.mockReturnValue(chainOf([]));
  goalFind.mockReturnValue(chainOf([]));
  giftCardFind.mockReturnValue(chainOf([]));
  loyaltyCardFind.mockReturnValue(chainOf([]));
  shoppingListFind.mockReturnValue(chainOf([]));
});

describe('searchAll — min-length guard', () => {
  it('returns [] without touching the DB for a blank/1-char query', async () => {
    expect(await searchAll('')).toEqual([]);
    expect(await searchAll(' a ')).toEqual([]);
    expect(connectDBMock).not.toHaveBeenCalled();
  });
});

describe('searchAll — receipt matched line-item snippet (P22)', () => {
  it('appends the matched line item to the subtitle when the query hits a line item, not the store', async () => {
    receiptFind.mockReturnValue(
      chainOf([
        {
          _id: 'r1',
          store: 'Πλαίσιο',
          date: '2025-11-22',
          total: 149.5,
          lineItems: [{ name: 'WD BL SN570 250G', refinedName: 'WD Blue SN570 250GB NVMe' }],
        },
      ]),
    );
    const hits = await searchAll('sn570');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'receipt', id: 'r1', title: 'Πλαίσιο' });
    expect(hits[0].subtitle).toContain('WD Blue SN570 250GB NVMe');
  });

  it('does NOT append a matched-item snippet when the query matches the store name itself', async () => {
    receiptFind.mockReturnValue(
      chainOf([
        {
          _id: 'r2',
          store: 'Skroutz',
          date: '2025-10-01',
          total: 42,
          // Store-name match should short-circuit the line-item lookup even though a line
          // item ALSO happens to contain the query text — the store is already the reason.
          lineItems: [{ name: 'Skroutz gift wrap', refinedName: '' }],
        },
      ]),
    );
    const hits = await searchAll('skroutz');
    expect(hits).toHaveLength(1);
    expect(hits[0].subtitle).not.toContain('gift wrap');
  });

  it('omits the snippet entirely when no line item matches (receipt matched via another field)', async () => {
    receiptFind.mockReturnValue(
      chainOf([
        {
          _id: 'r3',
          store: 'Kotsovolos',
          date: '2025-09-15',
          total: 19.99,
          lineItems: [{ name: 'Cable', refinedName: '' }],
        },
      ]),
    );
    const hits = await searchAll('visa');
    expect(hits).toHaveLength(1);
    expect(hits[0].subtitle).toBe(`Receipt · 15/09/2025 · €19.99`);
  });

  it('prefers refinedName for display and matches only the FIRST matching line item', async () => {
    receiptFind.mockReturnValue(
      chainOf([
        {
          _id: 'r4',
          store: 'Amazon.de',
          date: '2025-08-01',
          total: 60,
          lineItems: [
            { name: 'Cable', refinedName: 'USB-C Cable' },
            { name: 'Mouse', refinedName: 'Logitech Mouse' },
          ],
        },
      ]),
    );
    const hits = await searchAll('mouse');
    expect(hits[0].subtitle).toContain('Logitech Mouse');
    expect(hits[0].subtitle).not.toContain('Cable');
  });
});

describe('searchAll — this is exactly what GET /api/v1/search forwards to API clients', () => {
  it('the matched-item text lives in `subtitle`, the only field the v1 route keeps ({ type, id, title, subtitle })', async () => {
    receiptFind.mockReturnValue(
      chainOf([
        {
          _id: 'r5',
          store: 'i-system.gr',
          date: '2025-07-04',
          total: 89,
          lineItems: [{ name: 'Crucial 16GB DDR4', refinedName: '' }],
        },
      ]),
    );
    const hits = await searchAll('crucial');
    const { type, id, title, subtitle } = hits[0];
    // Same narrowing the route applies (see api/v1/search/route.ts) — proves the API
    // payload shape already carries the snippet without any route/type change needed.
    expect({ type, id, title, subtitle }).toEqual({
      type: 'receipt',
      id: 'r5',
      title: 'i-system.gr',
      subtitle: 'Receipt · 04/07/2025 · €89 · Crucial 16GB DDR4',
    });
  });
});

// P66 — the five modules that shipped after this file was written (Bills, Goals, Gift cards,
// Loyalty cards, Shopping list) were invisible to BOTH the navbar search and the AI assistant's
// search_data tool. These pin that they are queried at all, and that each hit carries a href a
// human can actually follow, which is where the interesting per-type differences live: three of
// them have no `?open=` detail to open, and two need the /vouchers shell to switch tab first.
describe('searchAll — the five late-arriving modules (P66)', () => {
  it('queries all twelve collections, not just the original seven', async () => {
    await searchAll('milk');

    for (const find of [itemFind, receiptFind, statementFind, taskFind, subscriptionFind, expenseFind, voucherFind, billFind, goalFind, giftCardFind, loyaltyCardFind, shoppingListFind]) {
      expect(find).toHaveBeenCalledTimes(1);
    }
  });

  it('a bill hit deep-links to /bills and says whether it is still due', async () => {
    billFind.mockReturnValue(
      chainOf([{ _id: 'b1', title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 84, dueDate: new Date('2026-08-10T00:00:00Z'), paidAt: null }])
    );
    const [hit] = await searchAll('ΔΕΗ');

    expect(hit).toMatchObject({ type: 'bill', id: 'b1', title: 'ΔΕΗ ρεύμα', href: '/bills?open=b1' });
    expect(hit.subtitle).toContain('due 10/08/2026');
    expect(hit.subtitle).toContain('ΔΕΗ');
  });

  it('a paid bill says "paid" rather than a due date', async () => {
    billFind.mockReturnValue(
      chainOf([{ _id: 'b2', title: 'ΟΤΕ', amount: 29, dueDate: new Date('2026-07-01T00:00:00Z'), paidAt: new Date('2026-07-02T00:00:00Z') }])
    );
    const [hit] = await searchAll('ΟΤΕ');

    expect(hit.subtitle).toContain('paid');
    expect(hit.subtitle).not.toContain('due');
  });

  it('a goal links to the /reports section, since goals have no detail modal to open', async () => {
    goalFind.mockReturnValue(chainOf([{ _id: 'g1', title: 'Sailing trip', targetAmount: 3000, category: 'travel' }]));
    const [hit] = await searchAll('sailing');

    expect(hit).toMatchObject({ type: 'goal', id: 'g1', href: '/reports#goals' });
    expect(hit.href).not.toContain('open=');
  });

  it('a gift card reports the REMAINING balance, not its face value', async () => {
    giftCardFind.mockReturnValue(
      chainOf([{ _id: 'gc1', title: 'IKEA gift card', store: 'IKEA', initialAmount: 100, uses: [{ amount: 30 }, { amount: 12.5 }] }])
    );
    const [hit] = await searchAll('ikea');

    expect(hit).toMatchObject({ type: 'giftcard', href: '/vouchers?tab=giftcards&open=gc1' });
    // 100 − 42.50 spent. Showing the face value would be actively misleading at a till.
    expect(hit.subtitle).toContain('57.50 left');
  });

  it('a loyalty card deep-links to its own tab', async () => {
    loyaltyCardFind.mockReturnValue(chainOf([{ _id: 'lc1', title: 'AB Card', store: 'AB', cardNumber: '12345' }]));
    const [hit] = await searchAll('AB');

    expect(hit).toMatchObject({ type: 'loyaltycard', href: '/vouchers?tab=loyalty&open=lc1' });
    expect(hit.subtitle).toContain('AB');
  });

  it('a shopping-list line links to the flat list and marks bought lines', async () => {
    shoppingListFind.mockReturnValue(
      chainOf([{ _id: 'sl1', name: 'Milk', quantity: '2L', brand: 'Farma', checked: true }])
    );
    const [hit] = await searchAll('milk');

    expect(hit).toMatchObject({ type: 'shoppinglist', title: 'Milk', href: '/shopping-list' });
    expect(hit.subtitle).toContain('2L');
    expect(hit.subtitle).toContain('bought');
  });

  it('searches a loyalty card by the number printed under its barcode, not just the name', async () => {
    await searchAll('7622300');

    // The hoisted stub is declared with no parameters, so its recorded args are an empty
    // tuple as far as TS is concerned — go through `unknown` to read the real filter.
    const filter = loyaltyCardFind.mock.calls[0] as unknown as [{ $or: Record<string, unknown>[] }];
    expect(filter[0].$or.some((c) => 'cardNumber' in c)).toBe(true);
  });
});
