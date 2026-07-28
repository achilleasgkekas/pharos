import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (~1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers the Trash concern (lines
// ~1651-1774): getTrash / restoreFromTrash / purgeFromTrash / purgeTrashEntry /
// emptyTrash — the one place that restores or permanently purges the soft-deleted
// (deletedAt-set) records that every "delete" action in the app now produces across
// 10 record types (item/receipt/expense/subscription/voucher/giftcard/loyaltycard/
// bill/goal/task). trashLabel() is a private helper, exercised indirectly through
// getTrash's row output.
//
// Real (unmocked) `mongoose` is used for `Types.ObjectId` — purgeTrashEntry builds an
// `oid` via `new Types.ObjectId(id)` for every type (not just item/receipt), so every id
// used below must be a valid 24-hex-char ObjectId string.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve.
// UNLIKE the other slices, the 10 TRASH_MODELS models (Item/Receipt/Expense/
// Subscription/Voucher/GiftCard/LoyaltyCard/Bill/Goal/Task) are given REAL find/
// findById/updateOne/deleteOne vi.fn()s here (not `{}` stand-ins) since this concern
// exercises all of them; Receipt/Item also get updateMany (item-purge cross-reference
// cleanup) and Statement gets updateMany too (the same cleanup touches installment
// transactions).
//
// Interesting/gap behaviour pinned below (documented, NOT fixed here — out of
// territory for this test-only routine):
//  - getTrash has NO auth gate at all (not requireAdmin, not assertCanWrite) — it's
//    read-only, so probably fine, but it's the only one of the five with zero gating.
//  - restoreFromTrash / purgeTrashEntry are gated by assertCanWrite (any write-capable
//    user, not just admin); purgeFromTrash / emptyTrash require full admin. purgeFromTrash
//    calls purgeTrashEntry, so a purge via the UI actually re-checks TWICE (requireAdmin,
//    then assertCanWrite inside purgeTrashEntry).
//  - getTrash's own >30-day auto-purge calls the FULL purgeTrashEntry (which itself
//    requires assertCanWrite) as a *side effect of listing the trash*. If assertCanWrite
//    ever rejects for the calling user (e.g. some future read-only role) and there
//    happens to be a stale entry, the whole getTrash() call throws instead of just
//    skipping that one row — a plain trash listing can fail because of unrelated cleanup.
//  - emptyTrash's `purged` counter increments unconditionally after each
//    `await purgeTrashEntry(...)`, even when that call turns out to be a no-op (the
//    doc vanished between the listing find() and purgeTrashEntry's own re-fetch) —
//    so the reported count can overstate what was actually deleted.

const ID1 = '507f1f77bcf86cd799439011';
const ID2 = '507f191e810c19729de860ea';
const ID3 = '5f8d0d55b54764421b7156da';

const {
  connectDBMock,
  requireAdminMock,
  assertCanWriteMock,
  revalidatePathMock,
  deleteFileMock,
  itemUpdateManyMock,
  receiptUpdateManyMock,
  statementUpdateManyMock,
  itemModel,
  receiptModel,
  expenseModel,
  subscriptionModel,
  voucherModel,
  giftcardModel,
  loyaltycardModel,
  billModel,
  goalModel,
  taskModel,
} = vi.hoisted(() => {
  function makeChainList(data: unknown[]) {
    const obj: { setOptions: (o: unknown) => typeof obj; select: (f: string) => typeof obj; lean: () => Promise<unknown[]> } = {
      setOptions: vi.fn(() => obj),
      select: vi.fn(() => obj),
      lean: vi.fn(async () => data),
    };
    return obj;
  }
  function makeChainOne(doc: unknown) {
    const obj: { setOptions: (o: unknown) => typeof obj; lean: () => Promise<unknown> } = {
      setOptions: vi.fn(() => obj),
      lean: vi.fn(async () => doc),
    };
    return obj;
  }
  function makeTrashModel() {
    return {
      findMock: vi.fn((_filter?: unknown) => makeChainList([])),
      findByIdMock: vi.fn((_id?: unknown) => makeChainOne(null)),
      updateOneMock: vi.fn((_f?: unknown, _u?: unknown) => ({ setOptions: vi.fn(() => Promise.resolve({})) })),
      deleteOneMock: vi.fn((_f?: unknown) => ({ setOptions: vi.fn(() => Promise.resolve({})) })),
    };
  }
  return {
    connectDBMock: vi.fn(async () => {}),
    requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
    assertCanWriteMock: vi.fn(async () => ({ id: 'user1', role: 'admin' as const, name: 'User' })),
    revalidatePathMock: vi.fn(),
    deleteFileMock: vi.fn(async () => {}),
    itemUpdateManyMock: vi.fn(async (_f?: Record<string, unknown>, _u?: Record<string, unknown>) => ({})),
    receiptUpdateManyMock: vi.fn(async (_f?: Record<string, unknown>, _u?: Record<string, unknown>, _o?: Record<string, unknown>) => ({})),
    statementUpdateManyMock: vi.fn(async (_f?: Record<string, unknown>, _u?: Record<string, unknown>) => ({})),
    itemModel: makeTrashModel(),
    receiptModel: makeTrashModel(),
    expenseModel: makeTrashModel(),
    subscriptionModel: makeTrashModel(),
    voucherModel: makeTrashModel(),
    giftcardModel: makeTrashModel(),
    loyaltycardModel: makeTrashModel(),
    billModel: makeTrashModel(),
    goalModel: makeTrashModel(),
    taskModel: makeTrashModel(),
  };
});

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: vi.fn(), findOne: () => ({ select: () => ({ lean: async () => null }) }) } }));
vi.mock('@/models/Store', () => ({ Store: {} }));
vi.mock('@/models/Receipt', () => ({
  Receipt: { find: receiptModel.findMock, findById: receiptModel.findByIdMock, updateOne: receiptModel.updateOneMock, deleteOne: receiptModel.deleteOneMock, updateMany: receiptUpdateManyMock },
}));
vi.mock('@/models/Item', () => ({
  Item: { find: itemModel.findMock, findById: itemModel.findByIdMock, updateOne: itemModel.updateOneMock, deleteOne: itemModel.deleteOneMock, updateMany: itemUpdateManyMock },
}));
vi.mock('@/models/Statement', () => ({ Statement: { updateMany: statementUpdateManyMock } }));
vi.mock('@/models/Subscription', () => ({
  Subscription: { find: subscriptionModel.findMock, findById: subscriptionModel.findByIdMock, updateOne: subscriptionModel.updateOneMock, deleteOne: subscriptionModel.deleteOneMock },
}));
vi.mock('@/models/Voucher', () => ({
  Voucher: { find: voucherModel.findMock, findById: voucherModel.findByIdMock, updateOne: voucherModel.updateOneMock, deleteOne: voucherModel.deleteOneMock },
}));
vi.mock('@/models/GiftCard', () => ({
  GiftCard: { find: giftcardModel.findMock, findById: giftcardModel.findByIdMock, updateOne: giftcardModel.updateOneMock, deleteOne: giftcardModel.deleteOneMock },
}));
vi.mock('@/models/LoyaltyCard', () => ({
  LoyaltyCard: { find: loyaltycardModel.findMock, findById: loyaltycardModel.findByIdMock, updateOne: loyaltycardModel.updateOneMock, deleteOne: loyaltycardModel.deleteOneMock },
}));
vi.mock('@/lib/giftcard', () => ({ giftCardBalance: vi.fn(), giftCardDaysLeft: vi.fn() }));
vi.mock('@/models/Bill', () => ({
  Bill: { find: billModel.findMock, findById: billModel.findByIdMock, updateOne: billModel.updateOneMock, deleteOne: billModel.deleteOneMock },
}));
vi.mock('@/lib/bill', () => ({ billDaysUntilDue: vi.fn() }));
vi.mock('@/models/Card', () => ({ Card: {} }));
vi.mock('@/models/Task', () => ({
  Task: { find: taskModel.findMock, findById: taskModel.findByIdMock, updateOne: taskModel.updateOneMock, deleteOne: taskModel.deleteOneMock },
}));
vi.mock('@/models/Expense', () => ({
  Expense: { find: expenseModel.findMock, findById: expenseModel.findByIdMock, updateOne: expenseModel.updateOneMock, deleteOne: expenseModel.deleteOneMock },
}));
vi.mock('@/models/Goal', () => ({
  Goal: { find: goalModel.findMock, findById: goalModel.findByIdMock, updateOne: goalModel.updateOneMock, deleteOne: goalModel.deleteOneMock },
}));
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
vi.mock('@/lib/storage', () => ({ readFile: vi.fn(), deleteFile: deleteFileMock }));
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
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { getTrash, restoreFromTrash, purgeFromTrash, purgeTrashEntry, emptyTrash, type TrashType } from './actions';

