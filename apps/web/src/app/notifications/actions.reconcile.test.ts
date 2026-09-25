import { describe, it, expect, vi, beforeEach } from 'vitest';

// Part 2/2 of the notifications module (part 1 in ./actions.test.ts covers the 4
// trivial wrappers + the getNotifications throttle/error-swallow from OUTSIDE
// computeAlerts). This file exercises `generateNotifications()` — the only exported
// seam onto the private `computeAlerts()` — across every alert kind plus the
// reconcile (insert-fresh / refresh-active / auto-expire-resolved / never-recreate-
// dismissed) behavior.
//
// The pure helper libs (`@/lib/bill`, `@/lib/priceHike`,
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
  billFind,
  documentFind,
  specialDateFind,
  vehicleFind,
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
    bills: unknown[];
    documents: unknown[];
    specialDates: unknown[];
    vehicles: unknown[];
    existingNotifications: Array<{ dedupeKey: string; deletedAt?: Date | null; dismissedAtPrice?: number | null; autoExpired?: boolean }>;
  } = {
    items: [],
    statements: [],
    expenses: [],
    subscriptions: [],
    bills: [],
    documents: [],
    specialDates: [],
    vehicles: [],
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
      billAlertDays: 5,
      subscriptionReviewIntervalDays: 0,
      documentAlertDays: 0,
      specialDateAlertDays: 0,
    })),
    itemFind: vi.fn(() => leanQuery(() => state.items)),
    statementFind: vi.fn(() => leanQuery(() => state.statements)),
    expenseFind: vi.fn(() => leanQuery(() => state.expenses)),
    subscriptionFind: vi.fn(() => leanQuery(() => state.subscriptions)),
    billFind: vi.fn(() => leanQuery(() => state.bills)),
    documentFind: vi.fn(() => leanQuery(() => state.documents)),
    specialDateFind: vi.fn(() => leanQuery(() => state.specialDates)),
    vehicleFind: vi.fn(() => leanQuery(() => state.vehicles)),
    notificationFind: vi.fn(() => leanQuery(() => state.existingNotifications)),
    notificationInsertMany: vi.fn(async (_docs: unknown[]) => undefined),
    // Awaitable like a Query, and chainable for the one call that opts into trashed rows.
    notificationUpdateOne: vi.fn((_f: Record<string, unknown>, _u: Record<string, any>) => {
      const q = Object.assign(Promise.resolve({}), { setOptions: vi.fn(() => q) });
      return q;
    }),
    notificationUpdateMany: vi.fn(async (_f: Record<string, unknown>, _u: Record<string, any>) => ({})),
    state,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
