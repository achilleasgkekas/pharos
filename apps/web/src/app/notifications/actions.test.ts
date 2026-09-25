import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// app/notifications/actions.ts backs the notification bell: 4 trivial CRUD wrappers
// (markNotificationRead/markAllNotificationsRead/dismissNotification/clearAllNotifications,
// all thin Notification.updateOne/updateMany calls) plus getNotifications, which serializes
// stored docs AND throttles a background reconcile (generateNotifications, 10-minute window
// tracked via a module-level `lastGen`) before reading them back.
//
// This run deliberately stops short of generateNotifications/computeAlerts itself — that's a
// 7-Mongoose-model + 5-lib-seam surface (Item/Statement/Expense/Subscription/GiftCard/Bill/
// Notification + getAppSettings/giftCardBalance/giftCardDaysLeft/billDaysUntilDue/
// computeInstallmentPlans/detectPriceHikes) scoped for a dedicated future run. Here we pin the
// throttle boundary + the "don't break the bell" error-swallow from the OUTSIDE: `getAppSettings`
// is the very first call computeAlerts makes, so mocking it to always reject lets us verify (a)
// generateNotifications runs at most once per throttle window no matter how often the bell polls,
// and (b) a computeAlerts failure never propagates out of getNotifications, without standing up
// the other 6 models.
//
// `lastGen` is module-level state that survives across it() blocks within one imported module
// instance, so every getNotifications() test uses `vi.resetModules()` + a fresh dynamic import to
// start from lastGen=0, instead of relying on cross-test execution order.

const { connectDBMock, notifState, notificationFind, notificationCount, notificationUpdateOne, notificationUpdateMany, getAppSettingsMock, findQuery } =
  vi.hoisted(() => {
    const notifState: { docs: unknown[]; unread: number } = { docs: [], unread: 0 };
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'limit', 'select', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = vi.fn(async () => notifState.docs);
    return {
      connectDBMock: vi.fn(async () => {}),
      notifState,
      notificationFind: vi.fn(() => findQuery),
      notificationCount: vi.fn(async (_f?: Record<string, unknown>) => notifState.unread),
      notificationUpdateOne: vi.fn(async (_f: Record<string, unknown>, _u: Record<string, any>) => ({})),
      notificationUpdateMany: vi.fn(async (_f: Record<string, unknown>, _u: Record<string, any>) => ({})),
      // computeAlerts' first line is `await getAppSettings()` — rejecting here means
      // computeAlerts (and thus generateNotifications) fails before touching any of the
      // other 6 models, which is exactly the seam this run wants to stay outside of.
      getAppSettingsMock: vi.fn(async () => {
        throw new Error('computeAlerts should not run past getAppSettings in this suite');
      }),
      findQuery,
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Notification', () => ({
  Notification: {
    find: notificationFind,
    countDocuments: notificationCount,
    updateOne: notificationUpdateOne,
    updateMany: notificationUpdateMany,
  },
}));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
// Flat tenancy seam (see ./actions.tenant.test.ts for the routing assertions themselves).
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<unknown>) => fn(),
  resolveRequestTenantOrNull: async () => ({ isDefault: true, tenantId: null, dbName: '' }),
}));

import { markNotificationRead, markAllNotificationsRead, dismissNotification, clearAllNotifications } from './actions';

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  notifState.docs = [];
  notifState.unread = 0;
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  for (const m of ['sort', 'limit', 'select', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => notifState.docs);
  notificationFind.mockImplementation(() => findQuery);
  notificationCount.mockImplementation(async () => notifState.unread);
  notificationUpdateOne.mockImplementation(async () => ({}));
  notificationUpdateMany.mockImplementation(async () => ({}));
  getAppSettingsMock.mockImplementation(async () => {
    throw new Error('computeAlerts should not run past getAppSettings in this suite');
  });
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('markNotificationRead', () => {
  it('sets read:true on the single notification by id', async () => {
    const res = await markNotificationRead('n1');
    expect(notificationUpdateOne).toHaveBeenCalledWith({ _id: 'n1' }, { $set: { read: true } });
    expect(res).toEqual({ ok: true });
  });
});

describe('markAllNotificationsRead', () => {
  it('sets read:true on every unread notification', async () => {
    const res = await markAllNotificationsRead();
    expect(notificationUpdateMany).toHaveBeenCalledWith({ read: false }, { $set: { read: true } });
    expect(res).toEqual({ ok: true });
  });
});

describe('dismissNotification', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    const res = await dismissNotification('n1');
    expect(notificationUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = notificationUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'n1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ ok: true });
  });
});

