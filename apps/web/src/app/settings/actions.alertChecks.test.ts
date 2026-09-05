import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultNotifyTypes } from '@/lib/alertTypes';

// app/settings/actions.ts is the largest module in the repo (1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// full rationale + mock-set explanation). This file covers ONLY runAlertChecks
// (lines 463-636): the fan-in scan that pulls deals / warranty expiries / return-window
// closings / installment-due / recurring price-hikes / budget-exceeded / free-trial
// endings / gift-card expiries / bills-due from eight different models, composes one
// human summary, feeds the in-app notification bell, dispatches outbound event
// webhooks, and pushes a notifier (ntfy). actions.notifiers.test.ts
// deliberately left this concern out; this file is that promised future slice.
//
// Strategy: the underlying per-domain math (detectPriceHikes, detectBudgetExceeded,
// effectiveReturnWindow/returnDaysLeft, giftCardBalance/giftCardDaysLeft,
// billDaysUntilDue, computeInstallmentPlans) each already has its own dedicated unit
// suite (lib/priceHike.test.ts, lib/budgetAlert.test.ts, lib/returnWindow.test.ts,
// lib/giftcard.test.ts, lib/bill.test.ts, lib/installments.test.ts) — those are mocked
// here so this file only pins runAlertChecks' OWN wiring: which query is issued to
// which model, how each helper's result feeds the deal/warranty/etc. filter + summary
// line, and how the final dispatch (bell / event webhooks / ntfy) is gated.
//
// Behaviour pinned:
//  - deals: Item.find({targetPrice:{$gt:0}}) (1st Item.find call) -> "lowest known
//    price" = min(currentPrice>0 ? currentPrice : Infinity, every link.price>0),
//    counts as a deal only when that lowest price is finite AND <= targetPrice.
//  - warranty: Item.find({warrantyUntil:{$ne:null}}) (2nd Item.find call) -> ceil-days
//    until expiry, kept when 0 <= days <= s.warrantyAlertDays, sorted soonest-first.
//  - return windows: Receipt.find is issued ONLY when
//    maxWindow = max(s.defaultReturnWindowDays, ...stores.returnWindowDays) > 0;
//    per receipt, effectiveReturnWindow()+returnDaysLeft() decide inclusion, kept only
//    when days !== null && days <= 3 (hardcoded, not settings-driven), sorted
//    soonest-first.
//  - installments: Statement.find().lean() (no .select) -> computeInstallmentPlans ->
//    filtered to !done && remainingInstallments>=1, dueThisMonth = sum of perAmount.
//  - price hikes: Expense.find({amount:{$gt:0}}) (1st Expense.find call, no date
//    filter) -> detectPriceHikes(rows) verbatim.
//  - budget exceeded: Expense.find({amount:{$gt:0}, date:{$gte:monthStart}}) (2nd
//    Expense.find call) -> detectBudgetExceeded(rows, s.budgets, 'YYYY-MM' of the
//    CURRENT month).
//  - free trials: Subscription.find({active:true, trialEndsAt:{$ne:null}}) -> ceil-days
//    until trialEndsAt, kept when 0 <= days <= s.trialAlertDays, charge prefers
//    firstChargeAmount over amount, sorted soonest-first.
//  - gift cards: GiftCard.find({archived:{$ne:true}, expiresAt:{$ne:null}}) ->
//    giftCardBalance()+giftCardDaysLeft(), kept only when balance > 0.009 AND
//    0 <= days <= s.giftCardAlertDays, sorted soonest-first.
//  - bills: Bill.find({paidAt:null, archived:{$ne:true}}) -> billDaysUntilDue(), kept
//    when days !== null && days <= s.billAlertDays — NO lower bound, so an overdue
//    bill (negative days) always qualifies regardless of s.billAlertDays ("overdue nag
//    until paid"); sorted most-overdue-first (ascending, negatives first).
//  - remote-mirror staleness (P48): getStorageConfig().backend + the stored
//    lastRemoteSync timestamp -> detectSyncStaleness (the real helper, not mocked).
//    Silent for backend 'local' and for syncStaleDays 0; fires for a remote that has
//    NEVER synced; reads a stored timestamp ONLY (no network call, so an unreachable
//    NAS cannot hang or fail the sweep); no dedicated webhook event.
//  - generateNotifications() (the in-app bell) is ALWAYS attempted, wrapped in its own
//    try/catch that swallows any rejection — a bell failure never fails the ntfy check.
//  - Outbound event webhooks are fire-and-forget (`void dispatchEventWebhooks(...)`),
//    one per non-empty signal: 'installment.due' (only when dueThisMonth>0),
//    'price.drop' (only when deals.length, payload maps title+target), 'budget.exceeded'
//    (only when budgetsExceeded.length, payload is the raw array). Hikes/warranty/
//    returns/trials/gift-cards/bills do NOT have a dedicated webhook event.
//  - Final summary: 'All clear — nothing to report.' when every signal is empty; NO
//    dispatchAlert call in that case. When any line exists, dispatchAlert('Pharos
//    alerts', summary) is awaited and `sent` = its `.sent > 0`.
//  - Always returns {ok:true, sent, summary}; connectDB is called once up front.

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
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: vi.fn(), findOne: () => ({ select: () => ({ lean: async () => null }) }) } }));
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
// NOT mocked: lib/syncStaleness — it is a pure helper with its own suite
// (lib/syncStaleness.test.ts), and stubbing it would hide the wiring this file exists
// to pin. Only the stored timestamp it reads is faked.
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock, invalidateAppSettings: vi.fn() }));
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
  defaultReturnWindowDays: 0, // 0 = Receipt.find is skipped entirely unless a test overrides it
  trialAlertDays: 2,
  giftCardAlertDays: 30,
  billAlertDays: 5,
  maintenanceAlertDays: 7,
  lendingAlertDays: 3,
  syncStaleDays: 7,
  budgets: {} as Record<string, number>,
};

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS }));
  // Item.find serves several queries here (deals, warranties, the P41 maintenance rows).
  // A plain default rather than a fixed-length queue: a case that cares about ordering
  // resets the mock and queues its own, and anything it leaves unset lands on this.
  itemFind.mockReturnValue(chainSelectLean([]));
  receiptFind.mockReturnValue(chainSelectLean([]));
  statementFind.mockReturnValue(chainLean([]));
  // Expense.find is called twice in fixed order: hike rows first, budget rows second.
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
  dispatchAlertMock.mockImplementation(async () => ({ sent: 0, total: 0 }));
  // Baseline is the local backend, i.e. no remote that could fall behind. The
  // staleness describe-block below opts each case into a remote backend explicitly.
  getStorageConfigMock.mockImplementation(async () => ({ backend: 'local' }));
  getLastRemoteSyncMock.mockImplementation(async () => null);
});