function chainList(data: unknown[]) {
  const obj: { setOptions: (o: unknown) => typeof obj; select: (f: string) => typeof obj; lean: () => Promise<unknown[]> } = {
    setOptions: vi.fn(() => obj),
    select: vi.fn(() => obj),
    lean: vi.fn(async () => data),
  };
  return obj;
}
function chainOne(doc: unknown) {
  const obj: { setOptions: (o: unknown) => typeof obj; lean: () => Promise<unknown> } = {
    setOptions: vi.fn(() => obj),
    lean: vi.fn(async () => doc),
  };
  return obj;
}

const ALL_TRASH_MODELS = [
  ['item', itemModel] as const,
  ['receipt', receiptModel] as const,
  ['expense', expenseModel] as const,
  ['subscription', subscriptionModel] as const,
  ['voucher', voucherModel] as const,
  ['giftcard', giftcardModel] as const,
  ['loyaltycard', loyaltycardModel] as const,
  ['bill', billModel] as const,
  ['goal', goalModel] as const,
  ['task', taskModel] as const,
];

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  assertCanWriteMock.mockImplementation(async () => ({ id: 'user1', role: 'admin' as const, name: 'User' }));
  revalidatePathMock.mockImplementation(() => undefined);
  deleteFileMock.mockImplementation(async () => {});
  itemUpdateManyMock.mockImplementation(async () => ({}));
  receiptUpdateManyMock.mockImplementation(async () => ({}));
  statementUpdateManyMock.mockImplementation(async () => ({}));
  for (const [, model] of ALL_TRASH_MODELS) {
    model.findMock.mockImplementation(() => chainList([]));
    model.findByIdMock.mockImplementation(() => chainOne(null));
    model.updateOneMock.mockImplementation(() => ({ setOptions: vi.fn(() => Promise.resolve({})) }));
    model.deleteOneMock.mockImplementation(() => ({ setOptions: vi.fn(() => Promise.resolve({})) }));
  }
});

