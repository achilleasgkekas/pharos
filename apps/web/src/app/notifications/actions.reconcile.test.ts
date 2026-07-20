import { describe, it, expect, vi, beforeEach } from 'vitest';

// Part 2/2 of the notifications module (part 1 in ./actions.test.ts covers the 4
// trivial wrappers + the getNotifications throttle/error-swallow from OUTSIDE
// computeAlerts). This file exercises `generateNotifications()` — the only exported
// seam onto the private `computeAlerts()` — across all 7 alert kinds plus the
// reconcile (insert-fresh / refresh-active / auto-expire-resolved / never-recreate-
// dismissed) behavior.
//
// The 4 pure helper libs (`@/lib/giftcard`, `@/lib/bill`, `@/lib/priceHike`,
// `@/lib/installments`) are NOT mocked — each already has its own dedicated unit
// test, and running the real implementation here end-to-end pins the actual wiring
// (thresholds, dedupeKeys) rather than a hand-rolled stand-in that could drift from
// the real logic. Only the 6 upstream Mongoose models + `@/models/Notification` +
// `@/lib/db` + `@/lib/appSettings` are mocked.

const {
  connectDBMock,
  getAppSettingsMock,
  itemFind,
  statementFind,
  expenseFind,
  subscriptionFind,
  giftCardFind,
  billFind,
  notificationFind,
  notificationInsertMany,
  notificationUpdateOne,
  notificationUpdateMany,
  state,
} = vi.hoisted(() => {
  const state: {
    items: unknown[];
    statements: unknown[];
    expenses: unknown[];
    subscriptions: unknown[];
    giftCards: unknown[];
    bills: unknown[];
    existingNotifications: Array<{ dedupeKey: string }>;
  } = {
    items: [],
    statements: [],
    expenses: [],
    subscriptions: [],
    giftCards: [],
    bills: [],
    existingNotifications: [],
  };

  // A chainable lean-query stub: .select(...).lean() / .setOptions(...).select(...).lean()
  // all return the same object, terminating on `.lean()` with the configured rows.
  function leanQuery(rows: () => unknown[]) {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'setOptions']) q[m] = vi.fn(() => q);
    q.lean = vi.fn(async () => rows());
    return q;
  }

  return {
    connectDBMock: vi.fn(async () => {}),
    getAppSettingsMock: vi.fn(async () => ({
      warrantyAlertDays: 90,
      trialAlertDays: 2,
      giftCardAlertDays: 30,
      billAlertDays: 5,
    })),
    itemFind: vi.fn(() => leanQuery(() => state.items)),
    statementFind: vi.fn(() => leanQuery(() => state.statements)),
    expenseFind: vi.fn(() => leanQuery(() => state.expenses)),
    subscriptionFind: vi.fn(() => leanQuery(() => state.subscriptions)),
    giftCardFind: vi.fn(() => leanQuery(() => state.giftCards)),
    billFind: vi.fn(() => leanQuery(() => state.bills)),
    notificationFind: vi.fn(() => leanQuery(() => state.existingNotifications)),
    notificationInsertMany: vi.fn(async (_docs: unknown[]) => undefined),
    notificationUpdateOne: vi.fn(async (_f: Record<string, unknown>, _u: Record<string, any>) => ({})),
    notificationUpdateMany: vi.fn(async (_f: Record<string, unknown>, _u: Record<string, any>) => ({})),
    state,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { find: giftCardFind } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/models/Notification', () => ({
  Notification: {
    find: notificationFind,
    insertMany: notificationInsertMany,
    updateOne: notificationUpdateOne,
    updateMany: notificationUpdateMany,
  },
}));

import { generateNotifications } from './actions';

const NOW = new Date('2026-07-20T09:00:00.000Z');