describe('dismissNotification — deals remember their price (#253)', () => {
  it('stores the best price the deal carried when it was dismissed', async () => {
    notifState.docs = [{ _id: 'n1', body: '899|900' }];
    await dismissNotification('n1');
    expect(notificationFind).toHaveBeenCalledWith({ _id: 'n1', kind: 'deal' });
    const [, update] = notificationUpdateOne.mock.calls[0];
    expect(update.$set.dismissedAtPrice).toBe(899);
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
  });

  it('leaves the price out for any other kind', async () => {
    await dismissNotification('n1');
    const [, update] = notificationUpdateOne.mock.calls[0];
    expect(update.$set).not.toHaveProperty('dismissedAtPrice');
  });
});

describe('clearAllNotifications — deals remember their price (#253)', () => {
  it('stamps each deal with its price before soft-deleting everything', async () => {
    notifState.docs = [{ _id: 'd1', body: '600|900' }];
    await clearAllNotifications();
    expect(notificationUpdateOne).toHaveBeenCalledWith({ _id: 'd1' }, { $set: { dismissedAtPrice: 600 } });
    expect(notificationUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('clearAllNotifications', () => {
  it('soft-deletes every notification via a single updateMany({}, ...)', async () => {
    const res = await clearAllNotifications();
    expect(notificationUpdateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = notificationUpdateMany.mock.calls[0];
    expect(filter).toEqual({});
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ ok: true });
  });
});

describe('getNotifications', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes stored docs (read coerced to boolean, createdAt to ISO) and reports the unread count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'));
    vi.resetModules();
    const { getNotifications } = await import('./actions');

    const createdAt = new Date('2026-07-01T10:00:00.000Z');
    notifState.docs = [
      { _id: 'n1', kind: 'deal', title: 'RTX 5080', body: '450|500', href: '/shopping?open=n1', read: true, createdAt },
      { _id: 'n2', kind: 'bill', title: 'ΔΕΗ', body: '5|84.20', href: '/bills', read: undefined, createdAt },
    ];
    notifState.unread = 1;

    const result = await getNotifications();

    expect(result.items).toEqual([
      { _id: 'n1', kind: 'deal', title: 'RTX 5080', body: '450|500', href: '/shopping?open=n1', read: true, createdAt: createdAt.toISOString() },
      { _id: 'n2', kind: 'bill', title: 'ΔΕΗ', body: '5|84.20', href: '/bills', read: false, createdAt: createdAt.toISOString() },
    ]);
    expect(result.unread).toBe(1);
  });

  it('a fresh module instance always regenerates on its first call, and a computeAlerts failure never escapes getNotifications', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'));
    vi.resetModules();
    const { getNotifications } = await import('./actions');

    const result = await getNotifications();

    expect(getAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[notifications] generation failed:', expect.any(Error));
    // The bell still gets its (mocked-empty) list back — the failure was swallowed, not thrown.
    expect(result).toEqual({ items: [], unread: 0 });
  });

  it('a second call 5 minutes later (inside the 10-minute throttle window) does not re-trigger generation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'));
    vi.resetModules();
    const { getNotifications } = await import('./actions');

    await getNotifications();
    expect(getAppSettingsMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-07-20T09:05:00.000Z'));
    await getNotifications();
    expect(getAppSettingsMock).toHaveBeenCalledTimes(1); // still 1: throttled, not re-triggered
  });

  it('a call after the 10-minute throttle window elapses re-triggers generation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'));
    vi.resetModules();
    const { getNotifications } = await import('./actions');

    await getNotifications();
    expect(getAppSettingsMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-07-20T09:11:00.000Z'));
    await getNotifications();
    expect(getAppSettingsMock).toHaveBeenCalledTimes(2);
  });
});
