import { describe, it, expect, vi, beforeEach } from 'vitest';

// Focused sibling of actions.alertChecks.test.ts (see that file's header for the full
// mock-set rationale): this one pins ONLY the P82 behaviour — `runAlertChecks({ dedupe:
// true })`, the opt-in the scheduled cron path (app/api/cron/alerts/route.ts) uses so an
// unattended run doesn't resend the identical digest every tick. The default (no args /
// dedupe: false) path is untouched and stays pinned by the sibling file; this file exists
// so those ~640 lines didn't have to grow an `AppConfig.findOne`/`updateOne` fixture per
// case just to cover a mode most of them never exercise.
//
// Behaviour pinned:
//  - dedupe:false (or omitted): AppConfig.findOne is never called — the manual "Check &
//    notify now" button always shows the full live picture, zero new DB reads/writes.
//  - dedupe:true, nothing previously sent (AppConfig.alertDispatchKeys empty/absent):
//    every live signal is "fresh", output is identical to the non-dedupe run.
//  - dedupe:true, a signal's exact dedupeKey is already in alertDispatchKeys: that
//    signal's line is omitted; a genuinely new/changed signal alongside it still shows.
//  - dedupe:true, EVERY live signal is already-sent: summary is
//    'No new alerts (already reported).', NOT 'All clear' (there ARE live alerts, just
//    none of them are new) — and dispatchAlert is NOT called.
//  - dedupe:true, genuinely nothing live: summary stays 'All clear — nothing to report.'
//    (same text as the non-dedupe empty case).
//  - The AppConfig.alertDispatchKeys baseline is written ONLY when dispatchAlert actually
//    delivers to >=1 channel (`sent:true`) — a misconfigured/disabled notifier must never
//    mark live alerts as "already sent" when nothing was ever delivered.
//  - The written baseline is the FULL current live key set (every category), not just the
//    fresh ones — so an alert that already went out keeps its slot and won't be treated as
//    fresh again next run even though it wasn't in *this* run's fresh subset.
//  - The in-app bell (generateNotifications) and outbound event webhooks (P24) are called
//    with the FULL undeduped data regardless of opts.dedupe — they are unaffected by P82.

const {
  connectDBMock,
  getAppSettingsMock,
  itemFind,
  receiptFind,
  statementFind,
  expenseFind,
  subscriptionFind,
  giftCardFind,
  billFind,
  getStoresMock,
  effectiveReturnWindowMock,
  returnDaysLeftMock,
  computeInstallmentPlansMock,
  detectPriceHikesMock,
  detectBudgetExceededMock,
  giftCardBalanceMock,
  giftCardDaysLeftMock,
  billDaysUntilDueMock,
  generateNotificationsMock,
  dispatchEventWebhooksMock,
  dispatchAlertMock,
  getStorageConfigMock,
  getLastRemoteSyncMock,
  appConfigFindOneMock,
  appConfigUpdateOneMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  getAppSettingsMock: vi.fn(async () => ({} as Record<string, unknown>)),
  itemFind: vi.fn(),
  receiptFind: vi.fn(),
  statementFind: vi.fn(),
  expenseFind: vi.fn(),
  subscriptionFind: vi.fn(),
  giftCardFind: vi.fn(),
  billFind: vi.fn(),
  getStoresMock: vi.fn(async () => [] as unknown[]),
  effectiveReturnWindowMock: vi.fn(() => 14),
  returnDaysLeftMock: vi.fn(() => null as number | null),
  computeInstallmentPlansMock: vi.fn(() => [] as unknown[]),
  detectPriceHikesMock: vi.fn(() => [] as unknown[]),
  detectBudgetExceededMock: vi.fn((_rows?: unknown, _budgets?: unknown, _monthKey?: string) => [] as unknown[]),
  giftCardBalanceMock: vi.fn(() => 0),
  giftCardDaysLeftMock: vi.fn(() => null as number | null),
  billDaysUntilDueMock: vi.fn(() => null as number | null),
  generateNotificationsMock: vi.fn(async () => {}),
  dispatchEventWebhooksMock: vi.fn(async () => ({ sent: 0, total: 0 })),
  dispatchAlertMock: vi.fn(async () => ({ sent: 0, total: 0 })),
  getStorageConfigMock: vi.fn(async () => ({ backend: 'local' }) as { backend: string }),
  getLastRemoteSyncMock: vi.fn(async () => null as Date | null),
  appConfigFindOneMock: vi.fn(),
  appConfigUpdateOneMock: vi.fn(async () => ({})),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { findOne: appConfigFindOneMock, updateOne: appConfigUpdateOneMock } }));