describe('runAlertChecks · all-clear baseline', () => {
  it('reports "All clear" and skips dispatch when every signal is empty', async () => {
    const result = await runAlertChecks();
    expect(result).toEqual({ ok: true, sent: false, summary: 'All clear — nothing to report.' });
    expect(dispatchAlertMock).not.toHaveBeenCalled();
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalled();
  });

  it('connects to the DB exactly once up front', async () => {
    await runAlertChecks();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
  });

  it('always attempts the in-app notification bell, even with nothing to report', async () => {
    await runAlertChecks();
    expect(generateNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a notification-bell failure without failing the whole check', async () => {
    generateNotificationsMock.mockRejectedValueOnce(new Error('bell exploded'));
    await expect(runAlertChecks()).resolves.toEqual({ ok: true, sent: false, summary: 'All clear — nothing to report.' });
  });
});

describe('runAlertChecks · deals', () => {
  it('counts an item as a deal when currentPrice is at or below its target', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks();
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
  });

  it('prefers the lowest store-link price over currentPrice when it is cheaper', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(
        chainSelectLean([{ title: 'Switch', targetPrice: 500, currentPrice: 625, links: [{ price: 475 }, { price: 900 }] }])
      )
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks();
    expect(result.summary).toContain('🎯 1 deal(s): Switch');
  });

  it('does not count an item with no priced source at all (currentPrice 0, no links)', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'No price', targetPrice: 100, currentPrice: 0, links: [] }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('does not count an item whose lowest price is still above target', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'Too pricey', targetPrice: 100, currentPrice: 150 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('fires the price.drop webhook with title+target for every deal, and skips it when there are none', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('price.drop', { items: [{ title: 'U7 Pro', target: 300 }] });
  });
});

