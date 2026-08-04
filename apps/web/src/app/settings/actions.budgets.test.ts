import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers the budgets/depreciation/
// category-rules concern: saveBudgets / saveBudgetRollover / saveCategoryRules /
// suggestBudgets / saveAssetAccounts / saveDepreciation (lines ~1490-1591) — the block
// that sits BETWEEN exportTaxBundle and importData in the source file (backup/export
// is its own separate concern, covered by actions.backup.test.ts; deliberately left
// out of that slice, done here instead).
//
// resolveCategoryRules (lib/categoryRules.ts) and suggestBudgetsFromExpenses
// (lib/budgetSuggest.ts) are pure helpers with their own dedicated test files
// (lib/categoryRules.test.ts, lib/budgetSuggest.test.ts) — mocked here as opaque
// vi.fn()s. This file only pins the six functions' own wiring: admin/write gating,
// which query runs, how the raw input object is cleaned/clamped before being written,
// the exact $set shape sent to AppConfig.updateOne, and which cache-invalidate /
// revalidatePath calls follow a successful save.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve.
//
// Behaviour pinned:
//  - saveBudgets/saveBudgetRollover/saveCategoryRules/saveAssetAccounts/saveDepreciation
//    are all gated by assertCanWrite (NOT requireAdmin — a plain write-capable user, not
//    necessarily an admin, can set their own budgets). suggestBudgets has NO gate at all
//    (read-only, connectDB then a plain Expense.find — anyone logged in can ask for a
//    suggestion).
//  - saveBudgets: drops any entry whose value is not a finite number > 0 (zero/negative/
//    NaN/non-numeric are silently dropped, not stored as 0), trims the key, rounds to 2
//    decimals. revalidates /reports AND /settings.
//  - saveBudgetRollover: coerces the arg to a plain boolean via !! (truthy non-boolean
//    input like a string still becomes true/false, never stored raw).
//  - saveCategoryRules: does zero validation itself — the entire cleaning job is
//    delegated to resolveCategoryRules(rules), whose return value is stored verbatim.
//    revalidates ONLY /settings (no /reports, unlike the two budget functions above).
//  - suggestBudgets: queries Expense with kind != 'income', a fixed windowMonths of 3,
//    and returns whatever suggestBudgetsFromExpenses computes plus the window size —
//    it does NOT gate, connectDB, or touch AppConfig at all.
//  - saveAssetAccounts: same "drop unless finite > 0" rule as saveBudgets, but the key
//    is ALSO capped to 60 chars (accounts can have long free-text names).
//  - saveDepreciation: `enabled` defaults to true unless the input is LITERALLY `false`
//    (any other falsy-ish value like undefined/0/'' still leaves it enabled); floorPct/
//    defaultRate are clamped to [0,100] via a shared helper that also treats NaN as 0;
//    per-category rates are clamped only at the TOP (min(100, n)) with NO floor clamp
//    and a negative rate is dropped entirely (n >= 0 guard) rather than clamped to 0;
//    rate keys are also capped to 60 chars.

const { connectDBMock, assertCanWriteMock, appConfigUpdateOneMock, revalidatePathMock, invalidateAppSettingsMock, expenseFindMock, resolveCategoryRulesMock, suggestBudgetsFromExpensesMock } =
  vi.hoisted(() => {
    function chain(data: unknown[]) {
      const obj: { select: () => typeof obj; sort: () => typeof obj; lean: () => Promise<unknown[]> } = {
        select: () => obj,
        sort: () => obj,
        lean: async () => data,
      };
      return obj;
    }
    return {
      connectDBMock: vi.fn(async () => {}),
      assertCanWriteMock: vi.fn(async () => ({ id: 'u1', role: 'member' as const, name: 'User' })),
      appConfigUpdateOneMock: vi.fn(async (_filter: unknown, _update: unknown, _opts: unknown) => ({})),
      revalidatePathMock: vi.fn(),
      invalidateAppSettingsMock: vi.fn(),
      expenseFindMock: vi.fn((_filter?: Record<string, unknown>) => chain([])),
      resolveCategoryRulesMock: vi.fn((_raw: unknown) => [] as unknown[]),
      suggestBudgetsFromExpensesMock: vi.fn((_rows: unknown[], _opts: { windowMonths: number }) => ({} as Record<string, number>)),
    };
  });

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: { updateOne: appConfigUpdateOneMock, findOne: () => ({ select: () => ({ lean: async () => null }) }) },
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
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFindMock } }));
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
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: suggestBudgetsFromExpensesMock }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: resolveCategoryRulesMock }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: vi.fn() }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({})), invalidateAppSettings: invalidateAppSettingsMock }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })), assertCanWrite: assertCanWriteMock }));
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
vi.mock('@/lib/backupModels', () => ({ BACKUP_MODELS: {} }));
vi.mock('@/lib/notifiers', () => ({ dispatchAlert: vi.fn(), getNotifiers: vi.fn(), testNotifier: vi.fn() }));
vi.mock('@/lib/expoPush', () => ({ pushAllDevices: vi.fn() }));
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
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn() }));
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

