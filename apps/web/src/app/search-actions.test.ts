import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/search-actions.ts `searchAll()` — the cross-collection global search that backs both
// the web navbar search dropdown AND (verbatim, via GET /api/v1/search — see
// api/v1/search/route.test.ts, which mocks searchAll entirely) the mobile SearchScreen.
// Never directly unit-tested before; the route test only proves the auth/projection wiring,
// and lib/receiptSearch.test.ts only proves the pure `matchedLineItemName` helper in
// isolation. Neither pins the actual behaviour this file adds on top (P22): a receipt hit's
// `subtitle` gets `· <matched line item>` appended when the query matched a line item rather
// than the store name — the ONLY signal a mobile client has, since the v1 route drops
// everything except { type, id, title, subtitle }. That appended text is what closes the
// "mobile search doesn't show matched line-item" parity gap (MOBILE_PARITY.md P22 entry) —
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
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Task', () => ({ Task: { find: taskFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { find: voucherFind } }));

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

describe('searchAll — this is exactly what GET /api/v1/search forwards to mobile', () => {
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
    // Same narrowing the route applies (see api/v1/search/route.ts) — proves the mobile
    // payload shape already carries the snippet without any route/type change needed.
    expect({ type, id, title, subtitle }).toEqual({
      type: 'receipt',
      id: 'r5',
      title: 'i-system.gr',
      subtitle: 'Receipt · 04/07/2025 · €89 · Crucial 16GB DDR4',
    });
  });
});