describe('runAlertChecks · warranty expiries', () => {
  const now = Date.now();
  function daysFromNow(days: number) {
    return new Date(now + days * 86400000).toISOString();
  }

  it('includes an item expiring within the configured window, soonest first', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, warrantyAlertDays: 90 }));
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([]))
      .mockReturnValueOnce(
        chainSelectLean([
          { title: 'Later one', warrantyUntil: daysFromNow(80) },
          { title: 'Soonest', warrantyUntil: daysFromNow(10) },
        ])
      );
    const result = await runAlertChecks();
    expect(result.summary).toContain('🛡 2 warranty expiring ≤90d: Soonest (10d), Later one (80d)');
  });

  it('excludes an item already past its warranty (negative days)', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([]))
      .mockReturnValueOnce(chainSelectLean([{ title: 'Expired', warrantyUntil: daysFromNow(-5) }]));
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('excludes an item beyond the alert window', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, warrantyAlertDays: 30 }));
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([]))
      .mockReturnValueOnce(chainSelectLean([{ title: 'Far off', warrantyUntil: daysFromNow(60) }]));
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('has no dedicated webhook event for warranty expiries', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([]))
      .mockReturnValueOnce(chainSelectLean([{ title: 'Soon', warrantyUntil: daysFromNow(5) }]));
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalledWith('warranty.expiring', expect.anything());
  });
});

describe('runAlertChecks · return-window closings', () => {
  it('skips the Receipt query entirely when the effective max window is 0', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 0 }));
    getStoresMock.mockImplementation(async () => []);
    await runAlertChecks();
    expect(receiptFind).not.toHaveBeenCalled();
  });

  it('queries Receipt once the default window is positive, and includes closings within 3 days', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 14 }));
    receiptFind.mockReturnValue(chainSelectLean([{ store: 'Skroutz', date: '2026-07-20', total: 49.99 }]));
    effectiveReturnWindowMock.mockImplementation(() => 14);
    returnDaysLeftMock.mockImplementation(() => 2);
    const result = await runAlertChecks();
    expect(receiptFind).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain('↩ 1 return window(s) closing ≤3d: Skroutz €49.99 (2d)');
  });

  it('a store-specific returnWindowDays override alone can raise the max window above 0', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 0 }));
    getStoresMock.mockImplementation(async () => [{ name: 'LongReturns', returnWindowDays: 30 }]);
    await runAlertChecks();
    expect(receiptFind).toHaveBeenCalledTimes(1);
  });

  it('excludes a receipt whose window has more than 3 days left', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 14 }));
    receiptFind.mockReturnValue(chainSelectLean([{ store: 'Skroutz', date: '2026-07-20', total: 49.99 }]));
    returnDaysLeftMock.mockImplementation(() => 10);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('excludes a receipt whose window is already closed (returnDaysLeft null)', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 14 }));
    receiptFind.mockReturnValue(chainSelectLean([{ store: 'Skroutz', date: '2026-06-01', total: 10 }]));
    returnDaysLeftMock.mockImplementation(() => null);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('omits the store price from the line when the receipt total is 0', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, defaultReturnWindowDays: 14 }));
    receiptFind.mockReturnValue(chainSelectLean([{ store: 'Freebie', date: '2026-07-25', total: 0 }]));
    returnDaysLeftMock.mockImplementation(() => 1);
    const result = await runAlertChecks();
    expect(result.summary).toContain('↩ 1 return window(s) closing ≤3d: Freebie (1d)');
  });
});