vi.mock('@/models/Store', () => ({ Store: {} }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind } }));
vi.mock('@/models/Item', () => ({ Item: { find: itemFind } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { find: subscriptionFind } }));
vi.mock('@/models/Voucher', () => ({ Voucher: {} }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: { find: giftCardFind } }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: {} }));
vi.mock('@/lib/giftcard', () => ({ giftCardBalance: giftCardBalanceMock, giftCardDaysLeft: giftCardDaysLeftMock }));
vi.mock('@/models/Bill', () => ({ Bill: { find: billFind } }));
vi.mock('@/lib/bill', () => ({ billDaysUntilDue: billDaysUntilDueMock }));
vi.mock('@/models/Card', () => ({ Card: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/Goal', () => ({ Goal: {} }));
vi.mock('@/lib/aiConfig', () => ({ invalidateAiConfigCache: vi.fn(), getAiConfig: vi.fn(async () => ({})) }));
vi.mock('@/lib/ollama', () => ({
  invalidateOllamaHealth: vi.fn(),
  RECEIPT_SYSTEM_PROMPT: 'receipt-prompt',
  STATEMENT_SYSTEM_PROMPT: 'statement-prompt',
  PRODUCT_PROMPT: 'product-prompt',
  CARD_PROMPT: 'card-prompt',
  SUBSCRIPTION_PROMPT: 'subscription-prompt',
  CATEGORY_PROMPT: 'category-prompt',
  EXPENSE_PROMPT: 'expense-prompt',
  VOUCHER_PROMPT: 'voucher-prompt',
  PRODUCT_PHOTO_PROMPT: 'product-photo-prompt',
}));
vi.mock('@/lib/prompts', () => ({
  PROMPT_META: [],
  DEFAULT_SCRAPER_PRICE_PROMPT: 'scraper-price-prompt',
  getAllPromptOverrides: vi.fn(async () => ({})),
  invalidatePromptsCache: vi.fn(),
}));
vi.mock('@/lib/taxonomies', () => ({ TAXONOMY_META: [], normalizeList: vi.fn(), normalizeSpaces: vi.fn() }));
vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: getStorageConfigMock, invalidateStorageConfig: vi.fn() }));
vi.mock('@/lib/syncState', () => ({ markRemoteSync: vi.fn(async () => {}), getLastRemoteSync: getLastRemoteSyncMock }));
vi.mock('@/lib/remoteStorage', () => ({ pushBatchToRemote: vi.fn(), testRemote: vi.fn() }));
vi.mock('@/lib/storagePath', () => ({ renderStoragePath: vi.fn(), DEFAULT_FOLDER_TEMPLATE: '', DEFAULT_NAME_TEMPLATE: '' }));
vi.mock('@/lib/storage', () => ({ readFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/imapConfig', () => ({ getImapConfig: vi.fn(), invalidateImapConfig: vi.fn() }));
vi.mock('@/lib/imapImport', () => ({ testImapConnection: vi.fn(), fetchNewEmails: vi.fn() }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt: vi.fn() }));
vi.mock('@/lib/storeService', () => ({ getStores: getStoresMock, invalidateStoreCache: vi.fn() }));
vi.mock('@/lib/returnWindow', () => ({ effectiveReturnWindow: effectiveReturnWindowMock, returnDaysLeft: returnDaysLeftMock }));
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: vi.fn() }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: vi.fn() }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: detectPriceHikesMock }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock, invalidateAppSettings: vi.fn() , invalidateAppSettingsForRequest: vi.fn(async () => {})}));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })), assertCanWrite: vi.fn(async () => {}) }));
vi.mock('@/lib/aiFeatures', () => ({ AI_FEATURE_KEYS: [] }));
vi.mock('@/lib/aiModels', () => ({ PROVIDER_RECOMMEND: {}, priceForModel: vi.fn(), looksVisionModel: vi.fn() }));
vi.mock('@/lib/onedrive', () => ({
  startDeviceCode: vi.fn(),
  pollDeviceToken: vi.fn(),
  getOnedriveCreds: vi.fn(),
  disconnectOnedrive: vi.fn(),
  testOnedrive: vi.fn(),
  uploadToOnedrive: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ sendNtfyTo: vi.fn(async () => true) }));
