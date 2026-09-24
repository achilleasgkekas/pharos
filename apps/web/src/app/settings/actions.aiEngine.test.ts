import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1793 lines, ~20 concerns:
// AI engine, prompts, scraper AI, storage backends, IMAP import, dropdown lists, stores,
// notifiers, webhooks, alerts, backup/export...) — never directly unit-tested before, so
// it is split into one focused test file per concern, same pattern used for the large
// items/receipts/statements action modules. This file covers ONLY the AI-engine slice:
// Ollama model list/pull, provider config save, per-provider model discovery, the master
// AI switch, per-feature toggles, onboarding-banner dismissal, the Anthropic test ping,
// and the bulk-AI cost-guard toggle. Everything else in the module (prompts, storage,
// IMAP, lists, stores, notifiers, webhooks, alerts) is out of scope here.
//
// Importing the module pulls in EVERY top-level import of the 1793-line file (it's one
// module), so every real I/O/DB/fetch dependency is mocked even though most of it is
// untouched by these tests. `@/lib/aiFeatures` and `@/lib/aiModels` are explicitly
// client-safe/pure (no server imports, verified by reading both files) so they run for
// real — that's what actually pins AI_FEATURE_KEYS validation and the pricing/vision
// lookups in fetchProviderModels.
//
// Behaviour pinned:
//  - listOllamaModels: resolves the host from getAiConfig (fallback env/localhost),
//    maps name-or-model + bytes→GB (1 decimal), drops entries without a name, and
//    swallows any fetch/HTTP error into an empty array (never throws).
//  - pullOllamaModel: requires admin BEFORE validating; rejects blank/too-long (>100)/
//    non-[a-z0-9._/:-] model refs before ever touching fetch; on success invalidates the
//    Ollama health cache + revalidates /settings; surfaces both HTTP-not-ok and a
//    `{error}` field in an ok:true JSON body as failures; catches thrown errors too.
//  - saveAiConfig: normalizes the provider to one of the 6 known ids (default 'ollama'
//    for anything else), strips a trailing slash off ollamaHost/customBaseUrl, defaults
//    anthropicModel when blank, and only overwrites a provider API key when a NON-blank
//    value was typed (blank = keep the existing key) — invalidates both the AI config
//    cache and the Ollama health cache, revalidates /settings.
//  - fetchProviderModels: requires admin; per provider, an absent key (typed-or-saved)
//    short-circuits with a friendly error before any fetch for anthropic/openai/gemini
//    (openrouter/custom tolerate no key); results are annotated with cost + a
//    "recommended" flag from the pure aiModels table and sorted
//    recommended-first/priced-first/alphabetical, capped at 120; an unknown provider and
//    an empty result set both return ok:false without throwing; a timeout/abort error is
//    normalized to "Request timed out".
//  - setAiEnabled/setAiFeature: both require admin; setAiFeature rejects any key not in
//    AI_FEATURE_KEYS without touching the DB.
//  - dismissAiOnboarding/dismissOnboarding: no admin gate (any signed-in user can dismiss
//    their own banners), each invalidates its own cache (AI config vs app settings) and
//    revalidates the whole layout.
//  - testAnthropic: falls back to `process.env.ANTHROPIC_API_KEY` when nothing is saved,
//    and short-circuits with an explicit error when neither is set (never calls
//    anthropicTest with an empty key).
//  - setAiConfirmBulk: no admin gate, plain boolean passthrough.