describe('runAlertChecks · installments due this month', () => {
  it('sums perAmount only across active (not-done) plans with at least 1 remaining installment', async () => {
    computeInstallmentPlansMock.mockImplementation(() => [
      { done: false, remainingInstallments: 3, perAmount: 50 },
      { done: false, remainingInstallments: 1, perAmount: 25 },
      { done: true, remainingInstallments: 0, perAmount: 999 }, // finished plan, excluded
      { done: false, remainingInstallments: 0, perAmount: 999 }, // no installments left, excluded
    ]);
    const result = await runAlertChecks();
    expect(result.summary).toContain('💳 installments this month: €75 (2 plans)');
  });

  it('feeds the raw (unparsed) statement docs into computeInstallmentPlans', async () => {
    const rawStatements = [{ _id: 's1', card: 'Visa' }];
    statementFind.mockReturnValue(chainLean(rawStatements));
    await runAlertChecks();
    expect(computeInstallmentPlansMock).toHaveBeenCalledWith(rawStatements);
  });

  it('fires the installment.due webhook only when something is due', async () => {
    computeInstallmentPlansMock.mockImplementation(() => [{ done: false, remainingInstallments: 2, perAmount: 40.6 }]);
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('installment.due', { amount: 41, plans: 1 });
  });

  it('does not fire installment.due when nothing is due', async () => {
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalledWith('installment.due', expect.anything());
  });
});

describe('runAlertChecks · recurring price hikes', () => {
  it('surfaces detectPriceHikes output verbatim in the summary line', async () => {
    detectPriceHikesMock.mockImplementation(() => [{ vendor: 'Netflix', prev: 13, curr: 15, deltaPct: 15 }]);
    const result = await runAlertChecks();
    expect(result.summary).toContain('📈 1 recurring price change(s): Netflix €13→€15 (+15%)');
  });

  it('formats a negative deltaPct without a leading +', async () => {
    detectPriceHikesMock.mockImplementation(() => [{ vendor: 'ΔΕΗ', prev: 100, curr: 80, deltaPct: -20 }]);
    const result = await runAlertChecks();
    expect(result.summary).toContain('ΔΕΗ €100→€80 (-20%)');
  });

  it('queries Expense with an amount filter but no date bound for the hike scan', async () => {
    await runAlertChecks();
    const [firstCallFilter] = expenseFind.mock.calls[0];
    expect(firstCallFilter).toEqual({ amount: { $gt: 0 } });
  });

  it('has no dedicated webhook event for price hikes', async () => {
    detectPriceHikesMock.mockImplementation(() => [{ vendor: 'Netflix', prev: 13, curr: 15, deltaPct: 15 }]);
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalledWith('price.hike', expect.anything());
  });
});

