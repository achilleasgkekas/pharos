import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1793 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the store-list management
// concern (D3, lines ~1044-1225): listStores / saveStore / deleteStore (plain CRUD over
// the user-editable Store collection) plus findDuplicateStores / mergeStores (fuzzy
// same-shop clustering across receipts+items+the store list, and merging a cluster into
// one canonical name). Everything else in the module is out of scope.
//
// Importing the module pulls in every top-level import of the 1793-line file, so the
// same full mock set from actions.aiEngine.test.ts is required just to let the import
// resolve. @/lib/storeService is stubbed (listStores just delegates to getStores(), no
// need to exercise the real cache/seed logic here — that already has its own coverage).
// storeKey()/the prefix-merge union-find are private helpers inside findDuplicateStores;
// they are exercised indirectly through realistic aggregate() fixtures below rather than
// imported directly.
//
// KNOWN GAP (flagged separately, not fixed here — this file is test-only per routine
// territory): unlike almost every other mutating action in this module (28 call sites),
// saveStore / deleteStore / mergeStores do NOT call requireAdmin(). Same class of bug as
// the one already found in the dropdown-lists slice (0bc5e14 fixed an earlier instance of
// it for Settings→Notifications). The tests below document the CURRENT (no gate)
// behaviour, they do not assert it is correct — see the "known gap" tests in each block.

const {
  connectDBMock,
  storeFindByIdAndUpdate,
  storeCreate,
  storeFindByIdAndDelete,
  storeFindMock,
  storeFindOneMock,
  storeDeleteManyMock,
  invalidateStoreCacheMock,
  getStoresMock,
  receiptAggregateMock,
  receiptUpdateManyMock,
  itemAggregateMock,
  itemUpdateManyMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  storeFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, unknown>) => ({})),
  storeCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  storeFindByIdAndDelete: vi.fn(async (_id: string) => ({})),
  storeFindMock: vi.fn(() => ({ select: () => ({ lean: async () => [] as { name: string }[] }) })),
  storeFindOneMock: vi.fn(async (_filter: Record<string, unknown>) => null as { aliases: string[]; auto: boolean; save: () => Promise<void> } | null),
  storeDeleteManyMock: vi.fn(async (_filter: Record<string, unknown>) => ({})),
  invalidateStoreCacheMock: vi.fn(),
  getStoresMock: vi.fn(async () => [] as { name: string; aliases: string[] }[]),
  receiptAggregateMock: vi.fn(async (_pipeline: unknown[]) => [] as { _id: string | null; n: number }[]),
  receiptUpdateManyMock: vi.fn(async (_filter: Record<string, unknown>) => ({ modifiedCount: 0 })),
  itemAggregateMock: vi.fn(async (_pipeline: unknown[]) => [] as { _id: string | null; n: number }[]),
  itemUpdateManyMock: vi.fn(async (_filter: Record<string, unknown>) => ({ modifiedCount: 0 })),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: vi.fn(), findOne: () => ({ select: () => ({ lean: async () => null }) }) } }));
vi.mock('@/models/Store', () => ({
  Store: {
    findByIdAndUpdate: storeFindByIdAndUpdate,
    create: storeCreate,
    findByIdAndDelete: storeFindByIdAndDelete,
    find: storeFindMock,
    findOne: storeFindOneMock,
    deleteMany: storeDeleteManyMock,
  },
}));
vi.mock('@/models/Receipt', () => ({
  Receipt: { aggregate: receiptAggregateMock, updateMany: receiptUpdateManyMock },
}));
vi.mock('@/models/Item', () => ({
  Item: { aggregate: itemAggregateMock, updateMany: itemUpdateManyMock },
}));
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
vi.mock('@/lib/storeService', () => ({ getStores: getStoresMock, invalidateStoreCache: invalidateStoreCacheMock }));
vi.mock('@/lib/returnWindow', () => ({ effectiveReturnWindow: vi.fn(), returnDaysLeft: vi.fn() }));
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: vi.fn() }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: vi.fn() }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: vi.fn() }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({})), invalidateAppSettings: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  assertCanWrite: vi.fn(async () => {}),
}));
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

