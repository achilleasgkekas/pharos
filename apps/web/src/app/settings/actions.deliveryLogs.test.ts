import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1987 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers the LAST remaining uncovered
// export in the module: getDeliveryLogs (P80, lines 442-445) — recent outbound delivery
// attempts per notifier/webhook channel, read-only, feeds the per-channel history shown
// in Settings -> Notifications so a silently failing endpoint is visible. Every other
// exported function in this file already has a dedicated slice test (aiEngine, aiPrompts,
// alertChecks/alertChecksDedupe, backup, budgets, imap, lists, notifiers, onedrive,
// scraperAi, storage, stores, tenant, trash) — confirmed by cross-referencing every
// `export async function` in actions.ts against every slice's `from './actions'` import
// list before writing this file.
//
// Importing the module pulls in every top-level import of the 1987-line file, so the
// same full mock set from actions.aiEngine.test.ts / actions.notifiers.test.ts is
// required just to let the import resolve, even though only @/lib/deliveryLog is
// actually exercised here. lib/syncStaleness, lib/alertDedup and lib/backupVerify are
// deliberately left un-mocked (same as the sibling slices) — they are pure/side-effect-
// free at import time and have their own dedicated test files.
//
// Behaviour pinned:
//  - getDeliveryLogs is a two-line guard-plus-delegation: requireAdmin() first, then the
//    ENTIRE function body is `return getDeliveryLog()` — no transformation, no partial
//    read, the admin-gated action and the underlying per-channel log reader
//    (lib/deliveryLog.ts, its own read/write semantics already covered by
//    lib/deliveryLog.shared.test.ts) are otherwise identical.

const {
  connectDBMock,
  appConfigUpdateOne,
  requireAdminMock,
  assertCanWriteMock,
  revalidatePathMock,
  getDeliveryLogMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  assertCanWriteMock: vi.fn(async () => {}),
  revalidatePathMock: vi.fn(),
  getDeliveryLogMock: vi.fn(async () => ({}) as Record<string, { at: string; ok: boolean; detail: string }[]>),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    updateOne: appConfigUpdateOne,
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  },
}));
vi.mock('@/models/Store', () => ({ Store: {} }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/models/Statement', () => ({ Statement: {} }));
vi.mock('@/models/Subscription', () => ({ Subscription: {} }));
vi.mock('@/models/Voucher', () => ({ Voucher: {} }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: {} }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: {} }));
vi.mock('@/lib/giftcard', () => ({ giftCardBalance: vi.fn(), giftCardDaysLeft: vi.fn() }));
vi.mock('@/models/Bill', () => ({ Bill: {} }));
vi.mock('@/lib/bill', () => ({ billDaysUntilDue: vi.fn() }));
vi.mock('@/models/Card', () => ({ Card: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/models/Expense', () => ({ Expense: {} }));
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
vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: vi.fn(), invalidateStorageConfig: vi.fn() }));
vi.mock('@/lib/remoteStorage', () => ({ pushBatchToRemote: vi.fn(), testRemote: vi.fn() }));
vi.mock('@/lib/storagePath', () => ({ renderStoragePath: vi.fn(), DEFAULT_FOLDER_TEMPLATE: '', DEFAULT_NAME_TEMPLATE: '' }));
vi.mock('@/lib/storage', () => ({ readFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/imapConfig', () => ({ getImapConfig: vi.fn(), invalidateImapConfig: vi.fn() }));
vi.mock('@/lib/imapImport', () => ({ testImapConnection: vi.fn(), fetchNewEmails: vi.fn() }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt: vi.fn() }));
vi.mock('@/lib/storeService', () => ({ getStores: vi.fn(async () => []), invalidateStoreCache: vi.fn() }));
vi.mock('@/lib/returnWindow', () => ({ effectiveReturnWindow: vi.fn(), returnDaysLeft: vi.fn() }));
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: vi.fn() }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: vi.fn() }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: vi.fn() }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({})), invalidateAppSettings: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: requireAdminMock, assertCanWrite: assertCanWriteMock }));
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
vi.mock('@/lib/notify', () => ({ sendNtfyTo: vi.fn(), runNtfyTest: vi.fn() }));
vi.mock('@/lib/backupModels', () => ({ BACKUP_MODELS: [], BACKUP_KEYS: [] }));
vi.mock('@/lib/notifiers', () => ({
  dispatchAlert: vi.fn(),
  getNotifiers: vi.fn(async () => []),
  testNotifier: vi.fn(),
}));
// The one module this file actually exercises.
vi.mock('@/lib/deliveryLog', () => ({ getDeliveryLog: getDeliveryLogMock }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: vi.fn() }));
vi.mock('@/app/notifications/actions', () => ({ generateNotifications: vi.fn() }));
vi.mock('@/lib/budgetAlert', () => ({ detectBudgetExceeded: vi.fn() }));
vi.mock('@/lib/depreciation', () => ({ estimatedItemValue: vi.fn() }));
vi.mock('@/lib/insuranceExport', () => ({ buildInsuranceCsv: vi.fn(), buildInsuranceHtml: vi.fn() }));
vi.mock('@/lib/taxExport', () => ({ buildTaxCsv: vi.fn(), buildTaxHtml: vi.fn() }));
vi.mock('jszip', () => ({ default: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({
  getEventWebhooks: vi.fn(async () => []),
  dispatchEventWebhooks: vi.fn(),
  testEventWebhook: vi.fn(),
  generateWebhookSecret: vi.fn(() => 'generated-secret'),
  WEBHOOK_EVENTS: [],
}));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));
// Tenancy seam mocked FLAT (same as the sibling slices): getDeliveryLogs itself never
// touches scoped()/AppConfig directly, it delegates entirely to the (mocked) lib
// function, so this pass-through is only here to let the module resolve.
vi.mock('@/lib/tenancy/request', () => ({
  withRequestTenant: async (fn: () => Promise<any>) => fn(),
  softRequestTenant: async () => ({ tenantId: null, slug: 'default', dbName: '', plan: 'dedicated', status: 'active', isDefault: true }),
}));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (model: unknown) => model,
  tenantDb: async () => ({}),
  tenantModel: (_conn: unknown, model: unknown) => model,
}));

import { getDeliveryLogs } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  assertCanWriteMock.mockImplementation(async () => {});
  revalidatePathMock.mockImplementation(() => undefined);
  getDeliveryLogMock.mockImplementation(async () => ({}));
});

describe('getDeliveryLogs', () => {
  it('requires admin before reading the log', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(getDeliveryLogs()).rejects.toThrow('Forbidden');
    expect(getDeliveryLogMock).not.toHaveBeenCalled();
  });

  it('delegates to getDeliveryLog and returns its result verbatim, no transformation', async () => {
    const log = {
      'notifier:n1': [{ at: '2026-08-01T10:00:00.000Z', ok: true, detail: '' }],
      'webhook:w1': [{ at: '2026-08-02T11:00:00.000Z', ok: false, detail: 'HTTP 500' }],
    };
    getDeliveryLogMock.mockResolvedValueOnce(log);
    const res = await getDeliveryLogs();
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(getDeliveryLogMock).toHaveBeenCalledTimes(1);
    expect(res).toBe(log); // same reference: the action does not clone or reshape it
  });

  it('passes an empty log through as an empty object, not null/undefined', async () => {
    getDeliveryLogMock.mockResolvedValueOnce({});
    const res = await getDeliveryLogs();
    expect(res).toEqual({});
  });
});