const {
  connectDBMock,
  appConfigUpdateOne,
  appConfigFindOneLean,
  requireAdminMock,
  getAiConfigMock,
  invalidateAiConfigCacheMock,
  invalidateOllamaHealthMock,
  revalidatePathMock,
  anthropicTestMock,
  fetchMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>) => ({})),
  appConfigFindOneLean: vi.fn(async (_filter?: Record<string, unknown>) => null as Record<string, unknown> | null),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  getAiConfigMock: vi.fn(async () => ({
    ollamaHost: 'http://localhost:11434',
    anthropicApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
    openrouterApiKey: '',
    customApiKey: '',
    customBaseUrl: '',
  })),
  invalidateAiConfigCacheMock: vi.fn(),
  invalidateOllamaHealthMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  anthropicTestMock: vi.fn(async (_key: string, _model: string) => ({ ok: true })),
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    updateOne: appConfigUpdateOne,
    findOne: (filter: Record<string, unknown>) => ({ lean: () => appConfigFindOneLean(filter) }),
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
vi.mock('@/lib/aiConfig', () => ({ invalidateAiConfigCache: invalidateAiConfigCacheMock, getAiConfig: getAiConfigMock }));
vi.mock('@/lib/ollama', () => ({
  invalidateOllamaHealth: invalidateOllamaHealthMock,
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
vi.mock('@/lib/anthropic', () => ({ anthropicTest: anthropicTestMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(), invalidateAppSettings: vi.fn() , invalidateAppSettingsForRequest: vi.fn(async () => {})}));
vi.mock('@/lib/auth', () => ({ requireAdmin: requireAdminMock, assertCanWrite: vi.fn(async () => {}) }));
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

import {
  listOllamaModels,
  pullOllamaModel,
  saveAiConfig,
  fetchProviderModels,
  setAiEnabled,
  setAiFeature,
  dismissAiOnboarding,
  dismissOnboarding,
  testAnthropic,
  setAiConfirmBulk,
} from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigUpdateOne.mockImplementation(async () => ({}));
  appConfigFindOneLean.mockImplementation(async () => null);
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  getAiConfigMock.mockImplementation(async () => ({
    ollamaHost: 'http://localhost:11434',
    anthropicApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
    openrouterApiKey: '',
    customApiKey: '',
    customBaseUrl: '',
  }));
  invalidateAiConfigCacheMock.mockImplementation(() => undefined);
  invalidateOllamaHealthMock.mockImplementation(() => undefined);
  revalidatePathMock.mockImplementation(() => undefined);
  anthropicTestMock.mockImplementation(async () => ({ ok: true }));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listOllamaModels', () => {
  it('maps name/model + byte size to GB, dropping nameless entries', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        models: [
          { name: 'qwen2.5:14b', size: 9_000_000_000 },
          { model: 'qwen2.5vl:7b', size: 6_400_000_000 }, // uses `model` when `name` is absent
          { size: 1_000_000_000 }, // no name/model at all -> dropped
        ],
      })
    );
    const models = await listOllamaModels();
    expect(models).toEqual([
      { name: 'qwen2.5:14b', sizeGB: 9 },
      { name: 'qwen2.5vl:7b', sizeGB: 6.4 },
    ]);
  });

  it('returns [] when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
    expect(await listOllamaModels()).toEqual([]);
  });

  it('returns [] when fetch throws (host unreachable)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await listOllamaModels()).toEqual([]);
  });

  it('falls back to the default local host when getAiConfig has none set', async () => {
    getAiConfigMock.mockResolvedValueOnce({ ollamaHost: '', anthropicApiKey: '', openaiApiKey: '', geminiApiKey: '', openrouterApiKey: '', customApiKey: '', customBaseUrl: '' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ models: [] }));
    await listOllamaModels();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });
});