import { listStores, saveStore, deleteStore, findDuplicateStores, mergeStores } from './actions';
import { requireAdmin } from '@/lib/auth';

const requireAdminMock = vi.mocked(requireAdmin);

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  storeFindByIdAndUpdate.mockImplementation(async () => ({}));
  storeCreate.mockImplementation(async () => ({}));
  storeFindByIdAndDelete.mockImplementation(async () => ({}));
  storeFindMock.mockImplementation(() => ({ select: () => ({ lean: async () => [] }) }));
  storeFindOneMock.mockImplementation(async () => null);
  storeDeleteManyMock.mockImplementation(async () => ({}));
  invalidateStoreCacheMock.mockImplementation(() => undefined);
  getStoresMock.mockImplementation(async () => []);
  receiptAggregateMock.mockImplementation(async () => []);
  receiptUpdateManyMock.mockImplementation(async () => ({ modifiedCount: 0 }));
  itemAggregateMock.mockImplementation(async () => []);
  itemUpdateManyMock.mockImplementation(async () => ({ modifiedCount: 0 }));
  revalidatePathMock.mockImplementation(() => undefined);
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
});

describe('listStores', () => {
  it('delegates directly to getStores() and returns its result verbatim', async () => {
    const rows = [{ name: 'Skroutz', aliases: ['skroutz'] }];
    getStoresMock.mockResolvedValueOnce(rows);
    const res = await listStores();
    expect(res).toBe(rows);
    expect(getStoresMock).toHaveBeenCalledTimes(1);
  });
});