describe('runAlertChecks · remote mirror staleness (P48)', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  it('says nothing when the backend is local, and does not even read the timestamp', async () => {
    // No remote can fall behind, so the extra query would never change the outcome —
    // and local-only is the common setup, so it runs on every sweep.
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'local' }));
    getLastRemoteSyncMock.mockImplementation(async () => daysAgo(400));
    const r = await runAlertChecks();
    expect(r.summary).toBe('All clear — nothing to report.');
    expect(getLastRemoteSyncMock).not.toHaveBeenCalled();
  });

  it('warns when a remote backend has never synced at all', async () => {
    // The case worth the whole feature: a mirror configured once and never actually
    // used is indistinguishable from a working one everywhere else in the UI.
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'onedrive' }));
    getLastRemoteSyncMock.mockImplementation(async () => null);
    const r = await runAlertChecks();
    expect(r.summary).toContain('has never completed a sync');
    expect(r.summary).toContain('onedrive');
    expect(r.summary).toContain('Sync now');
  });

  it('warns once the last successful push is older than the configured window', async () => {
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'smb' }));
    getLastRemoteSyncMock.mockImplementation(async () => daysAgo(21));
    const r = await runAlertChecks();
    expect(r.summary).toMatch(/last synced 21 days ago/);
  });

  it('stays quiet when a push happened inside the window', async () => {
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'smb' }));
    getLastRemoteSyncMock.mockImplementation(async () => daysAgo(2));
    const r = await runAlertChecks();
    expect(r.summary).toBe('All clear — nothing to report.');
  });

  it('is switched off by syncStaleDays = 0, even with a remote that never synced', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, syncStaleDays: 0 }));
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'ftp' }));
    getLastRemoteSyncMock.mockImplementation(async () => null);
    const r = await runAlertChecks();
    expect(r.summary).toBe('All clear — nothing to report.');
  });

  it('reads a stored timestamp only — no network call to the remote', async () => {
    // A NAS that is powered off must not make the whole alert sweep hang or fail.
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'smb' }));
    getLastRemoteSyncMock.mockImplementation(async () => daysAgo(30));
    await expect(runAlertChecks()).resolves.toMatchObject({ ok: true });
    expect(getLastRemoteSyncMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches the summary like any other signal, and has no dedicated webhook event', async () => {
    getStorageConfigMock.mockImplementation(async () => ({ backend: 'onedrive' }));
    getLastRemoteSyncMock.mockImplementation(async () => daysAgo(60));
    dispatchAlertMock.mockImplementation(async () => ({ sent: 1, total: 1 }));
    const r = await runAlertChecks();
    expect(r.sent).toBe(true);
    expect(dispatchAlertMock).toHaveBeenCalledWith('Pharos alerts', expect.stringContaining('last synced 60 days ago'));
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalled();
  });
});

describe('runAlertChecks · budget exceeded', () => {
  it('surfaces detectBudgetExceeded output in the summary line and fires its webhook', async () => {
    detectBudgetExceededMock.mockImplementation(() => [{ category: 'groceries', budget: 200, actual: 264, pct: 132 }]);
    const result = await runAlertChecks();
    expect(result.summary).toContain('💰 1 budget(s) exceeded: groceries €264/€200 (132%)');
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('budget.exceeded', { categories: [{ category: 'groceries', budget: 200, actual: 264, pct: 132 }] });
  });

  it('passes s.budgets and a YYYY-MM current-month key to detectBudgetExceeded', async () => {
    const budgets = { groceries: 200 };
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, budgets }));
    await runAlertChecks();
    const [, passedBudgets, passedMonthKey] = detectBudgetExceededMock.mock.calls[0];
    expect(passedBudgets).toBe(budgets);
    expect(passedMonthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it('queries the 2nd Expense.find with both an amount and a date($gte) filter, unlike the hike query', async () => {
    await runAlertChecks();
    const [secondCallFilter] = expenseFind.mock.calls[1];
    expect(secondCallFilter).toMatchObject({ amount: { $gt: 0 } });
    expect((secondCallFilter as { date: { $gte: Date } }).date.$gte).toBeInstanceOf(Date);
  });

  it('does not fire budget.exceeded when nothing is over', async () => {
    await runAlertChecks();
    expect(dispatchEventWebhooksMock).not.toHaveBeenCalledWith('budget.exceeded', expect.anything());
  });
});

describe('runAlertChecks · free trials ending', () => {
  const now = Date.now();
  function daysFromNow(days: number) {
    return new Date(now + days * 86400000).toISOString();
  }

  it('includes a trial ending within the lead-time window, preferring firstChargeAmount', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, trialAlertDays: 5 }));
    subscriptionFind.mockReturnValue(
      chainSelectLean([{ name: 'Streamly', trialEndsAt: daysFromNow(3), amount: 9.99, firstChargeAmount: 14.99 }])
    );
    const result = await runAlertChecks();
    expect(result.summary).toContain('⏳ 1 free trial(s) ending ≤5d: Streamly (3d, €14.99)');
  });

  it('falls back to amount when firstChargeAmount is unset', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, trialAlertDays: 5 }));
    subscriptionFind.mockReturnValue(chainSelectLean([{ name: 'Streamly', trialEndsAt: daysFromNow(3), amount: 9.99 }]));
    const result = await runAlertChecks();
    expect(result.summary).toContain('Streamly (3d, €9.99)');
  });

  it('excludes a trial ending beyond the lead-time window', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, trialAlertDays: 2 }));
    subscriptionFind.mockReturnValue(chainSelectLean([{ name: 'Later', trialEndsAt: daysFromNow(10), amount: 5 }]));
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });
});