// Flat tenancy seam: the actions now reach their models through `currentModel` inside
// `withRequestTenant`, so hand the mocked model straight back. Tenant ROUTING itself is
// pinned separately in ./actions.tenant.test.ts.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/models/Document', () => ({ Document: { find: documentFind } }));
vi.mock('@/models/SpecialDate', () => ({ SpecialDate: { find: specialDateFind } }));
vi.mock('@/models/Vehicle', () => ({ Vehicle: { find: vehicleFind } }));
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
  state.bills = [];
  state.documents = [];
  state.specialDates = [];
  state.vehicles = [];
  state.existingNotifications = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  connectDBMock.mockImplementation(async () => {});
  getAppSettingsMock.mockImplementation(async () => ({
    warrantyAlertDays: 90,
    trialAlertDays: 2,
    billAlertDays: 5,
    subscriptionReviewIntervalDays: 0,
    documentAlertDays: 0,
    specialDateAlertDays: 0,
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
  it('fires for a warranty expiring within the configured window, with expiry date in dedupeKey', async () => {
    state.items = [{ _id: 'i2', title: 'Apple Watch', warrantyUntil: '2026-08-10' }]; // 21 days out, window is 90
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'warranty:i2:2026-08-10', kind: 'warranty', title: 'Apple Watch', body: '21', href: '/items?open=i2' }),
    ]);
  });

  it('does not fire once the warranty is further out than the alert window', async () => {
    state.items = [{ _id: 'i2', title: 'Apple Watch', warrantyUntil: '2027-06-01' }]; // ~316 days out
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
  // Three surfaces announce warranties — the calendar, this bell and the push — and they must
  // skip the same items. When only the calendar learned to ignore sold/broken things, the other
  // two kept firing for them. The mock returns state.items whatever the query, so pin the query.
  it('asks only for items you still own (WARRANTY_ALERT_STATUSES), same as the calendar', async () => {
    await generateNotifications();
    expect(itemFind).toHaveBeenCalledWith(
      expect.objectContaining({ warrantyUntil: { $ne: null }, status: { $in: ['received', 'installed'] } }),
    );
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

describe('generateNotifications — subscription review alert kind', () => {
  it('uses the confirmation anchor in the dedupe key so acknowledging retires the alert', async () => {
    getAppSettingsMock.mockResolvedValue({ warrantyAlertDays: 90, trialAlertDays: 2, billAlertDays: 5, subscriptionReviewIntervalDays: 180, documentAlertDays: 0, specialDateAlertDays: 0 });
    state.subscriptions = [{ _id: 's1', name: 'Forgotten TV', createdAt: '2026-01-01' }];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'subreview:s1:2026-01-01', kind: 'subreview', title: 'Forgotten TV', body: '200' }),
    ]);
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

// #197: both windows were configurable and the push sweep (runAlertChecks) honoured them,
// but the bell never showed either. Same collectors as the push, so the two cannot disagree.
describe('generateNotifications — document expiry alert kind', () => {
  const withDocWindow = (days: number) =>
    getAppSettingsMock.mockResolvedValue({ warrantyAlertDays: 90, trialAlertDays: 2, billAlertDays: 5, subscriptionReviewIntervalDays: 0, documentAlertDays: days, specialDateAlertDays: 0 });

  it('fires for a document expiring within the window, keyed by its expiry date', async () => {
    withDocWindow(30);
    state.documents = [{ _id: 'd1', title: 'Passport', type: 'passport', holder: 'Achilleas', expiryDate: '2026-08-04' }]; // 15 days out
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'document:d1:2026-08-04', kind: 'document', title: 'Passport', body: '15', href: '/documents' }),
    ]);
  });

  it('keeps nagging for an already-expired document (negative day count)', async () => {
    withDocWindow(30);
    state.documents = [{ _id: 'd1', title: 'ID card', expiryDate: '2026-07-10' }];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([expect.objectContaining({ dedupeKey: 'document:d1:2026-07-10', body: '-10' })]);
  });

  it('skips the query entirely when the window is 0 (alert off)', async () => {
    withDocWindow(0);
    state.documents = [{ _id: 'd1', title: 'Passport', expiryDate: '2026-07-25' }];
    await generateNotifications();
    expect(documentFind).not.toHaveBeenCalled();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — vehicle date alert kind (P110)', () => {
  const withDocWindow = (days: number) =>
    getAppSettingsMock.mockResolvedValue({ warrantyAlertDays: 90, trialAlertDays: 2, billAlertDays: 5, subscriptionReviewIntervalDays: 0, documentAlertDays: days, specialDateAlertDays: 0 });

  it('fires per due date, keyed by vehicle, kind and date, overdue ones included', async () => {
    withDocWindow(30);
    state.vehicles = [{ _id: 'v1', name: 'Golf', plate: 'ABC-1234', motUntil: '2026-08-04', insuranceUntil: '2026-07-10', roadTaxUntil: '2027-01-01' }];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'vehicle:v1:insuranceUntil:2026-07-10', kind: 'vehicle', title: 'Golf (ABC-1234)', body: '-10|insuranceUntil', href: '/vehicles' }),
      expect.objectContaining({ dedupeKey: 'vehicle:v1:motUntil:2026-08-04', body: '15|motUntil' }),
    ]);
  });

  it('skips the query when the documents lead time is 0 (alert off)', async () => {
    withDocWindow(0);
    state.vehicles = [{ _id: 'v1', name: 'Golf', motUntil: '2026-07-25' }];
    await generateNotifications();
    expect(vehicleFind).not.toHaveBeenCalled();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });
});

