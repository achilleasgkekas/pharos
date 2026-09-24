import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1793 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the dropdown-lists + spaces
// concern: getListsForEditor / saveList (category taxonomy overrides for
// expenses/items/subscriptions) / saveSpaces (P34 per-property ledger tags).
// Everything else is out of scope.
//
// Importing the module pulls in every top-level import of the 1793-line file, so the
// same full mock set from actions.aiEngine.test.ts is required just to let the import
// resolve. Unlike the other slices, @/lib/taxonomies is NOT stubbed here: TAXONOMY_META /
// normalizeList / normalizeSpaces are small, pure, already-unit-tested (lib/taxonomies.test.ts)
// functions that saveList/saveSpaces lean on directly, so using the real implementations
// makes these tests exercise the actual wiring instead of re-describing a mock.
//
// Behaviour pinned:
//  - getListsForEditor: NO admin gate (read-only); maps TAXONOMY_META to
//    {key,label,where,values,default}, values sourced from getAppSettings().
//  - saveList: unknown key -> {ok:false}, no DB touched; cleaned = normalizeList(values);
//    cleaned.length<=1 (i.e. only the forced 'other' survived) OR cleaned === meta.default
//    (order-sensitive) -> $unset the override (falls back to default); otherwise -> $set the
//    cleaned array; always invalidates the app-settings cache + revalidates '/' (layout).
//  - saveSpaces: cleaned = normalizeSpaces(values); empty -> $unset 'spaces'; non-empty ->
//    $set 'spaces'; same invalidate+revalidate as saveList.
//
// KNOWN GAP (flagged separately, not fixed here — this file is test-only per routine
// territory): unlike every other mutating action in this module, saveList and saveSpaces do
// NOT call requireAdmin(). The tests below document the CURRENT behaviour (no gate), they do
// not assert it is correct.

const {
  connectDBMock,
  appConfigUpdateOne,
  requireAdminMock,
  revalidatePathMock,
  getAppSettingsMock,
  invalidateAppSettingsMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  revalidatePathMock: vi.fn(),
  getAppSettingsMock: vi.fn(async () => ({} as Record<string, unknown>)),
  invalidateAppSettingsMock: vi.fn(async () => {}),
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock, invalidateAppSettings: vi.fn(),
  // #162: the eviction these actions perform is the request-scoped one.
  invalidateAppSettingsForRequest: invalidateAppSettingsMock}));
vi.mock('@/lib/auth', () => ({ requireAdmin: requireAdminMock, assertCanWrite: vi.fn(async () => {}) }));
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
vi.mock('@/lib/notify', () => ({ sendNtfyTo: vi.fn() }));
vi.mock('@/lib/backupModels', () => ({ BACKUP_MODELS: [] }));
vi.mock('@/lib/notifiers', () => ({ dispatchAlert: vi.fn(), getNotifiers: vi.fn(), testNotifier: vi.fn() }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: vi.fn() }));
vi.mock('@/app/notifications/actions', () => ({ generateNotifications: vi.fn() }));
vi.mock('@/lib/budgetAlert', () => ({ detectBudgetExceeded: vi.fn() }));
vi.mock('@/lib/depreciation', () => ({ estimatedItemValue: vi.fn() }));
vi.mock('@/lib/insuranceExport', () => ({ buildInsuranceCsv: vi.fn(), buildInsuranceHtml: vi.fn() }));
vi.mock('@/lib/taxExport', () => ({ buildTaxCsv: vi.fn(), buildTaxHtml: vi.fn() }));
vi.mock('jszip', () => ({ default: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({
  getEventWebhooks: vi.fn(),
  dispatchEventWebhooks: vi.fn(),
  testEventWebhook: vi.fn(),
  generateWebhookSecret: vi.fn(),
  WEBHOOK_EVENTS: [],
}));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));
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

import { getListsForEditor, saveList, saveSpaces } from './actions';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_ITEM_CATEGORIES, DEFAULT_SUBSCRIPTION_CATEGORIES } from '@/lib/taxonomies';

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  revalidatePathMock.mockImplementation(() => undefined);
  getAppSettingsMock.mockImplementation(async () => ({
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    itemCategories: DEFAULT_ITEM_CATEGORIES,
    subscriptionCategories: DEFAULT_SUBSCRIPTION_CATEGORIES,
  }));
  invalidateAppSettingsMock.mockImplementation(async () => undefined);
});