describe('pullOllamaModel', () => {
  it('requires admin before validating the name', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(pullOllamaModel('qwen2.5:14b')).rejects.toThrow('not admin');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a blank model name without calling fetch', async () => {
    expect(await pullOllamaModel('   ')).toEqual({ ok: false, error: 'No model name' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a name over 100 characters', async () => {
    const res = await pullOllamaModel('a'.repeat(101));
    expect(res).toEqual({ ok: false, error: 'Invalid model name' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects characters outside [a-z0-9._/:-]', async () => {
    const res = await pullOllamaModel('qwen; rm -rf /');
    expect(res).toEqual({ ok: false, error: 'Invalid model name' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on success, invalidates ollama health + revalidates /settings', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'success' }));
    const res = await pullOllamaModel('qwen2.5:14b');
    expect(res).toEqual({ ok: true });
    expect(invalidateOllamaHealthMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });

  it('treats a non-ok HTTP status as failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404));
    const res = await pullOllamaModel('qwen2.5:14b');
    expect(res).toEqual({ ok: false, error: 'Ollama HTTP 404' });
    expect(invalidateOllamaHealthMock).not.toHaveBeenCalled();
  });

  it('treats an {error} field in an ok:true JSON body as failure too', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'model not found' }));
    const res = await pullOllamaModel('qwen2.5:14b');
    expect(res).toEqual({ ok: false, error: 'model not found' });
  });

  it('catches a thrown fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const res = await pullOllamaModel('qwen2.5:14b');
    expect(res).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('saveAiConfig', () => {
  it('falls back to "ollama" for an unrecognized provider', async () => {
    await saveAiConfig(formData({ provider: 'made-up-provider' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ aiProvider: 'ollama' });
  });

  it('accepts a known provider and strips trailing slashes from host/baseUrl', async () => {
    await saveAiConfig(
      formData({ provider: 'custom', ollamaHost: 'http://192.168.1.50:11434/', customBaseUrl: 'http://localhost:1234/' })
    );
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({
      aiProvider: 'custom',
      ollamaHost: 'http://192.168.1.50:11434',
      customBaseUrl: 'http://localhost:1234',
    });
  });

  it('defaults anthropicModel when blank', async () => {
    await saveAiConfig(formData({ provider: 'anthropic' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ anthropicModel: 'claude-sonnet-4-5-20250929' });
  });

  it('only overwrites an API key when a non-blank value was typed', async () => {
    await saveAiConfig(formData({ provider: 'anthropic', anthropicApiKey: '  ', openaiApiKey: 'sk-real-key' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    const set = (update as Record<string, unknown>).$set as Record<string, unknown>;
    expect(set).not.toHaveProperty('anthropicApiKey');
    expect(set.openaiApiKey).toBe('sk-real-key');
  });

  it('invalidates both caches and revalidates /settings, and returns ok:true', async () => {
    const res = await saveAiConfig(formData({ provider: 'ollama' }));
    expect(res).toEqual({ ok: true });
    expect(invalidateAiConfigCacheMock).toHaveBeenCalledTimes(1);
    expect(invalidateOllamaHealthMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('fetchProviderModels', () => {
  it('requires admin', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(fetchProviderModels('anthropic')).rejects.toThrow('not admin');
  });

  it('short-circuits with a friendly error when anthropic has no key (typed or saved)', async () => {
    const res = await fetchProviderModels('anthropic');
    expect(res).toEqual({ ok: false, error: 'Enter or save an Anthropic key first' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a typed key over the saved one, marks the recommended model, sorts recommended-first', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'claude-3-5-haiku-20241022' }, { id: 'claude-sonnet-4-5-20250929' }] })
    );
    const res = await fetchProviderModels('anthropic', 'sk-typed-key');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.anthropic.com'),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'sk-typed-key' }) })
    );
    expect(res.models![0].id).toBe('claude-sonnet-4-5-20250929');
    expect(res.models![0].recommended).toBe(true);
  });

  it('openai: filters to gpt-4/o1/o3/o4/chatgpt ids, excluding audio/realtime/embedding etc.', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-4o-realtime-preview' },
          { id: 'text-embedding-3-small' },
          { id: 'whisper-1' },
        ],
      })
    );
    const res = await fetchProviderModels('openai', 'sk-key');
    expect(res.ok).toBe(true);
    expect(res.models!.map((m) => m.id)).toEqual(['gpt-4o']);
  });

  it('openrouter tolerates a missing key and surfaces LIVE pricing when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'anthropic/claude-3.5-sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } }] })
    );
    const res = await fetchProviderModels('openrouter');
    expect(res.ok).toBe(true);
    expect(res.models![0]).toMatchObject({ id: 'anthropic/claude-3.5-sonnet', in: 3, out: 15 });
  });

  it('custom: requires a base URL first (typed or saved)', async () => {
    const res = await fetchProviderModels('custom');
    expect(res).toEqual({ ok: false, error: 'Enter the base URL first' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider without fetching', async () => {
    const res = await fetchProviderModels('made-up');
    expect(res).toEqual({ ok: false, error: 'This provider has no model list' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:false when the provider returns zero models', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const res = await fetchProviderModels('openrouter');
    expect(res).toEqual({ ok: false, error: 'No models returned' });
  });

  it('normalizes a timeout/abort error to "Request timed out"', async () => {
    fetchMock.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
    const res = await fetchProviderModels('openrouter');
    expect(res).toEqual({ ok: false, error: 'Request timed out' });
  });

  it('surfaces a non-ok HTTP status as a provider-specific error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    const res = await fetchProviderModels('anthropic', 'sk-bad-key');
    expect(res).toEqual({ ok: false, error: 'Anthropic HTTP 401' });
  });
});

describe('setAiEnabled', () => {
  it('requires admin, writes aiEnabled, invalidates both caches, revalidates the whole layout', async () => {
    const res = await setAiEnabled(true);
    expect(res).toEqual({ ok: true });
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toEqual({ aiEnabled: true });
    expect(invalidateAiConfigCacheMock).toHaveBeenCalledTimes(1);
    expect(invalidateOllamaHealthMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('setAiFeature', () => {
  it('rejects a key not in AI_FEATURE_KEYS without touching the DB', async () => {
    const res = await setAiFeature('not-a-real-feature', true);
    expect(res).toEqual({ ok: false });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('accepts a real feature key, sets the nested path, revalidates /settings', async () => {
    const res = await setAiFeature('receipts', false);
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toEqual({ 'aiFeatures.receipts': false });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('dismissAiOnboarding / dismissOnboarding', () => {
  it('dismissAiOnboarding needs no admin, sets its own flag, revalidates the layout', async () => {
    const res = await dismissAiOnboarding();
    expect(res).toEqual({ ok: true });
    expect(requireAdminMock).not.toHaveBeenCalled();
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toEqual({ aiOnboardingDismissed: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('dismissOnboarding sets the separate homepage-checklist flag', async () => {
    const res = await dismissOnboarding();
    expect(res).toEqual({ ok: true });
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toEqual({ onboardingDismissed: true });
  });
});

describe('testAnthropic', () => {
  it('errors when neither a saved nor an env key exists, never calling anthropicTest', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await testAnthropic();
      expect(res).toEqual({ ok: false, error: 'No API key saved yet' });
      expect(anthropicTestMock).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it('falls back to process.env.ANTHROPIC_API_KEY when nothing is saved in the DB', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'env-key';
    try {
      await testAnthropic();
      expect(anthropicTestMock).toHaveBeenCalledWith('env-key', 'claude-sonnet-4-5-20250929', '');
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it('prefers the saved key + model over the env fallback', async () => {
    appConfigFindOneLean.mockResolvedValueOnce({ anthropicApiKey: 'saved-key', anthropicModel: 'claude-haiku' });
    await testAnthropic();
    expect(anthropicTestMock).toHaveBeenCalledWith('saved-key', 'claude-haiku', '');
  });

  it('passes the saved workspace id through to anthropicTest (identity-linked keys)', async () => {
    appConfigFindOneLean.mockResolvedValueOnce({ anthropicApiKey: 'saved-key', anthropicModel: 'claude-haiku', anthropicWorkspaceId: 'wrkspc_abc' });
    await testAnthropic();
    expect(anthropicTestMock).toHaveBeenCalledWith('saved-key', 'claude-haiku', 'wrkspc_abc');
  });
});

describe('setAiConfirmBulk', () => {
  it('needs no admin, writes the flag as-is, revalidates /settings', async () => {
    const res = await setAiConfirmBulk(false);
    expect(res).toEqual({ ok: true });
    expect(requireAdminMock).not.toHaveBeenCalled();
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toEqual({ aiConfirmBulk: false });
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});