describe('saveStore', () => {
  it('does not currently require admin (known gap, flagged separately)', async () => {
    await saveStore(fd({ name: 'Amazon' }));
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('rejects a blank/whitespace-only name before touching the DB', async () => {
    const res = await saveStore(fd({ name: '   ' }));
    expect(res).toEqual({ ok: false, error: 'Name is required' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('creates a new store (blank id) with trimmed name/url and lowercased/deduped aliases', async () => {
    const res = await saveStore(fd({ name: '  Amazon  ', url: '  https://amazon.de  ', aliases: 'Amazon.de, AMAZON , amazon' }));
    expect(res).toEqual({ ok: true });
    expect(storeCreate).toHaveBeenCalledWith({
      name: 'Amazon',
      url: 'https://amazon.de',
      aliases: ['amazon.de', 'amazon', 'amazon'],
      auto: false,
      returnWindowDays: null,
    });
    expect(storeFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('defaults aliases to [lowercased name] on create when none were given', async () => {
    await saveStore(fd({ name: 'Skroutz' }));
    expect(storeCreate).toHaveBeenCalledWith(expect.objectContaining({ aliases: ['skroutz'] }));
  });

  it('updates an existing store (id present) via findByIdAndUpdate with a $set, not create', async () => {
    const res = await saveStore(fd({ id: 'store1', name: 'Skroutz', url: 'https://skroutz.gr' }));
    expect(res).toEqual({ ok: true });
    expect(storeFindByIdAndUpdate).toHaveBeenCalledWith('store1', {
      $set: { name: 'Skroutz', url: 'https://skroutz.gr', aliases: [], auto: false, returnWindowDays: null },
    });
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('does NOT apply the [lowercased name] alias fallback on the update path (unlike create)', async () => {
    await saveStore(fd({ id: 'store1', name: 'Skroutz' }));
    const [, update] = storeFindByIdAndUpdate.mock.calls[0];
    expect((update as { $set: { aliases: string[] } }).$set.aliases).toEqual([]);
  });

  it.each([
    ['', null],
    ['   ', null],
    ['abc', null],
    ['400', 365],
    ['-5', 0],
    ['45.6', 46],
    ['90', 90],
  ])('normalizes returnWindowDays %j -> %j', async (raw, expected) => {
    await saveStore(fd({ name: 'Store', returnWindowDays: raw }));
    expect(storeCreate).toHaveBeenCalledWith(expect.objectContaining({ returnWindowDays: expected }));
  });

  it('reports a friendly error when the create throws (duplicate name)', async () => {
    storeCreate.mockRejectedValueOnce(new Error('E11000 duplicate key'));
    const res = await saveStore(fd({ name: 'Amazon' }));
    expect(res).toEqual({ ok: false, error: 'A store with that name already exists' });
    expect(invalidateStoreCacheMock).not.toHaveBeenCalled();
  });

  it('reports the same friendly error when the update throws', async () => {
    storeFindByIdAndUpdate.mockRejectedValueOnce(new Error('duplicate'));
    const res = await saveStore(fd({ id: 'store1', name: 'Amazon' }));
    expect(res).toEqual({ ok: false, error: 'A store with that name already exists' });
  });

  it('invalidates the store cache and revalidates settings+receipts on success', async () => {
    await saveStore(fd({ name: 'Amazon' }));
    expect(invalidateStoreCacheMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });
});

describe('deleteStore', () => {
  it('does not currently require admin (known gap, flagged separately)', async () => {
    await deleteStore('store1');
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('hard-deletes by id and invalidates + revalidates settings/receipts', async () => {
    const res = await deleteStore('store1');
    expect(res).toEqual({ ok: true });
    expect(connectDBMock).toHaveBeenCalled();
    expect(storeFindByIdAndDelete).toHaveBeenCalledWith('store1');
    expect(invalidateStoreCacheMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });
});

describe('findDuplicateStores', () => {
  it('returns [] when nothing has more than one variant per normalized key', async () => {
    receiptAggregateMock.mockResolvedValueOnce([{ _id: 'Amazon', n: 3 }]);
    itemAggregateMock.mockResolvedValueOnce([]);
    storeFindMock.mockReturnValueOnce({ select: () => ({ lean: async () => [{ name: 'Amazon' }] }) });
    const res = await findDuplicateStores();
    expect(res).toEqual([]);
  });

  it('ignores falsy/blank _id entries from the aggregates', async () => {
    receiptAggregateMock.mockResolvedValueOnce([
      { _id: null, n: 9 },
      { _id: '', n: 4 },
      { _id: 'Amazon', n: 1 },
    ]);
    const res = await findDuplicateStores();
    expect(res).toEqual([]); // Amazon alone is a single-variant group, excluded
  });

  it('clusters prefix-related store-name variants (Steam / Steampowered), merges usage counts and inList flags, sorts variants by usage desc', async () => {
    receiptAggregateMock.mockResolvedValueOnce([
      { _id: 'Steam', n: 5 },
      { _id: 'Steampowered', n: 2 },
    ]);
    itemAggregateMock.mockResolvedValueOnce([{ _id: 'Steam', n: 1 }]);
    storeFindMock.mockReturnValueOnce({ select: () => ({ lean: async () => [{ name: 'Steam' }] }) });

    const res = await findDuplicateStores();

    expect(res).toEqual([
      {
        key: 'steam',
        variants: [
          { name: 'Steam', receiptCount: 5, itemCount: 1, inList: true },
          { name: 'Steampowered', receiptCount: 2, itemCount: 0, inList: false },
        ],
      },
    ]);
  });

  it('greek/latin + domain-suffix agnostic clustering (Κωτσόβολος vs kotsovolos.gr)', async () => {
    receiptAggregateMock.mockResolvedValueOnce([{ _id: 'Κωτσόβολος', n: 4 }]);
    itemAggregateMock.mockResolvedValueOnce([{ _id: 'kotsovolos.gr', n: 2 }]);
    const res = await findDuplicateStores();
    expect(res).toHaveLength(1);
    expect(res[0].variants.map((v) => v.name).sort()).toEqual(['kotsovolos.gr', 'Κωτσόβολος'].sort());
  });

  it('queries receipts/items scoped to non-deleted docs, and reads the store list name-only', async () => {
    await findDuplicateStores();
    expect(receiptAggregateMock).toHaveBeenCalledWith([
      { $match: { deletedAt: null } },
      { $group: { _id: '$store', n: { $sum: 1 } } },
    ]);
    expect(itemAggregateMock).toHaveBeenCalledWith([
      { $match: { purchasedFrom: { $nin: ['', null] }, deletedAt: null } },
      { $group: { _id: '$purchasedFrom', n: { $sum: 1 } } },
    ]);
  });

  it('sorts multiple groups by variant count descending', async () => {
    // "trio" cluster: Trio/Triofoo/Triobarbaz all prefix-chain onto the shortest key
    // "trio" -> 3 variants. "doremi" cluster: Doremi/Doremifasol -> 2 variants.
    receiptAggregateMock.mockResolvedValueOnce([
      { _id: 'Trio', n: 1 },
      { _id: 'Triofoo', n: 1 },
      { _id: 'Triobarbaz', n: 1 },
      { _id: 'Doremi', n: 1 },
      { _id: 'Doremifasol', n: 1 },
    ]);
    const res = await findDuplicateStores();
    expect(res.map((g) => g.variants.length)).toEqual([3, 2]);
  });
});

describe('mergeStores', () => {
  it('rejects a blank canonical name without touching the DB', async () => {
    const res = await mergeStores('   ', ['Steam']);
    expect(res).toEqual({ ok: false, updated: 0, error: 'No canonical name' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects when every variant equals the canonical name (nothing to drop)', async () => {
    const res = await mergeStores('Steam', ['Steam', '']);
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to merge' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('does not currently require admin (known gap, flagged separately)', async () => {
    await mergeStores('Steam', ['Steampowered']);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('rewrites receipts.store + items.purchasedFrom for every dropped variant and sums modifiedCount', async () => {
    receiptUpdateManyMock.mockResolvedValueOnce({ modifiedCount: 3 });
    itemUpdateManyMock.mockResolvedValueOnce({ modifiedCount: 1 });
    const res = await mergeStores('Steam', ['Steam', 'Steampowered']);
    expect(res).toEqual({ ok: true, updated: 4 });
    expect(receiptUpdateManyMock).toHaveBeenCalledWith({ store: 'Steampowered' }, { $set: { store: 'Steam' } });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({ purchasedFrom: 'Steampowered' }, { $set: { purchasedFrom: 'Steam' } });
  });

  it('folds dropped names into the existing canonical store doc as lowercased aliases and saves it', async () => {
    const saveMock = vi.fn(async () => undefined);
    storeFindOneMock.mockResolvedValueOnce({ aliases: ['steam'], auto: true, save: saveMock });
    await mergeStores('Steam', ['Steampowered']);
    expect(storeFindOneMock).toHaveBeenCalledWith({ name: 'Steam' });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('deduplicates aliases (existing + dropped + canon itself) via a Set', async () => {
    const doc: { aliases: string[]; auto: boolean; save: () => Promise<void> } = {
      aliases: ['steam'],
      auto: true,
      save: vi.fn(async () => undefined),
    };
    storeFindOneMock.mockResolvedValueOnce(doc);
    await mergeStores('Steam', ['Steampowered', 'STEAM']);
    expect(doc.aliases).toEqual(['steam', 'steampowered']);
    expect(doc.auto).toBe(false);
  });

  it('creates a new canonical store doc (with folded aliases) when none exists yet', async () => {
    storeFindOneMock.mockResolvedValueOnce(null);
    await mergeStores('Steam', ['Steampowered']);
    expect(storeCreate).toHaveBeenCalledWith({ name: 'Steam', aliases: ['steampowered', 'steam'], auto: false });
  });

  it('deletes every dropped variant from the store list', async () => {
    await mergeStores('Steam', ['Steampowered', 'SteamOld']);
    expect(storeDeleteManyMock).toHaveBeenCalledWith({ name: { $in: ['Steampowered', 'SteamOld'] } });
  });

  it('invalidates the store cache and revalidates settings/receipts/items on success', async () => {
    await mergeStores('Steam', ['Steampowered']);
    expect(invalidateStoreCacheMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
  });
});