describe('getTrash', () => {
  it('has NO auth gate at all (not requireAdmin, not assertCanWrite) — the only one of the five Trash actions with zero gating', async () => {
    await getTrash();
    expect(requireAdminMock).not.toHaveBeenCalled();
    expect(assertCanWriteMock).not.toHaveBeenCalled();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
  });

  it('queries all 10 TRASH_MODELS types with {deletedAt:{$ne:null}} + withDeleted:true, and never projects (needs the full doc to build a label)', async () => {
    const spyChain = chainList([]);
    itemModel.findMock.mockReturnValueOnce(spyChain);
    await getTrash();
    for (const [, model] of ALL_TRASH_MODELS) {
      expect(model.findMock).toHaveBeenCalledWith({ deletedAt: { $ne: null } });
    }
    expect(spyChain.select).not.toHaveBeenCalled();
  });

  it('builds the title/subtitle via trashLabel per type', async () => {
    const now = new Date().toISOString();
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'RTX 5080', category: 'compute', deletedAt: now }]));
    receiptModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, store: 'Skroutz', total: 129.9, date: '2026-06-15T10:00:00.000Z', deletedAt: now }]));
    expenseModel.findMock.mockReturnValueOnce(
      chainList([
        { _id: ID1, vendor: 'DEI', category: 'utilities', kind: 'expense', amount: 62, deletedAt: now },
        { _id: ID2, vendor: '', category: 'utilities', kind: 'expense', amount: 30, deletedAt: now },
      ])
    );
    subscriptionModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, name: 'Netflix', amount: 15, billingCycle: 'monthly', deletedAt: now }]));
    voucherModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Summer sale', store: 'Skroutz', deletedAt: now }]));
    giftcardModel.findMock.mockReturnValueOnce(
      chainList([
        { _id: ID1, title: 'IKEA card', store: 'IKEA', initialAmount: 50, deletedAt: now },
        { _id: ID2, title: 'No-store card', store: '', initialAmount: 20, deletedAt: now },
      ])
    );
    loyaltycardModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'AB card', store: 'AB Vasilopoulos', deletedAt: now }]));
    billModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Electricity', vendor: 'ΔΕΗ', amount: 30, deletedAt: now }]));
    goalModel.findMock.mockReturnValueOnce(
      chainList([
        { _id: ID1, title: 'Emergency fund', targetAmount: 1000, targetDate: '2027-01-01T00:00:00.000Z', deletedAt: now },
        { _id: ID2, title: 'No-date goal', targetAmount: 500, targetDate: null, deletedAt: now },
      ])
    );
    taskModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Buy cables', status: 'todo', deletedAt: now }]));

    const rows = await getTrash();
    const byType = (type: TrashType, id: string) => rows.find((r) => r.type === type && r.id === id)!;

    expect(byType('item', ID1)).toMatchObject({ title: 'RTX 5080', subtitle: 'compute' });
    expect(byType('receipt', ID1)).toMatchObject({ title: 'Skroutz', subtitle: '€129.9 · 15/06/2026' });
    expect(byType('expense', ID1)).toMatchObject({ title: 'DEI', subtitle: 'expense · €62' });
    // vendor missing → falls back to category for the title
    expect(byType('expense', ID2)).toMatchObject({ title: 'utilities', subtitle: 'expense · €30' });
    expect(byType('subscription', ID1)).toMatchObject({ title: 'Netflix', subtitle: '€15/monthly' });
    expect(byType('voucher', ID1)).toMatchObject({ title: 'Summer sale', subtitle: 'Skroutz' });
    expect(byType('giftcard', ID1)).toMatchObject({ title: 'IKEA card', subtitle: 'IKEA · €50' });
    // store='' → template leaves a leading space before the bullet, .trim() only strips
    // the OUTER whitespace, so the bullet itself survives as the first character
    expect(byType('giftcard', ID2).subtitle).toBe('· €20');
    expect(byType('loyaltycard', ID1)).toMatchObject({ title: 'AB card', subtitle: 'AB Vasilopoulos' });
    expect(byType('bill', ID1)).toMatchObject({ title: 'Electricity', subtitle: 'ΔΕΗ · €30' });
    expect(byType('goal', ID1)).toMatchObject({ title: 'Emergency fund', subtitle: '€1000 · 01/01/2027' });
    // no targetDate → no trailing " · " artifact (unlike the receipt's empty-date case)
    expect(byType('goal', ID2)).toMatchObject({ title: 'No-date goal', subtitle: '€500' });
    expect(byType('task', ID1)).toMatchObject({ title: 'Buy cables', subtitle: 'todo' });
  });

  it('a receipt with no date leaves a trailing " · " with nothing after it (template artifact, not fixed here)', async () => {
    receiptModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, store: 'X', total: undefined, date: null, deletedAt: new Date().toISOString() }]));
    const rows = await getTrash();
    expect(rows[0].subtitle).toBe('€0 · ');
  });

  it('sorts rows newest-deleted-first across mixed types', async () => {
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Older', category: '', deletedAt: '2026-07-01T00:00:00.000Z' }]));
    taskModel.findMock.mockReturnValueOnce(chainList([{ _id: ID2, title: 'Newest', status: 'todo', deletedAt: '2026-07-20T00:00:00.000Z' }]));
    voucherModel.findMock.mockReturnValueOnce(chainList([{ _id: ID3, title: 'Middle', store: '', deletedAt: '2026-07-10T00:00:00.000Z' }]));

    const rows = await getTrash();
    expect(rows.map((r) => r.title)).toEqual(['Newest', 'Middle', 'Older']);
  });

  it('silently auto-purges an entry older than the 30-day retention window: excluded from the returned rows, and its Model.deleteOne fires', async () => {
    const stale = new Date(Date.now() - 31 * 86400000).toISOString();
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Ancient', category: '', deletedAt: stale }]));
    itemModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, title: 'Ancient' })); // purgeTrashEntry's own re-fetch

    const rows = await getTrash();

    expect(rows).toHaveLength(0);
    expect(itemModel.deleteOneMock).toHaveBeenCalledWith({ _id: ID1 });
  });

  it('keeps an entry that is still within the 30-day window (not purged)', async () => {
    const fresh = new Date(Date.now() - 5 * 86400000).toISOString();
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Recent', category: '', deletedAt: fresh }]));

    const rows = await getTrash();

    expect(rows).toHaveLength(1);
    expect(itemModel.deleteOneMock).not.toHaveBeenCalled();
  });

  it('a stale entry routes through the FULL purgeTrashEntry, including its own assertCanWrite gate — if that gate ever rejects, the whole getTrash() call throws instead of just skipping the row', async () => {
    const stale = new Date(Date.now() - 40 * 86400000).toISOString();
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1, title: 'Ancient', category: '', deletedAt: stale }]));
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));

    await expect(getTrash()).rejects.toThrow('read-only');
  });
});