describe('generateNotifications — special date alert kind', () => {
  const withDateWindow = (days: number) =>
    getAppSettingsMock.mockResolvedValue({ warrantyAlertDays: 90, trialAlertDays: 2, billAlertDays: 5, subscriptionReviewIntervalDays: 0, documentAlertDays: 0, specialDateAlertDays: days });

  it('fires for a date whose next occurrence falls within the window, keyed by that occurrence', async () => {
    withDateWindow(7);
    state.specialDates = [{ _id: 's1', name: 'Maria', type: 'birthday', month: 7, day: 25, year: 1990 }]; // 5 days out, turns 36
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ dedupeKey: 'specialdate:s1:2026-07-25', kind: 'specialdate', title: 'Maria', body: '5|36', href: '/special-dates' }),
    ]);
  });

  it('leaves the years half empty when the year is unknown', async () => {
    withDateWindow(7);
    state.specialDates = [{ _id: 's1', name: 'Anniversary', month: 7, day: 20 }]; // today
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([expect.objectContaining({ dedupeKey: 'specialdate:s1:2026-07-20', body: '0|' })]);
  });

  it('does not fire when the next occurrence is outside the window', async () => {
    withDateWindow(7);
    state.specialDates = [{ _id: 's1', name: 'Maria', month: 9, day: 1 }];
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
      { kind: { $in: ['deal', 'installment', 'warranty', 'pricehike', 'trialend', 'subreview', 'bill', 'maintenance', 'lending', 'claim', 'document', 'vehicle', 'specialdate'] }, dedupeKey: { $nin: [] } },
      { $set: { deletedAt: expect.any(Date), autoExpired: true } }
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

describe('generateNotifications — a dismissed deal comes back only at a better price (#253)', () => {
  const dismissed = (price: number | null) => [{ dedupeKey: 'deal:i1', deletedAt: new Date('2026-07-01'), dismissedAtPrice: price }];
  const revived = () => notificationUpdateOne.mock.calls.filter(([, u]) => u.$set?.deletedAt === null);

  it('revives the alert, unread, when the price drops below the one it was dismissed at', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 600, links: [] }];
    state.existingNotifications = dismissed(899);
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
    expect(notificationUpdateOne).toHaveBeenCalledWith(
      { dedupeKey: 'deal:i1' },
      { $set: { title: 'RTX 5080', body: '600|900', href: '/shopping?open=i1', read: false, deletedAt: null, dismissedAtPrice: null, autoExpired: false } }
    );
    // The row is soft-deleted, so the update has to opt into trashed docs to reach it.
    const call = notificationUpdateOne.mock.calls.findIndex(([, u]) => u.$set?.deletedAt === null);
    expect(notificationUpdateOne.mock.results[call].value.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('stays dismissed at the same price, or a higher one', async () => {
    for (const price of [899, 900]) {
      notificationUpdateOne.mockClear();
      state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: price, links: [] }];
      state.existingNotifications = dismissed(899);
      await generateNotifications();
      expect(revived()).toEqual([]);
    }
  });

  it('stays dismissed when the dismissal predates the remembered price', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 100, links: [] }];
    state.existingNotifications = dismissed(null);
    await generateNotifications();
    expect(revived()).toEqual([]);
  });

  it('revives a deal the reconcile retired (price rose above target) once it is a deal again', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 890, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1', deletedAt: new Date('2026-07-01'), dismissedAtPrice: null, autoExpired: true }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
    expect(revived()).toHaveLength(1);
    expect(revived()[0][1].$set).toMatchObject({ body: '890|900', read: false, autoExpired: false });
  });

  it('revives a retired deal at any price, since the user never turned it down', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 900, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1', deletedAt: new Date('2026-07-01'), dismissedAtPrice: null, autoExpired: true }];
    await generateNotifications();
    expect(revived()).toHaveLength(1);
  });

  it('a retired row stays retired while it is not a deal', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 950, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1', deletedAt: new Date('2026-07-01'), autoExpired: true }];
    await generateNotifications();
    expect(revived()).toEqual([]);
  });

  it('never touches a live (not dismissed) deal this way', async () => {
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 900, currentPrice: 600, links: [] }];
    state.existingNotifications = [{ dedupeKey: 'deal:i1', deletedAt: null, dismissedAtPrice: 899 }];
    await generateNotifications();
    expect(revived()).toEqual([]);
  });
});

describe('generateNotifications : deals only count shops in the shopping market (#319)', () => {
  const inGreece = () =>
    getAppSettingsMock.mockResolvedValue({
      warrantyAlertDays: 90, trialAlertDays: 2, billAlertDays: 5, subscriptionReviewIntervalDays: 0, documentAlertDays: 0, specialDateAlertDays: 0,
      shoppingCountry: 'GR', shoppingExtraShops: ['amazon.de'],
    } as Awaited<ReturnType<typeof getAppSettingsMock>>);

  it('no deal when only an out-of-market shop is under target', async () => {
    inGreece();
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 800, currentPrice: 760, links: [
      { url: 'https://www.newegg.com/p/1', price: 760 },
      { url: 'https://www.skroutz.gr/s/1', price: 850 },
    ] }];
    await generateNotifications();
    expect(notificationInsertMany).not.toHaveBeenCalled();
  });

  it('a deal from an in-market shop quotes the price of that shop', async () => {
    inGreece();
    state.items = [{ _id: 'i1', title: 'RTX 5080', targetPrice: 800, currentPrice: 700, links: [
      { url: 'https://www.newegg.com/p/1', price: 700 },
      { url: 'https://www.amazon.de/dp/1', price: 790 },
    ] }];
    await generateNotifications();
    expect(notificationInsertMany).toHaveBeenCalledWith([expect.objectContaining({ dedupeKey: 'deal:i1', body: '790|800' })]);
  });
});
