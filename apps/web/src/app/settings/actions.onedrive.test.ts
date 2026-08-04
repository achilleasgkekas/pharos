import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers the LAST remaining concern: the
// OneDrive wizard (lines ~1776-1810) — startOnedriveAuth / pollOnedriveAuth /
// getOnedriveStatus / disconnectOnedriveAccount / testOnedriveConnection. All five are
// thin wrappers around lib/onedrive.ts's device-code OAuth flow (startDeviceCode /
// pollDeviceToken / getOnedriveCreds / disconnectOnedrive / testOnedrive), which is
// mocked here as opaque vi.fn()s (it already has its own coverage elsewhere, and its
// device-code/Graph-fetch flow is out of scope for this thin-wrapper concern) — this
// file pins ONLY the wiring: which gate each wrapper uses, how it forwards/trims
// arguments, and when it triggers the storage-cache invalidation + /settings revalidate.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve,
// even though only a handful of those modules are actually exercised here.
//
// Behaviour pinned:
//  - startOnedriveAuth: gated by requireAdmin (full admin, not just assertCanWrite);
//    trims the typed clientId before forwarding to startDeviceCode; returns its result
//    verbatim (including the ok:false/error shape on failure).
//  - pollOnedriveAuth: gated by the WEAKER assertCanWrite (any write-capable user can
//    finish a sign-in an admin started); trims clientId but forwards deviceCode as-is;
//    ONLY on status:'ok' does it invalidateStorageConfig + revalidatePath('/settings') —
//    'pending' and 'error' touch neither; returns pollDeviceToken's result verbatim.
//  - getOnedriveStatus: NO auth gate at all (read-only status probe) — maps
//    getOnedriveCreds()'s null/non-null into connected:boolean, defaulting account to ''
//    when creds exist but the captured account name is blank.
//  - disconnectOnedriveAccount: gated by requireAdmin; always calls disconnectOnedrive +
//    invalidateStorageConfig + revalidatePath('/settings') and returns {ok:true}
//    unconditionally (disconnectOnedrive itself never signals failure).
//  - testOnedriveConnection: NO auth gate; a pure passthrough to testOnedrive()'s result.

const {
  requireAdminMock,
  assertCanWriteMock,
  revalidatePathMock,
  invalidateStorageConfigMock,
  startDeviceCodeMock,
  pollDeviceTokenMock,
  getOnedriveCredsMock,
  disconnectOnedriveMock,
  testOnedriveMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  assertCanWriteMock: vi.fn(async () => ({ id: 'user1', role: 'admin' as const, name: 'User' })),
  revalidatePathMock: vi.fn(),
  invalidateStorageConfigMock: vi.fn(),
  startDeviceCodeMock: vi.fn(async (_clientId?: string): Promise<{ ok: boolean; error?: string; userCode?: string; verificationUri?: string; deviceCode?: string; interval?: number; expiresIn?: number }> => ({ ok: true, userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc-1', interval: 5, expiresIn: 900 })),
  pollDeviceTokenMock: vi.fn(async (_clientId: string | undefined, _deviceCode: string): Promise<{ status: 'ok' | 'pending' | 'error'; error?: string; account?: string }> => ({ status: 'pending' })),
  getOnedriveCredsMock: vi.fn(async (): Promise<{ clientId: string; refreshToken: string; account: string } | null> => null),
  disconnectOnedriveMock: vi.fn(async () => {}),
  testOnedriveMock: vi.fn(async (): Promise<{ ok: boolean; error?: string; drive?: string }> => ({ ok: true, drive: 'OneDrive' })),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: vi.fn(), findOne: () => ({ select: () => ({ lean: async () => null }) }) } }));
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
vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: vi.fn(), invalidateStorageConfig: invalidateStorageConfigMock }));
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
  startDeviceCode: startDeviceCodeMock,
  pollDeviceToken: pollDeviceTokenMock,
  getOnedriveCreds: getOnedriveCredsMock,
  disconnectOnedrive: disconnectOnedriveMock,
  testOnedrive: testOnedriveMock,
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