import { saveBudgets, saveBudgetRollover, saveCategoryRules, suggestBudgets, saveAssetAccounts, saveDepreciation } from './actions';

function chainData(data: unknown[]) {
  const obj: { select: () => typeof obj; sort: () => typeof obj; lean: () => Promise<unknown[]> } = {
    select: () => obj,
    sort: () => obj,
    lean: async () => data,
  };
  return obj;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  assertCanWriteMock.mockImplementation(async () => ({ id: 'u1', role: 'member' as const, name: 'User' }));
  appConfigUpdateOneMock.mockImplementation(async () => ({}));
  revalidatePathMock.mockImplementation(() => undefined);
  invalidateAppSettingsMock.mockImplementation(() => undefined);
  expenseFindMock.mockImplementation(() => chainData([]));
  resolveCategoryRulesMock.mockImplementation(() => []);
  suggestBudgetsFromExpensesMock.mockImplementation(() => ({}));
});

describe('saveBudgets', () => {
  it('requires write access before touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(saveBudgets({ utilities: 100 })).rejects.toThrow('read-only');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('drops non-finite, zero, and negative entries; trims keys; rounds to 2 decimals', async () => {
    await saveBudgets({
      ' utilities ': 100.005,
      groceries: 0,
      rent: -50,
      subscriptions: Number.NaN,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      junk: 'not-a-number' as any,
    });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith(
      { key: 'singleton' },
      { $set: { budgets: { utilities: 100.01 } } },
      { upsert: true },
    );
  });

  it('invalidates settings cache and revalidates /reports and /settings on success', async () => {
    const result = await saveBudgets({ utilities: 50 });
    expect(result).toEqual({ ok: true });
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('handles a null/undefined budgets argument as an empty object rather than throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await saveBudgets(null as any);
    expect(result).toEqual({ ok: true });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { budgets: {} } }, { upsert: true });
  });
});