vi.mock('@/lib/backupModels', () => ({ BACKUP_MODELS: [] }));
vi.mock('@/lib/notifiers', () => ({
  dispatchAlert: dispatchAlertMock,
  getNotifiers: vi.fn(async () => []),
  testNotifier: vi.fn(async () => true),
}));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computeInstallmentPlansMock }));
vi.mock('@/app/notifications/actions', () => ({ generateNotifications: generateNotificationsMock }));
vi.mock('@/lib/budgetAlert', () => ({ detectBudgetExceeded: detectBudgetExceededMock }));
vi.mock('@/lib/depreciation', () => ({ estimatedItemValue: vi.fn() }));
vi.mock('@/lib/insuranceExport', () => ({ buildInsuranceCsv: vi.fn(), buildInsuranceHtml: vi.fn() }));
vi.mock('@/lib/taxExport', () => ({ buildTaxCsv: vi.fn(), buildTaxHtml: vi.fn() }));
vi.mock('jszip', () => ({ default: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({
  getEventWebhooks: vi.fn(async () => []),
  dispatchEventWebhooks: dispatchEventWebhooksMock,
  testEventWebhook: vi.fn(async () => true),
  generateWebhookSecret: vi.fn(() => 'generated-secret'),
  WEBHOOK_EVENTS: [
    { type: 'receipt.parsed', label: 'Receipt parsed', hint: '' },
    { type: 'budget.exceeded', label: 'Budget exceeded', hint: '' },
    { type: 'installment.due', label: 'Installment due', hint: '' },
    { type: 'price.drop', label: 'Price drop / deal hit', hint: '' },
  ],
}));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Tenancy seam mocked FLAT: settings actions now reach every model through `scoped()`, which is
// withRequestTenant + currentModel. These tests are about what the actions DO, so the seam is a
// pass-through here; the tenant ROUTING itself is pinned separately in actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<any>) => fn(),
  softRequestTenant: async () => ({ tenantId: null, slug: 'default', dbName: '', plan: 'dedicated', status: 'active', isDefault: true }),
}));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (model: unknown) => model,
  tenantDb: async () => ({}),
  tenantModel: (_conn: unknown, model: unknown) => model,
}));

import { runAlertChecks } from './actions';

function chainLean(value: unknown) {
  return { lean: async () => value };
}
function chainSelectLean(value: unknown) {
  return { select: () => chainLean(value) };
}

const DEFAULT_SETTINGS = {
  warrantyAlertDays: 90,
  defaultReturnWindowDays: 0,
  trialAlertDays: 2,
  giftCardAlertDays: 30,
  billAlertDays: 5,
  maintenanceAlertDays: 7,
  lendingAlertDays: 3,
  syncStaleDays: 7,
  budgets: {} as Record<string, number>,
};

function mockDispatchKeys(keys: string[]) {
  appConfigFindOneMock.mockReturnValue(chainSelectLean({ alertDispatchKeys: keys }));
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS }));
  itemFind.mockReturnValue(chainSelectLean([]));
  receiptFind.mockReturnValue(chainSelectLean([]));
  statementFind.mockReturnValue(chainLean([]));
  expenseFind.mockReturnValueOnce(chainSelectLean([])).mockReturnValueOnce(chainSelectLean([]));
  subscriptionFind.mockReturnValue(chainSelectLean([]));
  giftCardFind.mockReturnValue(chainSelectLean([]));
  billFind.mockReturnValue(chainSelectLean([]));
  getStoresMock.mockImplementation(async () => []);
  effectiveReturnWindowMock.mockImplementation(() => 14);
  returnDaysLeftMock.mockImplementation(() => null);
  computeInstallmentPlansMock.mockImplementation(() => []);
  detectPriceHikesMock.mockImplementation(() => []);
  detectBudgetExceededMock.mockImplementation(() => []);
  giftCardBalanceMock.mockImplementation(() => 0);
  giftCardDaysLeftMock.mockImplementation(() => null);
  billDaysUntilDueMock.mockImplementation(() => null);
  generateNotificationsMock.mockImplementation(async () => {});
  dispatchEventWebhooksMock.mockImplementation(async () => ({ sent: 0, total: 0 }));
  dispatchAlertMock.mockImplementation(async () => ({ sent: 1, total: 1 })); // "delivered" by default in this file
  getStorageConfigMock.mockImplementation(async () => ({ backend: 'local' }));
  getLastRemoteSyncMock.mockImplementation(async () => null);
  mockDispatchKeys([]); // nothing previously sent, unless a test overrides it
});

describe('runAlertChecks · dedupe off (default)', () => {
  it('never reads AppConfig at all — the manual button path is untouched', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks();
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
    expect(appConfigFindOneMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOneMock).not.toHaveBeenCalled();
  });
});