describe('getListsForEditor', () => {
  it('has no admin gate', async () => {
    await getListsForEditor();
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('maps all three taxonomies with label/where/values/default', async () => {
    getAppSettingsMock.mockResolvedValueOnce({
      expenseCategories: ['rent', 'custom-expense', 'other'],
      itemCategories: DEFAULT_ITEM_CATEGORIES,
      subscriptionCategories: ['streaming', 'other'],
    });
    const entries = await getListsForEditor();
    expect(entries).toEqual([
      { key: 'expenseCategories', label: 'Expense / income categories', where: 'Expenses & Income', values: ['rent', 'custom-expense', 'other'], default: DEFAULT_EXPENSE_CATEGORIES },
      { key: 'itemCategories', label: 'Item categories', where: 'Inventory & Shopping', values: DEFAULT_ITEM_CATEGORIES, default: DEFAULT_ITEM_CATEGORIES },
      { key: 'subscriptionCategories', label: 'Subscription categories', where: 'Subscriptions', values: ['streaming', 'other'], default: DEFAULT_SUBSCRIPTION_CATEGORIES },
    ]);
  });

  it('reads values through getAppSettings, not AppConfig directly', async () => {
    await getListsForEditor();
    expect(getAppSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('saveList', () => {
  it('does not currently require admin (known gap, flagged separately)', async () => {
    await saveList('expenseCategories', ['rent']);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown taxonomy key without touching the DB', async () => {
    const res = await saveList('bogusKey', ['a', 'b']);
    expect(res).toEqual({ ok: false });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('clears the override (unset) when the cleaned list is empty (collapses to just "other")', async () => {
    const res = await saveList('itemCategories', []);
    expect(res).toEqual({ ok: true });
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $unset: { 'lists.itemCategories': '' } });
    expect(opts).toEqual({ upsert: true });
  });

  it('clears the override (unset) when the cleaned list matches the built-in default exactly', async () => {
    const res = await saveList('itemCategories', [...DEFAULT_ITEM_CATEGORIES]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $unset: { 'lists.itemCategories': '' } });
  });

  it('stores a real override (set) when the cleaned list differs from the default', async () => {
    const res = await saveList('expenseCategories', ['Groceries', 'Custom Category']);
    expect(res).toEqual({ ok: true });
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $set: { 'lists.expenseCategories': ['groceries', 'custom-category', 'other'] } });
    expect(opts).toEqual({ upsert: true });
  });

  it('normalizes (trim/lowercase/dedupe) via the real normalizeList before comparing to default', async () => {
    await saveList('subscriptionCategories', ['Streaming', 'streaming', '  Gaming  ']);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { 'lists.subscriptionCategories': ['streaming', 'gaming', 'other'] } });
  });

  it('treats a non-array values argument as empty (defensive coercion)', async () => {
    const res = await saveList('itemCategories', undefined as unknown as string[]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $unset: { 'lists.itemCategories': '' } });
  });

  it('connects to the DB before writing', async () => {
    await saveList('itemCategories', ['network']);
    expect(connectDBMock).toHaveBeenCalled();
    expect(appConfigUpdateOne.mock.invocationCallOrder[0]).toBeGreaterThan(connectDBMock.mock.invocationCallOrder[0]);
  });

  it('invalidates the app-settings cache and revalidates the whole layout on success', async () => {
    await saveList('itemCategories', ['network']);
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('saveSpaces', () => {
  it('does not currently require admin (known gap, flagged separately)', async () => {
    await saveSpaces(['Σπίτι']);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('always connects to the DB (no key-validation short-circuit like saveList)', async () => {
    await saveSpaces([]);
    expect(connectDBMock).toHaveBeenCalled();
  });

  it('clears the spaces override when the cleaned list is empty', async () => {
    const res = await saveSpaces([]);
    expect(res).toEqual({ ok: true });
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $unset: { spaces: '' } });
    expect(opts).toEqual({ upsert: true });
  });

  it('treats a non-array values argument as empty (defensive coercion)', async () => {
    const res = await saveSpaces(undefined as unknown as string[]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $unset: { spaces: '' } });
  });

  it('stores the normalized (trim/dedupe-case-insensitive, casing preserved) list when non-empty', async () => {
    const res = await saveSpaces(['  Σπίτι ', 'σπίτι', 'Εξοχικό']);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { spaces: ['Σπίτι', 'Εξοχικό'] } });
  });

  it('invalidates the app-settings cache and revalidates the whole layout on success', async () => {
    await saveSpaces(['Home']);
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});
