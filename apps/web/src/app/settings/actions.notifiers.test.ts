import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the app-defaults + pluggable
// notifier channels + outbound event webhooks concern: saveDefaults / saveNtfy /
// sendTestNtfy / getNotifierChannels / saveNotifierChannels / testNotifierChannel /
// getWebhookSubscriptions / saveWebhookSubscriptions / testWebhookSubscription.
// runAlertChecks (the big scan-and-dispatch function right after these, lines 463-636)
// is its own concern (deals/warranty/return-windows/hikes/budgets/trials/gift-cards/
// bills fan-in) and is deliberately left for a future slice — everything else here is
// out of scope.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve.
//
// Behaviour pinned:
//  - saveDefaults: gated by assertCanWrite (viewer-write-block), NOT requireAdmin like
//    every other saver in this file — intentional, these are safe per-account defaults,
//    not admin-only config. Several numeric fields use `Number(x) || fallback`, which
//    means an explicit "0" is INDISTINGUISHABLE from blank and silently becomes the
//    fallback (defaultWarrantyMonths, warrantyAlertDays, defaultVatRate); others
//    (trialAlertDays, giftCardAlertDays, billAlertDays, defaultReturnWindowDays)
//    deliberately parse with Number.isFinite so an explicit 0 (alerts off) sticks —
//    but note a MISSING field also reads as 0 there (Number(null) is 0, which IS
//    finite), so their stated fallback (2/30/5/14) only ever kicks in for genuinely
//    non-numeric input, never for a blank/absent field.
//    Always $set (never $unset), always upsert, invalidates app-settings + revalidates
//    '/' (layout, because the currency symbol renders app-wide).
//  - saveNtfy / sendTestNtfy / getNotifierChannels / saveNotifierChannels /
//    testNotifierChannel / getWebhookSubscriptions / saveWebhookSubscriptions /
//    testWebhookSubscription: all gated by requireAdmin.
//  - saveNotifierChannels: non-array input -> treated as []; per-channel id/label/
//    url/token/target defaulted+trimmed+slice(60), enabled defaults true unless
//    exactly `false`; ALSO mirrors the first 'ntfy'-type channel into the legacy
//    ntfyUrl/ntfyEnabled fields (empty/false when none); invalidates app-settings.
//  - saveWebhookSubscriptions: blank url -> entry dropped (silently skipped, not an
//    error); a non-blank url that fails the SSRF check (assertPublicUrl) aborts the
//    WHOLE save immediately with {ok:false, error} and never reaches AppConfig.updateOne
//    (no partial save); secret defaults to a freshly generated one only when blank
//    (an existing secret survives); events filtered to known WEBHOOK_EVENTS types only.
//    Unlike saveNotifierChannels, this does NOT call invalidateAppSettings (only
//    revalidatePath) — the notifier channels feed getAppSettings()-cached alert
//    delivery, event webhooks don't.
//  - testWebhookSubscription: same per-call SSRF guard as saveWebhookSubscriptions,
//    applied to the single (possibly unsaved) subscription being tested.