import { startOnedriveAuth, pollOnedriveAuth, getOnedriveStatus, disconnectOnedriveAccount, testOnedriveConnection } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  assertCanWriteMock.mockImplementation(async () => ({ id: 'user1', role: 'admin' as const, name: 'User' }));
  revalidatePathMock.mockImplementation(() => undefined);
  invalidateStorageConfigMock.mockImplementation(() => undefined);
  startDeviceCodeMock.mockImplementation(async () => ({ ok: true, userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc-1', interval: 5, expiresIn: 900 }));
  pollDeviceTokenMock.mockImplementation(async () => ({ status: 'pending' as const }));
  getOnedriveCredsMock.mockImplementation(async () => null);
  disconnectOnedriveMock.mockImplementation(async () => {});
  testOnedriveMock.mockImplementation(async () => ({ ok: true, drive: 'OneDrive' }));
});

describe('startOnedriveAuth', () => {
  it('requires admin before requesting a device code', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(startOnedriveAuth('client-1')).rejects.toThrow('not admin');
    expect(startDeviceCodeMock).not.toHaveBeenCalled();
  });

  it('trims the client id before forwarding it', async () => {
    await startOnedriveAuth('  client-1  ');
    expect(startDeviceCodeMock).toHaveBeenCalledWith('client-1');
  });

  it('returns the device code result verbatim on success', async () => {
    startDeviceCodeMock.mockResolvedValueOnce({ ok: true, userCode: 'WXYZ-1234', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc-2', interval: 5, expiresIn: 900 });
    const r = await startOnedriveAuth('client-1');
    expect(r).toEqual({ ok: true, userCode: 'WXYZ-1234', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc-2', interval: 5, expiresIn: 900 });
  });

  it('returns the device code failure shape verbatim', async () => {
    startDeviceCodeMock.mockResolvedValueOnce({ ok: false, error: 'HTTP 400' });
    const r = await startOnedriveAuth('client-1');
    expect(r).toEqual({ ok: false, error: 'HTTP 400' });
  });
});

describe('pollOnedriveAuth', () => {
  it('requires write access before polling', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read only'));
    await expect(pollOnedriveAuth('client-1', 'dc-1')).rejects.toThrow('read only');
    expect(pollDeviceTokenMock).not.toHaveBeenCalled();
  });

  it('trims the client id but forwards the device code unchanged', async () => {
    await pollOnedriveAuth('  client-1  ', '  dc-1  ');
    expect(pollDeviceTokenMock).toHaveBeenCalledWith('client-1', '  dc-1  ');
  });

  it('on status ok: invalidates the storage cache and revalidates /settings', async () => {
    pollDeviceTokenMock.mockResolvedValueOnce({ status: 'ok', account: 'me@example.com' });
    const r = await pollOnedriveAuth('client-1', 'dc-1');
    expect(r).toEqual({ status: 'ok', account: 'me@example.com' });
    expect(invalidateStorageConfigMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('on status pending: touches neither the cache nor revalidate', async () => {
    pollDeviceTokenMock.mockResolvedValueOnce({ status: 'pending' });
    const r = await pollOnedriveAuth('client-1', 'dc-1');
    expect(r).toEqual({ status: 'pending' });
    expect(invalidateStorageConfigMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('on status error: touches neither the cache nor revalidate, returns the error verbatim', async () => {
    pollDeviceTokenMock.mockResolvedValueOnce({ status: 'error', error: 'expired_token' });
    const r = await pollOnedriveAuth('client-1', 'dc-1');
    expect(r).toEqual({ status: 'error', error: 'expired_token' });
    expect(invalidateStorageConfigMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('getOnedriveStatus', () => {
  it('has no auth gate', async () => {
    await getOnedriveStatus();
    expect(requireAdminMock).not.toHaveBeenCalled();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
  });

  it('reports disconnected when no creds are stored', async () => {
    getOnedriveCredsMock.mockResolvedValueOnce(null);
    const r = await getOnedriveStatus();
    expect(r).toEqual({ connected: false, account: '' });
  });

  it('reports connected with the captured account name', async () => {
    getOnedriveCredsMock.mockResolvedValueOnce({ clientId: 'c', refreshToken: 'r', account: 'me@example.com' });
    const r = await getOnedriveStatus();
    expect(r).toEqual({ connected: true, account: 'me@example.com' });
  });

  it('reports connected with an empty account when creds exist but the name capture failed', async () => {
    getOnedriveCredsMock.mockResolvedValueOnce({ clientId: 'c', refreshToken: 'r', account: '' });
    const r = await getOnedriveStatus();
    expect(r).toEqual({ connected: true, account: '' });
  });
});

describe('disconnectOnedriveAccount', () => {
  it('requires admin', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(disconnectOnedriveAccount()).rejects.toThrow('not admin');
    expect(disconnectOnedriveMock).not.toHaveBeenCalled();
  });

  it('disconnects, invalidates the storage cache, revalidates /settings, and returns ok:true', async () => {
    const r = await disconnectOnedriveAccount();
    expect(disconnectOnedriveMock).toHaveBeenCalledTimes(1);
    expect(invalidateStorageConfigMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(r).toEqual({ ok: true });
  });
});

describe('testOnedriveConnection', () => {
  it('has no auth gate', async () => {
    await testOnedriveConnection();
    expect(requireAdminMock).not.toHaveBeenCalled();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
  });

  it('returns the success shape verbatim', async () => {
    testOnedriveMock.mockResolvedValueOnce({ ok: true, drive: "Achilleas's OneDrive" });
    const r = await testOnedriveConnection();
    expect(r).toEqual({ ok: true, drive: "Achilleas's OneDrive" });
  });

  it('returns the failure shape verbatim', async () => {
    testOnedriveMock.mockResolvedValueOnce({ ok: false, error: 'Connect OneDrive first' });
    const r = await testOnedriveConnection();
    expect(r).toEqual({ ok: false, error: 'Connect OneDrive first' });
  });
});