describe('runAlertChecks · gift cards expiring', () => {
  it('includes a card with a remaining balance expiring inside the window', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, giftCardAlertDays: 30 }));
    giftCardFind.mockReturnValue(chainSelectLean([{ title: 'IKEA card', initialAmount: 50, uses: [] }]));
    giftCardBalanceMock.mockImplementation(() => 32);
    giftCardDaysLeftMock.mockImplementation(() => 10);
    const result = await runAlertChecks();
    expect(result.summary).toContain('💳 1 gift card(s) expiring ≤30d: IKEA card (€32, 10d)');
  });

  it('excludes a card that is already fully spent, even if it is expiring soon', async () => {
    giftCardFind.mockReturnValue(chainSelectLean([{ title: 'Spent', initialAmount: 50, uses: [{ amount: 50 }] }]));
    giftCardBalanceMock.mockImplementation(() => 0);
    giftCardDaysLeftMock.mockImplementation(() => 5);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('excludes a card with a balance but no expiry inside the window', async () => {
    giftCardFind.mockReturnValue(chainSelectLean([{ title: 'Far off', initialAmount: 50, uses: [] }]));
    giftCardBalanceMock.mockImplementation(() => 50);
    giftCardDaysLeftMock.mockImplementation(() => null);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });
});

describe('runAlertChecks · bills due / overdue', () => {
  it('includes a bill due soon, with a positive day count', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, billAlertDays: 5 }));
    billFind.mockReturnValue(chainSelectLean([{ title: 'DEH', amount: 84, dueDate: '2026-08-01' }]));
    billDaysUntilDueMock.mockImplementation(() => 3);
    const result = await runAlertChecks();
    expect(result.summary).toContain('🧾 1 bill(s) due/overdue: DEH €84 (3d)');
  });

  it('formats an overdue bill (negative days) as "Nd overdue"', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, billAlertDays: 5 }));
    billFind.mockReturnValue(chainSelectLean([{ title: 'Rent', amount: 500, dueDate: '2026-06-01' }]));
    billDaysUntilDueMock.mockImplementation(() => -7);
    const result = await runAlertChecks();
    expect(result.summary).toContain('🧾 1 bill(s) due/overdue: Rent €500 (7d overdue)');
  });

  it('includes an overdue bill even when billAlertDays is 0 (alerts nominally off)', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, billAlertDays: 0 }));
    billFind.mockReturnValue(chainSelectLean([{ title: 'Overdue rent', amount: 500, dueDate: '2026-06-01' }]));
    billDaysUntilDueMock.mockImplementation(() => -1);
    const result = await runAlertChecks();
    expect(result.summary).toContain('Overdue rent');
  });

  it('excludes a bill due further out than the lead-time window', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, billAlertDays: 5 }));
    billFind.mockReturnValue(chainSelectLean([{ title: 'Later bill', amount: 20, dueDate: '2026-09-01' }]));
    billDaysUntilDueMock.mockImplementation(() => 30);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
  });

  it('omits the amount from the line when it is 0', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ ...DEFAULT_SETTINGS, billAlertDays: 5 }));
    billFind.mockReturnValue(chainSelectLean([{ title: 'Zero-amount reminder', amount: 0, dueDate: '2026-08-01' }]));
    billDaysUntilDueMock.mockImplementation(() => 1);
    const result = await runAlertChecks();
    expect(result.summary).toContain('🧾 1 bill(s) due/overdue: Zero-amount reminder (1d)');
  });
});