function resetState() {
  state.items = [];
  state.statements = [];
  state.expenses = [];
  state.subscriptions = [];
  state.giftCards = [];
  state.bills = [];
  state.existingNotifications = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  connectDBMock.mockImplementation(async () => {});
  getAppSettingsMock.mockImplementation(async () => ({
    warrantyAlertDays: 90,
    trialAlertDays: 2,
    giftCardAlertDays: 30,
    billAlertDays: 5,
  }));
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('generateNotifications — deal alert kind', () => {
  it('fires when the best known price (currentPrice or a link price) reaches the target', async () => {
    state.items = [
      { _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 950, links: [{ price: 899 }] },
    ];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'deal:i1', kind: 'deal', title: 'RTX 5080', body: '899|900', href: '/shopping?open=i1', read: false }),
    ]);
  });

  it('does not fire when the best price is still above target', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 950, links: [{ price: 920 }] }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — warranty alert kind', () => {
  it('fires for a warranty expiring within the configured window', async () => {
    state.items = [{ _id: 'i2', title: 'Apple Watch', warrantyUntil: '2026-08-10' }]; // 21 days out, window is 90
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'warranty:i2', kind: 'warranty', title: 'Apple Watch', body: '21', href: '/items?open=i2' }),
    ]);
  });

  it('does not fire once the warranty is further out than the alert window', async () => {
    state.items = [{ _id: 'i2', title: 'Apple Watch', warrantyUntil: '2027-06-01' }]; // ~316 days out
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — installment alert kind', () => {
  it('aggregates every active (not-done) plan into one per-month notification', async () => {
    state.statements = [
      {
        card: 'Mastercard 7791',
        period: '2026-07',
        transactions: [
          {
            date: '2026-07-05T00:00:00.000Z',
            amount: 120,
            description: 'ΔΟΣΗ RTX 5080 3/12',
            installmentInfo: { currentInstallment: 3, totalInstallments: 12, originalPurchase: 'RTX 5080' },
            matchedItemIds: [],
          },
        ],
      },
    ];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'installments:2026-07', kind: 'installment', title: '', body: '120|1', href: '/calendar' }),
    ]);
  });

  it('does not fire when every plan is already fully paid off', async () => {
    state.statements = [
      {
        card: 'Mastercard 7791',
        period: '2026-07',
        transactions: [
          {
            date: '2026-07-05T00:00:00.000Z',
            amount: 120,
            description: 'ΔΟΣΗ RTX 5080 12/12',
            installmentInfo: { currentInstallment: 12, totalInstallments: 12, originalPurchase: 'RTX 5080' },
            matchedItemIds: [],
          },
        ],
      },
    ];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — pricehike alert kind', () => {
  it('fires one event per changed recurring series, keyed by the new amount', async () => {
    state.expenses = [
      { vendor: 'ΔΕΗ', vendorKey: 'dei', amount: 60, date: '2026-05-01', recurring: true, kind: 'expense' },
      { vendor: 'ΔΕΗ', vendorKey: 'dei', amount: 84, date: '2026-06-01', recurring: true, kind: 'expense' },
    ];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'pricehike:dei:84', kind: 'pricehike', title: 'ΔΕΗ', body: '60|84|40', href: '/expenses' }),
    ]);
  });

  it('does not fire for a stable (unchanged) recurring series', async () => {
    state.expenses = [
      { vendor: 'ΔΕΗ', vendorKey: 'dei', amount: 60, date: '2026-05-01', recurring: true, kind: 'expense' },
      { vendor: 'ΔΕΗ', vendorKey: 'dei', amount: 60, date: '2026-06-01', recurring: true, kind: 'expense' },
    ];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — trialend alert kind', () => {
  it('fires for an active subscription whose trial ends within the lead-time window', async () => {
    state.subscriptions = [
      { _id: 's1', name: 'Streamflix', amount: 12, trialEndsAt: '2026-07-21', firstChargeAmount: 12 },
    ]; // 1 day out, window is 2
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'trialend:s1:2026-07-21', kind: 'trialend', title: 'Streamflix', body: '1|12' }),
    ]);
  });

  it('does not fire once the trial end date is outside the lead-time window', async () => {
    state.subscriptions = [{ _id: 's1', name: 'Streamflix', amount: 12, trialEndsAt: '2026-08-15', firstChargeAmount: 12 }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — giftcard alert kind', () => {
  it('fires for a card with a positive balance expiring within the window', async () => {
    state.giftCards = [
      { _id: 'g1', title: 'Skroutz voucher', initialAmount: 50, uses: [{ amount: 20 }], expiresAt: '2026-08-01' },
    ]; // balance 30, 12 days out, window 30
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'giftcard:g1:2026-08-01', kind: 'giftcard', title: 'Skroutz voucher', body: '12|30', href: '/vouchers' }),
    ]);
  });

  it('does not fire once the balance has been fully spent', async () => {
    state.giftCards = [{ _id: 'g1', title: 'Skroutz voucher', initialAmount: 50, uses: [{ amount: 50 }], expiresAt: '2026-08-01' }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — bill alert kind', () => {
  it('fires for an unpaid bill due within the lead-time window', async () => {
    state.bills = [{ _id: 'b1', title: 'ΔΕΗ λογαριασμός', vendor: 'ΔΕΗ', amount: 84.2, dueDate: '2026-07-23' }]; // 3 days out, window 5
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'bill:b1:2026-07-23', kind: 'bill', title: 'ΔΕΗ λογαριασμός', body: '3|84.2', href: '/bills' }),
    ]);
  });

  it('keeps nagging (no lower bound) for an overdue bill with a negative day count', async () => {
    state.bills = [{ _id: 'b1', title: 'ΔΕΗ λογαριασμός', vendor: 'ΔΕΗ', amount: 84.2, dueDate: '2026-07-01' }]; // overdue by 19 days
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([expect.objectContaining({ dedupeKey: 'bill:b1:2026-07-01', body: '-19|84.2' })]);
  });

  it('does not fire once the bill is due further out than the lead-time window', async () => {
    state.bills = [{ _id: 'b1', title: 'ΔΕΗ λογαριασμός', vendor: 'ΔΕΗ', amount: 84.2, dueDate: '2026-08-15' }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — reconcile shape (insert / refresh / auto-expire / never-recreate)', () => {
  // All four cases below drive the reconcile logic through a single alert kind
  // (deal) since insertMany/updateOne/updateMany are called generically over
  // whatever computeAlerts() returns — the reconcile code itself is kind-agnostic.

  it('inserts a brand-new alert as unread when no existing notification shares its dedupeKey', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 890, links: [] }];
    state.existingNotifications = [];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledTimes(1);
    expect(notificationInsertMany.mock.calls[0][0]).toEqual([expect.objectContaining({ dedupeKey: 'deal:i1', read: false })]);
  });

  it('refreshes title/body/href of a still-active alert instead of re-inserting it', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080 (new price)', targetPrice: 900, currentPrice: 850, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1' }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
    expect(notificationUpdateOne).toHaveBeenCalledWith(
      { dedupeKey: 'deal:i1' },
      { $set: { title: 'RTX 5080 (new price)', body: '850|900', href: '/shopping?open=i1' } }
    );
  });

  it('auto-expires (soft-deletes) a previously-active alert once it no longer appears live', async () => {
    // No live deal this run at all — the previously-stored deal:i1 has resolved (price rose back up).
    state.items = [];
    state.existingNotifications = [{ dedupeKey: 'deal:i1' }];
    await generateNotifications();
    expect(notificationUpdateMany).toHaveBeenCalledWith(
      { kind: { $in: ['deal', 'installment', 'warranty', 'pricehike', 'trialend', 'giftcard', 'bill'] }, dedupeKey: { $nin: [] } },
      { $set: { deletedAt: expect.any(Date) } }
    );
  });

  it('never recreates a dismissed alert: a dedupeKey present in existing (soft-deleted) notifications is skipped on insert', async () => {
    // generateNotifications queries Notification WITH withDeleted, so a dismissed
    // (soft-deleted) row still counts as "existing" and must not be re-inserted.
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 890, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1' }]; // simulates a dismissed row still matched by withDeleted
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
    // Confirms the query actually asked for soft-deleted rows too.
    const leanQueryReturned = notificationFind.mock.results[0].value;
    expect(leanQueryReturned.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });
});