describe('restoreFromTrash', () => {
  it('is gated by assertCanWrite, not requireAdmin', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(restoreFromTrash('item', ID1)).rejects.toThrow('read-only');
    expect(requireAdminMock).not.toHaveBeenCalled();
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false} for an unknown trash type, without ever calling connectDB', async () => {
    const result = await restoreFromTrash('bogus' as TrashType, ID1);
    expect(result).toEqual({ ok: false });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('clears deletedAt via updateOne(...).setOptions({withDeleted:true}) and revalidates the whole app', async () => {
    const setOptionsMock = vi.fn(() => Promise.resolve({}));
    itemModel.updateOneMock.mockReturnValueOnce({ setOptions: setOptionsMock });

    const result = await restoreFromTrash('item', ID1);

    expect(result).toEqual({ ok: true });
    expect(itemModel.updateOneMock).toHaveBeenCalledWith({ _id: ID1 }, { $set: { deletedAt: null } });
    expect(setOptionsMock).toHaveBeenCalledWith({ withDeleted: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('routes to the right model for a different type too (confirms the TRASH_MODELS map wiring)', async () => {
    const setOptionsMock = vi.fn(() => Promise.resolve({}));
    subscriptionModel.updateOneMock.mockReturnValueOnce({ setOptions: setOptionsMock });

    await restoreFromTrash('subscription', ID2);

    expect(subscriptionModel.updateOneMock).toHaveBeenCalledWith({ _id: ID2 }, { $set: { deletedAt: null } });
    expect(itemModel.updateOneMock).not.toHaveBeenCalled();
  });
});

describe('purgeFromTrash', () => {
  it('requires admin (stricter than the plain assertCanWrite used by restoreFromTrash)', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(purgeFromTrash('item', ID1)).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('delegates to purgeTrashEntry, which re-gates with its OWN assertCanWrite call (double gate on the UI purge path)', async () => {
    const result = await purgeFromTrash('item', ID1);
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true }); // doc not found (default mock) → idempotent ok
  });
});

describe('purgeTrashEntry (core, no requireAdmin — callers must authorize first)', () => {
  it('is gated by assertCanWrite only', async () => {
    assertCanWriteMock.mockRejectedValueOnce(new Error('read-only'));
    await expect(purgeTrashEntry('item', ID1)).rejects.toThrow('read-only');
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('returns {ok:false} for an unknown type without ever calling connectDB (assertCanWrite still ran first)', async () => {
    const result = await purgeTrashEntry('bogus' as TrashType, ID1);
    expect(result).toEqual({ ok: false });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('is idempotent: returns {ok:true} WITHOUT deleting or revalidating when the doc no longer exists', async () => {
    itemModel.findByIdMock.mockReturnValueOnce(chainOne(null));
    const result = await purgeTrashEntry('item', ID1);
    expect(result).toEqual({ ok: true });
    expect(itemModel.deleteOneMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('receipt: deletes filePath+thumbPath (skips falsy ones) and pulls the id out of Item.receiptIds', async () => {
    receiptModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, filePath: 'receipts/2026/06/r1.pdf', thumbPath: '' }));

    const result = await purgeTrashEntry('receipt', ID1);

    expect(result).toEqual({ ok: true });
    expect(deleteFileMock).toHaveBeenCalledTimes(1);
    expect(deleteFileMock).toHaveBeenCalledWith('receipts/2026/06/r1.pdf');
    const [filter, update] = itemUpdateManyMock.mock.calls[0];
    expect(String((filter as { receiptIds: unknown }).receiptIds)).toBe(ID1);
    expect(String((update as { $pull: { receiptIds: unknown } }).$pull.receiptIds)).toBe(ID1);
    expect(receiptModel.deleteOneMock).toHaveBeenCalledWith({ _id: ID1 });
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });

  it('receipt: both filePath and thumbPath falsy → deleteFile never called', async () => {
    receiptModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, filePath: '', thumbPath: null }));
    await purgeTrashEntry('receipt', ID1);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('expense: deletes filePath+thumbPath too, but does NOT touch Item.receiptIds (that pull is receipt-only)', async () => {
    expenseModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, filePath: 'expenses/2026/06/e1.pdf', thumbPath: 'expenses/2026/06/e1_thumb.jpg' }));

    await purgeTrashEntry('expense', ID1);

    expect(deleteFileMock).toHaveBeenCalledTimes(2);
    expect(deleteFileMock).toHaveBeenCalledWith('expenses/2026/06/e1.pdf');
    expect(deleteFileMock).toHaveBeenCalledWith('expenses/2026/06/e1_thumb.jpg');
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it('item: deletes every photo + every attachment path, pulls itemIds from Receipt, nulls matched lineItems via arrayFilters, and pulls matchedItemIds from Statement.transactions', async () => {
    itemModel.findByIdMock.mockReturnValueOnce(
      chainOne({
        _id: ID1,
        photos: ['equipment/i1/photo0.jpg', 'equipment/i1/photo1.jpg'],
        attachments: [{ path: 'equipment/i1/manual.pdf', name: 'manual' }],
      })
    );

    await purgeTrashEntry('item', ID1);

    expect(deleteFileMock).toHaveBeenCalledTimes(3);
    expect(deleteFileMock).toHaveBeenCalledWith('equipment/i1/photo0.jpg');
    expect(deleteFileMock).toHaveBeenCalledWith('equipment/i1/photo1.jpg');
    expect(deleteFileMock).toHaveBeenCalledWith('equipment/i1/manual.pdf');

    expect(receiptUpdateManyMock).toHaveBeenCalledTimes(2);
    const [pullFilter, pullUpdate] = receiptUpdateManyMock.mock.calls[0];
    expect(String((pullFilter as { itemIds: unknown }).itemIds)).toBe(ID1);
    expect(String((pullUpdate as { $pull: { itemIds: unknown } }).$pull.itemIds)).toBe(ID1);

    const [lineFilter, lineUpdate, lineOpts] = receiptUpdateManyMock.mock.calls[1];
    expect(String((lineFilter as { 'lineItems.matchedItemId': unknown })['lineItems.matchedItemId'])).toBe(ID1);
    expect(lineUpdate).toEqual({ $set: { 'lineItems.$[el].matchedItemId': null } });
    const arrayFilters = (lineOpts as { arrayFilters: { 'el.matchedItemId': unknown }[] }).arrayFilters;
    expect(String(arrayFilters[0]['el.matchedItemId'])).toBe(ID1);

    const [stmtFilter, stmtUpdate] = statementUpdateManyMock.mock.calls[0];
    expect(String((stmtFilter as { 'transactions.matchedItemIds': unknown })['transactions.matchedItemIds'])).toBe(ID1);
    expect(String((stmtUpdate as { $pull: { 'transactions.$[].matchedItemIds': unknown } }).$pull['transactions.$[].matchedItemIds'])).toBe(ID1);
  });

  it('item: skips deleteFile entirely when photos/attachments are missing, but STILL clears the Receipt/Statement cross-references', async () => {
    itemModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1 }));
    await purgeTrashEntry('item', ID1);
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(receiptUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(statementUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it('a deleteFile rejection (missing file on disk) is swallowed, not fatal to the purge', async () => {
    itemModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, photos: ['equipment/i1/missing.jpg'] }));
    deleteFileMock.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await purgeTrashEntry('item', ID1);

    expect(result).toEqual({ ok: true });
    expect(itemModel.deleteOneMock).toHaveBeenCalledWith({ _id: ID1 });
  });

  it.each(['subscription', 'voucher', 'giftcard', 'loyaltycard', 'bill', 'goal', 'task'] as TrashType[])(
    '%s: no file deletion or cross-reference cleanup, just deleteOne',
    async (type) => {
      const modelsByType: Record<string, (typeof itemModel)> = {
        subscription: subscriptionModel,
        voucher: voucherModel,
        giftcard: giftcardModel,
        loyaltycard: loyaltycardModel,
        bill: billModel,
        goal: goalModel,
        task: taskModel,
      };
      const model = modelsByType[type];
      model.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1 }));

      await purgeTrashEntry(type, ID1);

      expect(deleteFileMock).not.toHaveBeenCalled();
      expect(itemUpdateManyMock).not.toHaveBeenCalled();
      expect(receiptUpdateManyMock).not.toHaveBeenCalled();
      expect(statementUpdateManyMock).not.toHaveBeenCalled();
      expect(model.deleteOneMock).toHaveBeenCalledWith({ _id: ID1 });
    }
  );

  it('always deletes via deleteOne(...).setOptions({withDeleted:true}) and revalidates the whole app', async () => {
    const setOptionsMock = vi.fn(() => Promise.resolve({}));
    taskModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1, title: 'X' }));
    taskModel.deleteOneMock.mockReturnValueOnce({ setOptions: setOptionsMock });

    await purgeTrashEntry('task', ID1);

    expect(setOptionsMock).toHaveBeenCalledWith({ withDeleted: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
  });
});