const {
  connectDBMock,
  appConfigUpdateOne,
  requireAdminMock,
  assertCanWriteMock,
  revalidatePathMock,
  getAppSettingsMock,
  invalidateAppSettingsMock,
  sendNtfyToMock,
  getNotifiersMock,
  testNotifierMock,
  getEventWebhooksMock,
  testEventWebhookMock,
  generateWebhookSecretMock,
  assertPublicUrlMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  assertCanWriteMock: vi.fn(async () => {}),
  revalidatePathMock: vi.fn(),
  getAppSettingsMock: vi.fn(async () => ({} as Record<string, unknown>)),
  invalidateAppSettingsMock: vi.fn(),
  sendNtfyToMock: vi.fn(async () => true),
  getNotifiersMock: vi.fn(async () => [] as unknown[]),
  testNotifierMock: vi.fn(async () => true),
  getEventWebhooksMock: vi.fn(async () => [] as unknown[]),
  testEventWebhookMock: vi.fn(async () => true),
  generateWebhookSecretMock: vi.fn(() => 'generated-secret'),
  assertPublicUrlMock: vi.fn(async () => {}),
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
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock, invalidateAppSettings: invalidateAppSettingsMock }));
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
vi.mock('@/lib/notify', () => ({ sendNtfyTo: sendNtfyToMock }));
vi.mock('@/lib/backupModels', () => ({ BACKUP_MODELS: [] }));
vi.mock('@/lib/notifiers', () => ({
  dispatchAlert: vi.fn(),
  getNotifiers: getNotifiersMock,
  testNotifier: testNotifierMock,
}));
vi.mock('@/lib/expoPush', () => ({ pushAllDevices: vi.fn() }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: vi.fn() }));
vi.mock('@/app/notifications/actions', () => ({ generateNotifications: vi.fn() }));
vi.mock('@/lib/budgetAlert', () => ({ detectBudgetExceeded: vi.fn() }));
vi.mock('@/lib/depreciation', () => ({ estimatedItemValue: vi.fn() }));
vi.mock('@/lib/insuranceExport', () => ({ buildInsuranceCsv: vi.fn(), buildInsuranceHtml: vi.fn() }));
vi.mock('@/lib/taxExport', () => ({ buildTaxCsv: vi.fn(), buildTaxHtml: vi.fn() }));
vi.mock('jszip', () => ({ default: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({
  getEventWebhooks: getEventWebhooksMock,
  dispatchEventWebhooks: vi.fn(),
  testEventWebhook: testEventWebhookMock,
  generateWebhookSecret: generateWebhookSecretMock,
  WEBHOOK_EVENTS: [
    { type: 'receipt.parsed', label: 'Receipt parsed', hint: '' },
    { type: 'budget.exceeded', label: 'Budget exceeded', hint: '' },
    { type: 'installment.due', label: 'Installment due', hint: '' },
    { type: 'price.drop', label: 'Price drop / deal hit', hint: '' },
  ],
}));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: assertPublicUrlMock }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import {
  saveDefaults,
  saveNtfy,
  sendTestNtfy,
  getNotifierChannels,
  saveNotifierChannels,
  testNotifierChannel,
  getWebhookSubscriptions,
  saveWebhookSubscriptions,
  testWebhookSubscription,
} from './actions';
import type { NotifierConfig } from '@/lib/notifiers';
import type { WebhookSubscription } from '@/lib/webhooks';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  assertCanWriteMock.mockImplementation(async () => {});
  revalidatePathMock.mockImplementation(() => undefined);
  getAppSettingsMock.mockImplementation(async () => ({ ntfyUrl: '' }));
  invalidateAppSettingsMock.mockImplementation(() => undefined);
  sendNtfyToMock.mockImplementation(async () => true);
  getNotifiersMock.mockImplementation(async () => []);
  testNotifierMock.mockImplementation(async () => true);
  getEventWebhooksMock.mockImplementation(async () => []);
  testEventWebhookMock.mockImplementation(async () => true);
  generateWebhookSecretMock.mockImplementation(() => 'generated-secret');
  assertPublicUrlMock.mockImplementation(async () => {});
});

