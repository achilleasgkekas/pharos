import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1793 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the scraper AI concern:
// getScraperAi / saveScraperAi (a separate provider/model pair used by the price-scraper
// service, distinct from the main app's AI config). Everything else is out of scope.
//
// Importing the module pulls in every top-level import of the 1793-line file, so the
// same full mock set from actions.aiEngine.test.ts is required just to let the import
// resolve, even though only @/models/AppConfig is actually exercised here.
//
// Behaviour pinned:
//  - getScraperAi: NO admin gate (read-only); provider defaults to 'ollama' unless the
//    stored value is exactly 'anthropic'; model defaults to '' when unset; reads via
//    AppConfig.findOne({key:'singleton'}).select('scraperProvider scraperModel').lean().
//  - saveScraperAi: requires admin; reads scraperProvider/scraperModel off a FormData
//    (not a plain object); provider is coerced to 'anthropic' only on an exact string
//    match, anything else (including missing) falls back to 'ollama'; model is trimmed;
//    always upserts via $set and revalidates /settings.

const {
  connectDBMock,
  appConfigFindOneLean,
  appConfigUpdateOne,
  requireAdminMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigFindOneLean: vi.fn(async (_filter?: Record<string, unknown>): Promise<Record<string, unknown> | null> => null),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    updateOne: appConfigUpdateOne,
    findOne: (filter: Record<string, unknown>) => ({
      select: () => ({ lean: () => appConfigFindOneLean(filter) }),
    }),
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(), invalidateAppSettings: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: requireAdminMock }));
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
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { getScraperAi, saveScraperAi } from './actions';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigFindOneLean.mockImplementation(async () => null);
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('getScraperAi', () => {
  it('has no admin gate', async () => {
    await getScraperAi();
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('defaults to ollama + empty model when nothing is stored', async () => {
    const cfg = await getScraperAi();
    expect(cfg).toEqual({ provider: 'ollama', model: '' });
  });

  it('returns anthropic only on an exact stored match', async () => {
    appConfigFindOneLean.mockResolvedValueOnce({ scraperProvider: 'anthropic', scraperModel: 'claude-haiku-4-5' });
    const cfg = await getScraperAi();
    expect(cfg).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });

  it('falls back to ollama for any other stored value', async () => {
    appConfigFindOneLean.mockResolvedValueOnce({ scraperProvider: 'openai', scraperModel: 'x' });
    const cfg = await getScraperAi();
    expect(cfg.provider).toBe('ollama');
  });

  it('reads via findOne({key:"singleton"}).select(...).lean()', async () => {
    await getScraperAi();
    expect(appConfigFindOneLean).toHaveBeenCalledWith({ key: 'singleton' });
  });
});

describe('saveScraperAi', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(saveScraperAi(fd({ scraperProvider: 'anthropic', scraperModel: 'x' }))).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('stores anthropic only on an exact field match', async () => {
    await saveScraperAi(fd({ scraperProvider: 'anthropic', scraperModel: 'claude-haiku-4-5' }));
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $set: { scraperProvider: 'anthropic', scraperModel: 'claude-haiku-4-5' } });
    expect(opts).toEqual({ upsert: true });
  });

  it('falls back to ollama for any other or missing provider field', async () => {
    await saveScraperAi(fd({ scraperModel: 'qwen2.5:14b' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { scraperProvider: 'ollama', scraperModel: 'qwen2.5:14b' } });
  });

  it('trims the model field', async () => {
    await saveScraperAi(fd({ scraperProvider: 'ollama', scraperModel: '  qwen2.5:14b  ' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { scraperProvider: 'ollama', scraperModel: 'qwen2.5:14b' } });
  });

  it('defaults model to empty string when missing', async () => {
    await saveScraperAi(fd({ scraperProvider: 'ollama' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { scraperProvider: 'ollama', scraperModel: '' } });
  });

  it('always upserts and revalidates /settings on success', async () => {
    const res = await saveScraperAi(fd({ scraperProvider: 'ollama', scraperModel: 'x' }));
    expect(res).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});