describe('emptyTrash', () => {
  it('requires admin', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(emptyTrash()).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('projects only _id via select("_id") (unlike getTrash, which needs the full doc for the label)', async () => {
    const spyChain = chainList([]);
    itemModel.findMock.mockReturnValueOnce(spyChain);
    await emptyTrash();
    expect(spyChain.select).toHaveBeenCalledWith('_id');
  });

  it('purges every trashed doc across all 10 TRASH_MODELS types and returns the total count — including a doc that vanishes before purgeTrashEntry re-fetches it (counted anyway, a real overcount wart)', async () => {
    itemModel.findMock.mockReturnValueOnce(chainList([{ _id: ID1 }]));
    taskModel.findMock.mockReturnValueOnce(chainList([{ _id: ID2 }, { _id: ID3 }]));
    itemModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID1 }));
    taskModel.findByIdMock.mockReturnValueOnce(chainOne({ _id: ID2 })).mockReturnValueOnce(chainOne(null));

    const result = await emptyTrash();

    expect(result).toEqual({ ok: true, purged: 3 });
    expect(itemModel.deleteOneMock).toHaveBeenCalledWith({ _id: ID1 });
    expect(taskModel.deleteOneMock).toHaveBeenCalledTimes(1); // only ID2; ID3's re-fetch found nothing
    expect(taskModel.deleteOneMock).toHaveBeenCalledWith({ _id: ID2 });
  });

  it('returns {ok:true, purged:0} when nothing is trashed', async () => {
    const result = await emptyTrash();
    expect(result).toEqual({ ok: true, purged: 0 });
  });
});