describe('saveDefaults', () => {
  it('is gated by assertCanWrite, not requireAdmin', async () => {
    await saveDefaults(formData({}));
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('propagates a read-only rejection from assertCanWrite without touching the DB', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('Read-only viewer'));
    await expect(saveDefaults(formData({}))).rejects.toThrow('Read-only viewer');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('applies safe defaults for a fully blank form', async () => {
    // Note: the explicit-0-allowed fields (trial/giftCard/bill/returnWindow) do NOT
    // fall back to their stated default (2/30/5/14) on a blank form: a missing
    // FormData field reads as null, Number(null) is 0, and Number.isFinite(0) is
    // true — so a blank form and an explicit "0" are indistinguishable for these
    // fields, both landing on 0. The stated fallback only triggers when the raw
    // value is non-numeric garbage (Number(...) is NaN), see the dedicated test below.
    await saveDefaults(formData({}));
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(opts).toEqual({ upsert: true });
    expect((update as Record<string, unknown>).$set).toEqual({
      defaultItemView: 'grid',
      defaultWarrantyMonths: 24,
      warrantyAlertDays: 90,
      trialAlertDays: 0,
      giftCardAlertDays: 0,
      billAlertDays: 0,
      autoAddStores: false,
      currency: 'EUR',
      multiCurrency: false,
      defaultVatRate: 24,
      defaultReturnWindowDays: 0,
    });
  });

  it('only "list" flips the item view; anything else (including garbage) is "grid"', async () => {
    await saveDefaults(formData({ defaultItemView: 'list' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { defaultItemView: string }>).$set.defaultItemView).toBe('list');
    await saveDefaults(formData({ defaultItemView: 'kanban' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { defaultItemView: string }>).$set.defaultItemView).toBe('grid');
  });

  it('clamps defaultWarrantyMonths to [0,120] but an explicit 0 falls through to the 24 fallback (the `|| 24` trap)', async () => {
    await saveDefaults(formData({ defaultWarrantyMonths: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { defaultWarrantyMonths: number }>).$set.defaultWarrantyMonths).toBe(24);
    await saveDefaults(formData({ defaultWarrantyMonths: '999' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { defaultWarrantyMonths: number }>).$set.defaultWarrantyMonths).toBe(120);
    await saveDefaults(formData({ defaultWarrantyMonths: '36' }));
    expect((appConfigUpdateOne.mock.calls[2][1] as Record<string, { defaultWarrantyMonths: number }>).$set.defaultWarrantyMonths).toBe(36);
  });

  it('clamps warrantyAlertDays to [0,730] with the same 0-becomes-default (90) trap', async () => {
    await saveDefaults(formData({ warrantyAlertDays: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { warrantyAlertDays: number }>).$set.warrantyAlertDays).toBe(90);
    await saveDefaults(formData({ warrantyAlertDays: '5000' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { warrantyAlertDays: number }>).$set.warrantyAlertDays).toBe(730);
  });

  it('trialAlertDays deliberately allows an explicit 0 (alerts off), clamps to [0,60], and only falls back to 2 for non-numeric input', async () => {
    await saveDefaults(formData({ trialAlertDays: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { trialAlertDays: number }>).$set.trialAlertDays).toBe(0);
    await saveDefaults(formData({ trialAlertDays: '999' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { trialAlertDays: number }>).$set.trialAlertDays).toBe(60);
    await saveDefaults(formData({ trialAlertDays: 'not-a-number' })); // NaN -> the stated fallback (2)
    expect((appConfigUpdateOne.mock.calls[2][1] as Record<string, { trialAlertDays: number }>).$set.trialAlertDays).toBe(2);
  });

  it('giftCardAlertDays deliberately allows an explicit 0 and clamps to [0,365], rounding', async () => {
    await saveDefaults(formData({ giftCardAlertDays: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { giftCardAlertDays: number }>).$set.giftCardAlertDays).toBe(0);
    await saveDefaults(formData({ giftCardAlertDays: '10000' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { giftCardAlertDays: number }>).$set.giftCardAlertDays).toBe(365);
    await saveDefaults(formData({ giftCardAlertDays: '7.6' }));
    expect((appConfigUpdateOne.mock.calls[2][1] as Record<string, { giftCardAlertDays: number }>).$set.giftCardAlertDays).toBe(8);
  });

  it('billAlertDays deliberately allows an explicit 0 and clamps to [0,90]', async () => {
    await saveDefaults(formData({ billAlertDays: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { billAlertDays: number }>).$set.billAlertDays).toBe(0);
    await saveDefaults(formData({ billAlertDays: '365' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { billAlertDays: number }>).$set.billAlertDays).toBe(90);
  });

  it('autoAddStores and multiCurrency are true only on the exact string "true"', async () => {
    await saveDefaults(formData({ autoAddStores: 'true', multiCurrency: 'true' }));
    const set0 = appConfigUpdateOne.mock.calls[0][1] as Record<string, { autoAddStores: boolean; multiCurrency: boolean }>;
    expect(set0.$set.autoAddStores).toBe(true);
    expect(set0.$set.multiCurrency).toBe(true);
    await saveDefaults(formData({ autoAddStores: '1', multiCurrency: 'yes' }));
    const set1 = appConfigUpdateOne.mock.calls[1][1] as Record<string, { autoAddStores: boolean; multiCurrency: boolean }>;
    expect(set1.$set.autoAddStores).toBe(false);
    expect(set1.$set.multiCurrency).toBe(false);
  });

  it('trims and uppercases currency, falling back to EUR when blank', async () => {
    await saveDefaults(formData({ currency: '  usd ' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { currency: string }>).$set.currency).toBe('USD');
    await saveDefaults(formData({ currency: '   ' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { currency: string }>).$set.currency).toBe('EUR');
  });

  it('clamps defaultVatRate to [0,100] with the same 0-becomes-default (24) trap', async () => {
    await saveDefaults(formData({ defaultVatRate: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { defaultVatRate: number }>).$set.defaultVatRate).toBe(24);
    await saveDefaults(formData({ defaultVatRate: '250' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { defaultVatRate: number }>).$set.defaultVatRate).toBe(100);
    await saveDefaults(formData({ defaultVatRate: '13' }));
    expect((appConfigUpdateOne.mock.calls[2][1] as Record<string, { defaultVatRate: number }>).$set.defaultVatRate).toBe(13);
  });

  it('defaultReturnWindowDays deliberately allows an explicit 0 (return tracking off) and clamps to [0,365]', async () => {
    await saveDefaults(formData({ defaultReturnWindowDays: '0' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as Record<string, { defaultReturnWindowDays: number }>).$set.defaultReturnWindowDays).toBe(0);
    await saveDefaults(formData({ defaultReturnWindowDays: '9999' }));
    expect((appConfigUpdateOne.mock.calls[1][1] as Record<string, { defaultReturnWindowDays: number }>).$set.defaultReturnWindowDays).toBe(365);
  });

  it('invalidates the app-settings cache and revalidates the whole layout (currency is app-wide)', async () => {
    const res = await saveDefaults(formData({}));
    expect(res).toEqual({ ok: true });
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('saveNtfy', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(saveNtfy(formData({}))).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('trims the url and reads enabled from the exact string "true"', async () => {
    const res = await saveNtfy(formData({ ntfyUrl: '  https://ntfy.sh/mytopic  ', ntfyEnabled: 'true' }));
    expect(res).toEqual({ ok: true });
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $set: { ntfyUrl: 'https://ntfy.sh/mytopic', ntfyEnabled: true } });
    expect(opts).toEqual({ upsert: true });
  });

  it('defaults to disabled when the field is missing entirely', async () => {
    await saveNtfy(formData({ ntfyUrl: 'https://ntfy.sh/x' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, { ntfyEnabled: boolean }>).$set.ntfyEnabled).toBe(false);
  });

  it('invalidates app-settings and revalidates /settings', async () => {
    await saveNtfy(formData({}));
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('sendTestNtfy', () => {
  it('requires admin', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(sendTestNtfy()).rejects.toThrow('Forbidden');
  });

  it('refuses when no ntfy URL is configured, without calling sendNtfyTo', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ ntfyUrl: '' });
    const res = await sendTestNtfy();
    expect(res).toEqual({ ok: false, error: 'Set an ntfy URL first' });
    expect(sendNtfyToMock).not.toHaveBeenCalled();
  });

  it('sends to the configured URL and reports ok on success', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ ntfyUrl: 'https://ntfy.sh/mytopic' });
    sendNtfyToMock.mockResolvedValueOnce(true);
    const res = await sendTestNtfy();
    expect(res).toEqual({ ok: true });
    expect(sendNtfyToMock).toHaveBeenCalledWith(
      'https://ntfy.sh/mytopic',
      'Pharos test',
      expect.stringContaining('working'),
      { tags: ['white_check_mark'] }
    );
  });

  it('reports a friendly error when the POST fails', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ ntfyUrl: 'https://ntfy.sh/mytopic' });
    sendNtfyToMock.mockResolvedValueOnce(false);
    const res = await sendTestNtfy();
    expect(res).toEqual({ ok: false, error: 'ntfy POST failed — check the URL' });
  });
});

describe('getNotifierChannels', () => {
  it('requires admin and delegates to getNotifiers', async () => {
    const channels: NotifierConfig[] = [{ id: 'n1', type: 'ntfy', enabled: true, url: 'https://ntfy.sh/x' }];
    getNotifiersMock.mockResolvedValueOnce(channels);
    const res = await getNotifierChannels();
    expect(requireAdminMock).toHaveBeenCalled();
    expect(res).toBe(channels);
  });
});

describe('saveNotifierChannels', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(saveNotifierChannels([])).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('treats a non-array input as an empty list', async () => {
    const res = await saveNotifierChannels(null as unknown as NotifierConfig[]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect(update).toEqual({ $set: { notifiers: [], ntfyUrl: '', ntfyEnabled: false } });
  });

  it('defaults id/label/url/token/target and trims, and defaults enabled true unless exactly false', async () => {
    await saveNotifierChannels([
      { id: '', type: 'discord', enabled: undefined as unknown as boolean, url: '  https://discord.example/hook  ' } as NotifierConfig,
      { id: 'n1', type: 'slack', enabled: false, url: ' https://slack.example/hook ', label: 'x'.repeat(80) } as NotifierConfig,
    ]);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    const notifiers = (update as Record<string, { notifiers: NotifierConfig[] }>).$set.notifiers;
    expect(notifiers[0]).toMatchObject({ id: 'n0', enabled: true, url: 'https://discord.example/hook', token: '', target: '' });
    expect(notifiers[1]).toMatchObject({ id: 'n1', enabled: false, url: 'https://slack.example/hook' });
    expect(notifiers[1].label).toHaveLength(60);
  });

  it('mirrors the first ntfy-type channel into legacy ntfyUrl/ntfyEnabled', async () => {
    await saveNotifierChannels([
      { id: 'n0', type: 'discord', enabled: true, url: 'https://discord.example/hook' } as NotifierConfig,
      { id: 'n1', type: 'ntfy', enabled: true, url: 'https://ntfy.sh/mytopic' } as NotifierConfig,
    ]);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, { ntfyUrl: string; ntfyEnabled: boolean }>).$set).toMatchObject({
      ntfyUrl: 'https://ntfy.sh/mytopic',
      ntfyEnabled: true,
    });
  });

  it('clears the legacy ntfy fields when no ntfy channel is present', async () => {
    await saveNotifierChannels([{ id: 'n0', type: 'webhook', enabled: true, url: 'https://example.com/hook' } as NotifierConfig]);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, { ntfyUrl: string; ntfyEnabled: boolean }>).$set).toMatchObject({ ntfyUrl: '', ntfyEnabled: false });
  });

  it('invalidates app-settings and revalidates /settings', async () => {
    await saveNotifierChannels([]);
    expect(invalidateAppSettingsMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('testNotifierChannel', () => {
  it('requires admin and delegates to testNotifier', async () => {
    const channel = { id: 'n1', type: 'ntfy', enabled: true, url: 'https://ntfy.sh/x' } as NotifierConfig;
    testNotifierMock.mockResolvedValueOnce(true);
    const res = await testNotifierChannel(channel);
    expect(requireAdminMock).toHaveBeenCalled();
    expect(testNotifierMock).toHaveBeenCalledWith(channel);
    expect(res).toEqual({ ok: true });
  });

  it('reports a friendly error on delivery failure', async () => {
    testNotifierMock.mockResolvedValueOnce(false);
    const res = await testNotifierChannel({ id: 'n1', type: 'slack', enabled: true } as NotifierConfig);
    expect(res).toEqual({ ok: false, error: 'Delivery failed — check the URL/token' });
  });
});

describe('getWebhookSubscriptions', () => {
  it('requires admin and delegates to getEventWebhooks', async () => {
    const subs: WebhookSubscription[] = [{ id: 'w1', url: 'https://example.com/hook', secret: 's', enabled: true, events: [] }];
    getEventWebhooksMock.mockResolvedValueOnce(subs);
    const res = await getWebhookSubscriptions();
    expect(requireAdminMock).toHaveBeenCalled();
    expect(res).toBe(subs);
  });
});

describe('saveWebhookSubscriptions', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(saveWebhookSubscriptions([])).rejects.toThrow('Forbidden');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('drops entries with a blank url silently (not an error)', async () => {
    const res = await saveWebhookSubscriptions([{ id: 'w1', url: '   ', secret: '', enabled: true, events: [] }]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, { eventWebhooks: WebhookSubscription[] }>).$set.eventWebhooks).toEqual([]);
  });

  it('aborts the whole save (no partial write) when a url fails the SSRF check', async () => {
    assertPublicUrlMock.mockRejectedValueOnce(new Error('refused: private address'));
    const res = await saveWebhookSubscriptions([{ id: 'w1', url: 'http://169.254.169.254/', secret: '', enabled: true, events: [] }]);
    expect(res).toEqual({ ok: false, error: 'http://169.254.169.254/: refused: private address' });
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('generates a secret only when blank; keeps an existing secret as-is', async () => {
    await saveWebhookSubscriptions([
      { id: 'w1', url: 'https://example.com/hook-a', secret: '', enabled: true, events: [] },
      { id: 'w2', url: 'https://example.com/hook-b', secret: 'existing-secret', enabled: true, events: [] },
    ]);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    const subs = (update as Record<string, { eventWebhooks: WebhookSubscription[] }>).$set.eventWebhooks;
    expect(subs[0].secret).toBe('generated-secret');
    expect(subs[1].secret).toBe('existing-secret');
  });

  it('filters events down to known WEBHOOK_EVENTS types, dropping unknown ones', async () => {
    await saveWebhookSubscriptions([
      {
        id: 'w1',
        url: 'https://example.com/hook',
        secret: 's',
        enabled: true,
        events: ['budget.exceeded', 'bogus.event'] as unknown as WebhookSubscription['events'],
      },
    ]);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, { eventWebhooks: WebhookSubscription[] }>).$set.eventWebhooks[0].events).toEqual(['budget.exceeded']);
  });

  it('defaults id/label/enabled and trims url, and does NOT invalidate the app-settings cache', async () => {
    const res = await saveWebhookSubscriptions([
      { id: '', url: '  https://example.com/hook  ', secret: '', enabled: undefined as unknown as boolean, label: 'x'.repeat(80), events: [] },
    ]);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    const sub = (update as Record<string, { eventWebhooks: WebhookSubscription[] }>).$set.eventWebhooks[0];
    expect(sub).toMatchObject({ id: 'w0', url: 'https://example.com/hook', enabled: true });
    expect(sub.label).toHaveLength(60);
    expect(invalidateAppSettingsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('testWebhookSubscription', () => {
  it('requires admin', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(testWebhookSubscription({ id: 'w1', url: 'https://example.com', secret: 's', enabled: true, events: [] })).rejects.toThrow(
      'Forbidden'
    );
  });

  it('rejects a url that fails the SSRF check without calling testEventWebhook', async () => {
    assertPublicUrlMock.mockRejectedValueOnce(new Error('refused: loopback address'));
    const res = await testWebhookSubscription({ id: 'w1', url: 'http://127.0.0.1/', secret: 's', enabled: true, events: [] });
    expect(res).toEqual({ ok: false, error: 'refused: loopback address' });
    expect(testEventWebhookMock).not.toHaveBeenCalled();
  });

  it('delegates to testEventWebhook and reports ok on success', async () => {
    testEventWebhookMock.mockResolvedValueOnce(true);
    const res = await testWebhookSubscription({ id: 'w1', url: 'https://example.com/hook', secret: 's', enabled: true, events: [] });
    expect(res).toEqual({ ok: true });
  });

  it('reports a friendly error on delivery failure', async () => {
    testEventWebhookMock.mockResolvedValueOnce(false);
    const res = await testWebhookSubscription({ id: 'w1', url: 'https://example.com/hook', secret: 's', enabled: true, events: [] });
    expect(res).toEqual({ ok: false, error: 'Delivery failed — check the URL' });
  });
});