describe('runAlertChecks · dedupe on, nothing previously sent', () => {
  it('shows every live signal — identical output to a non-dedupe run', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks({ dedupe: true });
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
    expect(result.sent).toBe(true);
  });

  it('persists the full live key set once the send actually delivers', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    await runAlertChecks({ dedupe: true });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { alertDispatchKeys: ['deal:i1'] } }, { upsert: true });
  });
});

describe('runAlertChecks · dedupe on, a signal was already sent', () => {
  it('omits an unchanged warranty alert but still shows a fresh deal alongside it', async () => {
    mockDispatchKeys(['warranty:w1']);
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([{ _id: 'w1', title: 'Old warranty', warrantyUntil: new Date(Date.now() + 10 * 86400000).toISOString() }]));
    const result = await runAlertChecks({ dedupe: true });
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
    expect(result.summary).not.toContain('warranty');
  });

  it('a moved due date is treated as fresh again (the date is baked into the bill/giftcard/trial key)', async () => {
    mockDispatchKeys([`bill:b1:${new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)}`]); // stale, old due date
    billFind.mockReturnValue(chainSelectLean([{ _id: 'b1', title: 'ΔΕΗ', amount: 60, dueDate: new Date(Date.now() + 2 * 86400000).toISOString() }]));
    billDaysUntilDueMock.mockImplementation(() => 2);
    const result = await runAlertChecks({ dedupe: true });
    expect(result.summary).toContain('🧾 1 bill(s) due/overdue: ΔΕΗ');
  });

  it('everything already reported → "No new alerts", distinct from genuine all-clear, and no dispatch', async () => {
    mockDispatchKeys(['warranty:w1']);
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([]))
      .mockReturnValueOnce(chainSelectLean([{ _id: 'w1', title: 'Old warranty', warrantyUntil: new Date(Date.now() + 10 * 86400000).toISOString() }]));
    const result = await runAlertChecks({ dedupe: true });
    expect(result).toEqual({ ok: true, sent: false, summary: 'No new alerts (already reported).' });
    expect(dispatchAlertMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOneMock).not.toHaveBeenCalled();
  });

  it('genuinely nothing live stays "All clear" (not confused with "already reported")', async () => {
    const result = await runAlertChecks({ dedupe: true });
    expect(result).toEqual({ ok: true, sent: false, summary: 'All clear — nothing to report.' });
  });
});

describe('runAlertChecks · dedupe on, failed delivery must not advance the baseline', () => {
  it('does not persist alertDispatchKeys when dispatchAlert delivers to zero channels', async () => {
    dispatchAlertMock.mockImplementation(async () => ({ sent: 0, total: 0 })); // e.g. every notifier disabled
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks({ dedupe: true });
    expect(result.sent).toBe(false);
    expect(appConfigUpdateOneMock).not.toHaveBeenCalled();
  });
});

describe('runAlertChecks · dedupe on, the bell and event webhooks are unaffected', () => {
  it('still runs generateNotifications and event webhooks with the full undeduped data', async () => {
    mockDispatchKeys(['deal:i1']); // already-sent, so the outbound summary omits it
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    await runAlertChecks({ dedupe: true });
    expect(generateNotificationsMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('price.drop', { items: [{ title: 'U7 Pro', target: 300 }] });
  });
});

describe('runAlertChecks · quiet hours (P86)', () => {
  const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const curMin = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  // Deterministic at any wall-clock time (wrap handled by isWithinQuietHours):
  const windowCoveringNow = () => ({ start: toHHMM((curMin() + 1439) % 1440), end: toHHMM((curMin() + 2) % 1440) });
  const windowNotCoveringNow = () => ({ start: toHHMM((curMin() + 5) % 1440), end: toHHMM((curMin() + 10) % 1440) });

  function oneLiveDeal() {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([]));
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ _id: 'i1', title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
  }

  it('cron in the window holds dispatch and does NOT advance the baseline', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, quietHours: windowCoveringNow() }));
    oneLiveDeal();
    const result = await runAlertChecks({ dedupe: true });
    expect(dispatchAlertMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOneMock).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
    expect(result.summary).toContain('Quiet hours');
    // The in-app bell still ran while quiet — nothing is lost, only outbound delivery held.
    expect(generateNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it('cron outside the window dispatches normally', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, quietHours: windowNotCoveringNow() }));
    oneLiveDeal();
    const result = await runAlertChecks({ dedupe: true });
    expect(dispatchAlertMock).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(true);
  });

  it('the manual button (no dedupe) always sends, even inside the window', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, quietHours: windowCoveringNow() }));
    oneLiveDeal();
    const result = await runAlertChecks();
    expect(dispatchAlertMock).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
  });
});