describe('saveBudgetRollover', () => {
  it('requires write access before touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(saveBudgetRollover(true)).rejects.toThrow('read-only');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('coerces a truthy non-boolean input to true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await saveBudgetRollover('yes' as any);
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { budgetRollover: true } }, { upsert: true });
  });

  it('coerces false and revalidates /reports and /settings', async () => {
    const result = await saveBudgetRollover(false);
    expect(result).toEqual({ ok: true });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { budgetRollover: false } }, { upsert: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('saveCategoryRules', () => {
  it('requires write access before touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(saveCategoryRules([])).rejects.toThrow('read-only');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('stores exactly what resolveCategoryRules returns, passing the raw input through untouched', async () => {
    const raw = [{ match: 'DEI', category: 'utilities' }, { junk: true }];
    const cleaned = [{ match: 'dei', field: 'vendor' as const, category: 'utilities' }];
    resolveCategoryRulesMock.mockReturnValueOnce(cleaned);

    const result = await saveCategoryRules(raw);

    expect(resolveCategoryRulesMock).toHaveBeenCalledWith(raw);
    expect(result).toEqual({ ok: true });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith({ key: 'singleton' }, { $set: { categoryRules: cleaned } }, { upsert: true });
  });

  it('revalidates ONLY /settings, not /reports (unlike saveBudgets/saveBudgetRollover)', async () => {
    await saveCategoryRules([]);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate the app-settings cache (unlike the budget functions)', async () => {
    await saveCategoryRules([]);
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('suggestBudgets', () => {
  it('has no write gate and no admin gate (read-only helper)', async () => {
    await suggestBudgets();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
  });

  it('queries non-income expenses with a fixed 3-month window and returns the helper result plus the window size', async () => {
    const rows = [{ kind: 'expense', amount: 62, category: 'utilities', period: '2026-06', date: '2026-06-04' }];
    expenseFindMock.mockReturnValueOnce(chainData(rows));
    suggestBudgetsFromExpensesMock.mockReturnValueOnce({ utilities: 60 });

    const result = await suggestBudgets();

    expect(expenseFindMock).toHaveBeenCalledWith({ kind: { $ne: 'income' } });
    expect(suggestBudgetsFromExpensesMock).toHaveBeenCalledWith(rows, { windowMonths: 3 });
    expect(result).toEqual({ suggestions: { utilities: 60 }, months: 3 });
  });

  it('never touches AppConfig (pure read)', async () => {
    await suggestBudgets();
    expect(appConfigUpdateOneMock).not.toHaveBeenCalled();
  });
});

describe('saveAssetAccounts', () => {
  it('requires write access before touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(saveAssetAccounts({ savings: 1000 })).rejects.toThrow('read-only');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('drops non-finite/zero/negative entries and rounds to 2 decimals, same rule as saveBudgets', async () => {
    await saveAssetAccounts({ savings: 1234.567, empty: 0, debt: -100 });
    expect(appConfigUpdateOneMock).toHaveBeenCalledWith(
      { key: 'singleton' },
      { $set: { assetAccounts: { savings: 1234.57 } } },
      { upsert: true },
    );
  });

  it('caps an overly long account name to 60 characters', async () => {
    const longName = 'a'.repeat(80);
    await saveAssetAccounts({ [longName]: 500 });
    const call = appConfigUpdateOneMock.mock.calls[0][1] as { $set: { assetAccounts: Record<string, number> } };
    const keys = Object.keys(call.$set.assetAccounts);
    expect(keys).toEqual([longName.slice(0, 60)]);
  });

  it('revalidates /reports and /settings on success', async () => {
    const result = await saveAssetAccounts({ savings: 100 });
    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('saveDepreciation', () => {
  const validCfg = { enabled: true, floorPct: 15, defaultRate: 20, rates: { electronics: 25 } };

  it('requires write access before touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(saveDepreciation(validCfg)).rejects.toThrow('read-only');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('defaults enabled to true unless the input is literally false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await saveDepreciation({ enabled: undefined as any, floorPct: 0, defaultRate: 0, rates: {} });
    let call = appConfigUpdateOneMock.mock.calls[0][1] as { $set: { depreciation: { enabled: boolean } } };
    expect(call.$set.depreciation.enabled).toBe(true);

    appConfigUpdateOneMock.mockClear();
    await saveDepreciation({ ...validCfg, enabled: false });
    call = appConfigUpdateOneMock.mock.calls[0][1] as { $set: { depreciation: { enabled: boolean } } };
    expect(call.$set.depreciation.enabled).toBe(false);
  });

  it('clamps floorPct and defaultRate to [0,100], treating negative/over-range/NaN input', async () => {
    await saveDepreciation({ enabled: true, floorPct: -10, defaultRate: 250, rates: {} });
    const call = appConfigUpdateOneMock.mock.calls[0][1] as {
      $set: { depreciation: { floorPct: number; defaultRate: number } };
    };
    expect(call.$set.depreciation.floorPct).toBe(0);
    expect(call.$set.depreciation.defaultRate).toBe(100);
  });

  it('a non-numeric floorPct/defaultRate falls back to 0', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await saveDepreciation({ enabled: true, floorPct: 'nope' as any, defaultRate: undefined as any, rates: {} });
    const call = appConfigUpdateOneMock.mock.calls[0][1] as {
      $set: { depreciation: { floorPct: number; defaultRate: number } };
    };
    expect(call.$set.depreciation.floorPct).toBe(0);
    expect(call.$set.depreciation.defaultRate).toBe(0);
  });

  it('per-category rates: caps at 100 but does NOT floor a negative value, dropping it entirely instead; trims and caps keys to 60 chars', async () => {
    const longKey = 'x'.repeat(80);
    await saveDepreciation({
      enabled: true,
      floorPct: 10,
      defaultRate: 10,
      rates: { electronics: 250, furniture: -5, ' tools ': 30, [longKey]: 40 },
    });
    const call = appConfigUpdateOneMock.mock.calls[0][1] as { $set: { depreciation: { rates: Record<string, number> } } };
    expect(call.$set.depreciation.rates).toEqual({
      electronics: 100, // capped at 100, no upper floor issue
      tools: 30, // trimmed
      [longKey.slice(0, 60)]: 40, // capped length
      // 'furniture' is absent: n >= 0 guard drops the negative rate entirely (not clamped to 0)
    });
  });

  it('revalidates /reports and /settings, and invalidates the settings cache, on success', async () => {
    const result = await saveDepreciation(validCfg);
    expect(result).toEqual({ ok: true });
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('handles a missing/undefined cfg argument without throwing (defaults applied)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await saveDepreciation(undefined as any);
    expect(result).toEqual({ ok: true });
    const call = appConfigUpdateOneMock.mock.calls[0][1] as {
      $set: { depreciation: { enabled: boolean; floorPct: number; defaultRate: number; rates: Record<string, number> } };
    };
    expect(call.$set.depreciation).toEqual({ enabled: true, floorPct: 0, defaultRate: 0, rates: {} });
  });
});