describe('runAlertChecks · dispatch gating', () => {
  it('awaits dispatchAlert and derives sent from sent>0 when there is something to report', async () => {
    detectPriceHikesMock.mockImplementation(() => [{ vendor: 'Netflix', prev: 13, curr: 15, deltaPct: 15 }]);
    dispatchAlertMock.mockResolvedValueOnce({ sent: 2, total: 3 });
    const result = await runAlertChecks();
    expect(dispatchAlertMock).toHaveBeenCalledWith('Pharos alerts', result.summary);
    expect(result.sent).toBe(true);
  });

  it('sent is false when dispatchAlert reaches zero destinations', async () => {
    detectPriceHikesMock.mockImplementation(() => [{ vendor: 'Netflix', prev: 13, curr: 15, deltaPct: 15 }]);
    dispatchAlertMock.mockResolvedValueOnce({ sent: 0, total: 0 });
    const result = await runAlertChecks();
    expect(result.sent).toBe(false);
  });

  it('joins multiple signal lines with newlines, in scan order', async () => {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'Deal item', targetPrice: 100, currentPrice: 90 }]))
      .mockReturnValueOnce(chainSelectLean([]));
    computeInstallmentPlansMock.mockImplementation(() => [{ done: false, remainingInstallments: 1, perAmount: 30 }]);
    const result = await runAlertChecks();
    expect(result.summary.split('\n')).toEqual([
      '🎯 1 deal(s): Deal item',
      '💳 installments this month: €30 (1 plans)',
    ]);
  });
});

// P103: per-type toggles. Only the OUTBOUND summary is filtered — the bell and the P24
// event webhooks keep the full picture, and a category switched off must not leave a
// trace in the dedup baseline (or re-enabling it would stay silent forever).
describe('runAlertChecks · per-type notification toggles (P103)', () => {
  function withTypes(patch: Record<string, boolean>) {
    getAppSettingsMock.mockImplementation(async () => ({
      ...DEFAULT_SETTINGS,
      notifyTypes: { ...defaultNotifyTypes(), ...patch },
    }));
  }
  function oneDeal() {
    itemFind.mockReset();
    itemFind.mockReturnValue(chainSelectLean([])); // backstop for queries this case doesn't set
    itemFind
      .mockReturnValueOnce(chainSelectLean([{ title: 'U7 Pro', targetPrice: 300, currentPrice: 284 }]))
      .mockReturnValueOnce(chainSelectLean([]));
  }

  it('an absent notifyTypes map sends everything, exactly as before P103', async () => {
    oneDeal();
    const result = await runAlertChecks();
    expect(result.summary).toContain('🎯 1 deal(s): U7 Pro');
  });

  it('drops the line of a category that is switched off', async () => {
    withTypes({ deals: false });
    oneDeal();
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
    expect(dispatchAlertMock).not.toHaveBeenCalled();
  });

  it('keeps the categories that are still on', async () => {
    withTypes({ deals: false });
    oneDeal();
    computeInstallmentPlansMock.mockImplementation(() => [{ done: false, remainingInstallments: 1, perAmount: 30 }]);
    const result = await runAlertChecks();
    expect(result.summary).toBe('💳 installments this month: €30 (1 plans)');
  });

  it('silences the installments line without touching the installment.due webhook', async () => {
    withTypes({ installments: false });
    computeInstallmentPlansMock.mockImplementation(() => [{ done: false, remainingInstallments: 1, perAmount: 30 }]);
    const result = await runAlertChecks();
    expect(result.summary).toBe('All clear — nothing to report.');
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('installment.due', { amount: 30, plans: 1 });
  });

  it('still feeds the in-app bell and the price.drop webhook for a silenced category', async () => {
    withTypes({ deals: false });
    oneDeal();
    await runAlertChecks();
    expect(generateNotificationsMock).toHaveBeenCalled();
    expect(dispatchEventWebhooksMock).toHaveBeenCalledWith('price.drop', { items: [{ title: 'U7 Pro', target: 300 }] });
  });
});
