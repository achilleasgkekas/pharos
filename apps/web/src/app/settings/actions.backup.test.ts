import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

// app/settings/actions.ts is the largest module in the repo (1810 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers the backup/export concern:
// exportData / exportCSV / exportInsuranceBundle / exportTaxBundle / importData
// (lines ~1243-1649). toCSV/isoDay/safeZipName/isSafeStoredPath are private helpers,
// exercised indirectly through the public functions.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve.
//
// UNLIKE every previous slice, 'jszip' is NOT stubbed here — it is the real library.
// exportInsuranceBundle/exportTaxBundle build an actual ZIP, and the only way to pin
// what ends up inside it (file paths, which photos survived a missing-file error,
// sanitized attachment names) is to round-trip the real base64 output through
// JSZip.loadAsync in the assertions below. buildInsuranceCsv/buildInsuranceHtml/
// buildTaxCsv/buildTaxHtml stay mocked (vi.fn()) — they are pure builders with their
// own dedicated tests (lib/insuranceExport.test.ts, lib/taxExport.test.ts); this file
// only pins that the RIGHT rows reach them.
//
// Behaviour pinned:
//  - exportData / exportInsuranceBundle / exportTaxBundle / importData: all gated by
//    requireAdmin.
//  - exportCSV: NOT gated by requireAdmin or assertCanWrite at all (documented as
//    intentional-looking — it mirrors the same receipts/expenses/items data a
//    logged-in non-admin can already read elsewhere in the app — but pinned here as
//    a "known gap" test in case that assumption turns out wrong later).
//  - exportData walks BACKUP_MODELS (the single source of truth for what a JSON
//    backup carries) and does `Model.find().lean()` per key, with NO select/sort —
//    the full document.
//  - exportCSV's CSV builder (toCSV): quotes a field containing a comma/quote/
//    newline (doubling embedded quotes), and separately prefixes a leading
//    =/+/-/@/tab/CR with a bare apostrophe (CSV-injection guard) BEFORE the
//    quote-need check runs on the now-prefixed string.
//  - exportInsuranceBundle: only 'received'/'installed' items count as owned; a
//    missing photo/attachment/receipt file on disk is skipped (readFile throwing)
//    rather than failing the whole export; only items.receiptIds > 0 total trigers
//    a Receipt.find at all; totalValue only sums entries with value > 0.
//  - exportTaxBundle: fetches getAppSettings() but NEVER reads the result (dead
//    weight — pinned as a documented wart, not fixed here, out of test-file
//    territory) — the year range is UTC [Jan 1, next Jan 1); a non-finite `year`
//    arg falls back to the current calendar year; totalValue sums amount with NO
//    positivity filter (unlike insurance), so a negative/refund row still counts.
//  - importData: requireAdmin runs even before the JSON.parse attempt; invalid
//    JSON or a payload without a `collections` object short-circuits BEFORE
//    connectDB is ever called; per BACKUP_MODELS key, a missing/non-array
//    collection is skipped; per doc, _id/__v/createdAt/updatedAt are stripped,
//    filePath/thumbConfig kept only when isSafeStoredPath (no absolute path, no
//    '..' segment, no NUL byte), photos/attachments filtered the same way; a doc
//    WITH an _id upserts via updateOne(...).setOptions({withDeleted:true}), a doc
//    WITHOUT one calls Model.create; a doc that throws is skipped (not counted,
//    not fatal to the rest of the restore).
//  - verifyBackup (P74): admin-gated, and READ-ONLY — it must never reach connectDB,
//    since the whole point is that checking a backup is free of consequence.
//  - importData pre-flight (P74): refuses a file with nothing restorable in it rather
//    than reporting a successful empty restore, and returns `warnings` naming whatever
//    it skipped (previously silent). The verdict rules themselves live in
//    lib/backupVerify.test.ts; this file pins how importData ACTS on them.
//  - exportDataEncrypted / importDataEncrypted (P54, issue #4): the cipher itself has its
//    own tests (lib/backupCrypto.test.ts), so backupCrypto is deliberately NOT mocked here.
//    What these pin is the WIRING: an encrypted export restores the same documents, and a
//    wrong passphrase, a tampered file or a plaintext backup all fail with a clear error
//    BEFORE connectDB, so a failed decrypt can never write half a restore.

const {
  connectDBMock,
  requireAdminMock,
  getAppSettingsMock,
  revalidatePathMock,
  invalidateStoreCacheMock,
  readFileMock,
  itemFindMock,
  itemUpdateOneMock,
  itemCreateMock,
  receiptFindMock,
  receiptUpdateOneMock,
  receiptCreateMock,
  expenseFindMock,
  estimatedItemValueMock,
  buildInsuranceCsvMock,
  buildInsuranceHtmlMock,
  buildTaxCsvMock,
  buildTaxHtmlMock,
} = vi.hoisted(() => {
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
    requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
    getAppSettingsMock: vi.fn(async () => ({ depreciation: { enabled: true, floorPct: 10, defaultRate: 15, rates: {} } })),
    revalidatePathMock: vi.fn(),
    invalidateStoreCacheMock: vi.fn(),
    readFileMock: vi.fn(async (_p: string) => Buffer.from('file-bytes')),
    itemFindMock: vi.fn((_filter?: Record<string, unknown>) => chain([])),
    itemUpdateOneMock: vi.fn((_f: unknown, _u: unknown, _o: unknown) => ({ setOptions: vi.fn(() => Promise.resolve({})) })),
    itemCreateMock: vi.fn(async (_doc: unknown) => ({})),
    receiptFindMock: vi.fn((_filter?: Record<string, unknown>) => chain([])),
    receiptUpdateOneMock: vi.fn((_f: unknown, _u: unknown, _o: unknown) => ({ setOptions: vi.fn(() => Promise.resolve({})) })),
    receiptCreateMock: vi.fn(async (_doc: unknown) => ({})),
    expenseFindMock: vi.fn((_filter?: Record<string, unknown>) => chain([])),
    estimatedItemValueMock: vi.fn((_item: Record<string, unknown>, _dep: Record<string, unknown>) => 0),
    buildInsuranceCsvMock: vi.fn((_items: Record<string, unknown>[]) => 'insurance-csv'),
    buildInsuranceHtmlMock: vi.fn((_items: Record<string, unknown>[], _opts: Record<string, unknown>) => '<html>insurance</html>'),
    buildTaxCsvMock: vi.fn((_rows: Record<string, unknown>[]) => 'tax-csv'),
    buildTaxHtmlMock: vi.fn((_rows: Record<string, unknown>[], _opts: Record<string, unknown>) => '<html>tax</html>'),
  };
});

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: { updateOne: vi.fn(async () => ({})), findOne: () => ({ select: () => ({ lean: async () => null }) }) },
}));
vi.mock('@/models/Store', () => ({ Store: {} }));
vi.mock('@/models/Receipt', () => ({
  Receipt: { find: receiptFindMock, updateOne: receiptUpdateOneMock, create: receiptCreateMock },
}));
vi.mock('@/models/Item', () => ({
  Item: { find: itemFindMock, updateOne: itemUpdateOneMock, create: itemCreateMock },
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
vi.mock('@/lib/storage', () => ({ readFile: readFileMock, deleteFile: vi.fn() }));
vi.mock('@/lib/imapConfig', () => ({ getImapConfig: vi.fn(), invalidateImapConfig: vi.fn() }));
vi.mock('@/lib/imapImport', () => ({ testImapConnection: vi.fn(), fetchNewEmails: vi.fn() }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt: vi.fn() }));
vi.mock('@/lib/storeService', () => ({ getStores: vi.fn(async () => []), invalidateStoreCache: invalidateStoreCacheMock }));
vi.mock('@/lib/returnWindow', () => ({ effectiveReturnWindow: vi.fn(), returnDaysLeft: vi.fn() }));
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: vi.fn() }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: vi.fn() }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: vi.fn() }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock, invalidateAppSettings: vi.fn() , invalidateAppSettingsForRequest: vi.fn(async () => {})}));
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
// The one mock that matters most here: two BACKUP_MODELS entries (enough to prove the
// Object.entries(...) loop and per-key wiring), pointing at the SAME mocked Item/Receipt
// model objects used above — mirrors the real lib/backupModels.ts (`items: Item`, etc).
vi.mock('@/lib/backupModels', () => ({
  BACKUP_MODELS: {
    items: { find: itemFindMock, updateOne: itemUpdateOneMock, create: itemCreateMock },
    receipts: { find: receiptFindMock, updateOne: receiptUpdateOneMock, create: receiptCreateMock },
  },
  // Same two keys as a plain list: importData's pre-flight and the verifyBackup action
  // take the key registry rather than the models (lib/backupVerify.ts is model-free).
  BACKUP_KEYS: ['items', 'receipts'],
}));
// NOT mocked: lib/backupVerify is a pure function with its own dedicated tests
// (lib/backupVerify.test.ts). Stubbing it here would hide the thing these tests exist
// to pin — that importData now REFUSES an unusable file before touching the database.
vi.mock('@/lib/notifiers', () => ({ dispatchAlert: vi.fn(), getNotifiers: vi.fn(), testNotifier: vi.fn() }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: vi.fn() }));
vi.mock('@/app/notifications/actions', () => ({ generateNotifications: vi.fn() }));
vi.mock('@/lib/budgetAlert', () => ({ detectBudgetExceeded: vi.fn() }));
vi.mock('@/lib/depreciation', () => ({ estimatedItemValue: estimatedItemValueMock }));
vi.mock('@/lib/insuranceExport', () => ({ buildInsuranceCsv: buildInsuranceCsvMock, buildInsuranceHtml: buildInsuranceHtmlMock }));
vi.mock('@/lib/taxExport', () => ({ buildTaxCsv: buildTaxCsvMock, buildTaxHtml: buildTaxHtmlMock }));
// jszip is deliberately NOT mocked — see file header.
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

import {
  exportData,
  exportDataEncrypted,
  exportCSV,
  exportInsuranceBundle,
  exportTaxBundle,
  importData,
  importDataEncrypted,
  verifyBackup,
} from './actions';

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
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  getAppSettingsMock.mockImplementation(async () => ({ depreciation: { enabled: true, floorPct: 10, defaultRate: 15, rates: {} } }));
  revalidatePathMock.mockImplementation(() => undefined);
  invalidateStoreCacheMock.mockImplementation(() => undefined);
  readFileMock.mockImplementation(async () => Buffer.from('file-bytes'));
  itemFindMock.mockImplementation(() => chainData([]));
  itemUpdateOneMock.mockImplementation(() => ({ setOptions: vi.fn(() => Promise.resolve({})) }));
  itemCreateMock.mockImplementation(async () => ({}));
  receiptFindMock.mockImplementation(() => chainData([]));
  receiptUpdateOneMock.mockImplementation(() => ({ setOptions: vi.fn(() => Promise.resolve({})) }));
  receiptCreateMock.mockImplementation(async () => ({}));
  expenseFindMock.mockImplementation(() => chainData([]));
  estimatedItemValueMock.mockImplementation(() => 0);
  buildInsuranceCsvMock.mockImplementation(() => 'insurance-csv');
  buildInsuranceHtmlMock.mockImplementation(() => '<html>insurance</html>');
  buildTaxCsvMock.mockImplementation(() => 'tax-csv');
  buildTaxHtmlMock.mockImplementation(() => '<html>tax</html>');
});

describe('exportData', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(exportData()).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reads every BACKUP_MODELS key with a plain find().lean() (no select/sort) and wraps them in an envelope', async () => {
    itemFindMock.mockReturnValueOnce(chainData([{ _id: 'i1', title: 'Mouse' }]));
    receiptFindMock.mockReturnValueOnce(chainData([{ _id: 'r1', store: 'Skroutz' }]));

    const json = await exportData();
    const parsed = JSON.parse(json);

    expect(parsed.app).toBe('homepage');
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
    expect(parsed.collections).toEqual({
      items: [{ _id: 'i1', title: 'Mouse' }],
      receipts: [{ _id: 'r1', store: 'Skroutz' }],
    });
  });

  it('produces an empty array for a collection with zero documents', async () => {
    const json = await exportData();
    expect(JSON.parse(json).collections).toEqual({ items: [], receipts: [] });
  });
});

describe('exportCSV', () => {
  it('is NOT gated by requireAdmin or assertCanWrite at all (known gap, documented not fixed here)', async () => {
    await exportCSV('items');
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('receipts: builds the header + one row per receipt, defaulting missing numeric fields to 0', async () => {
    receiptFindMock.mockReturnValueOnce(
      chainData([{ store: 'Skroutz', date: '2026-06-15T10:00:00.000Z', total: 129.9, paymentMethod: 'card', verified: true }])
    );
    const csv = await exportCSV('receipts');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Store,Date,Total,Net,VAT,Payment,Verified');
    expect(lines[1]).toBe('Skroutz,2026-06-15,129.9,0,0,card,yes');
  });

  it('expenses: maps kind/vendor/category/amount/date/period/recurring/verified', async () => {
    expenseFindMock.mockReturnValueOnce(
      chainData([{ kind: 'expense', vendor: 'DEI', category: 'utilities', amount: 62, date: '2026-06-04', period: '2026-06', recurring: true, verified: false }])
    );
    const csv = await exportCSV('expenses');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Kind,Vendor,Category,Amount,Date,Period,Recurring,Verified');
    expect(lines[1]).toBe('expense,DEI,utilities,62,2026-06-04,2026-06,yes,no');
  });

  it('items: leaves "Paid" blank when purchasedPrice is null/undefined, numeric otherwise', async () => {
    itemFindMock.mockReturnValueOnce(
      chainData([
        { title: 'Switch', category: 'network', status: 'received', currentPrice: 475, purchasedPrice: null, purchasedFrom: 'EU Store', serialNumber: 'SN1', location: 'rack', warrantyUntil: '2028-01-01' },
        { title: 'AP', category: 'network', status: 'installed', currentPrice: 330, purchasedPrice: 330, purchasedFrom: 'xpatit', serialNumber: '', location: '', warrantyUntil: null },
      ])
    );
    const csv = await exportCSV('items');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Title,Category,Status,Current price,Paid,Bought from,Serial,Location,Warranty until');
    expect(lines[1]).toBe('Switch,network,received,475,,EU Store,SN1,rack,2028-01-01');
    expect(lines[2]).toBe('AP,network,installed,330,330,xpatit,,,');
  });

  it('quotes a field containing a comma and doubles embedded quotes', async () => {
    receiptFindMock.mockReturnValueOnce(chainData([{ store: 'Plaisio, Downtown "Store"', date: null, total: 10, paymentMethod: '', verified: false }]));
    const csv = await exportCSV('receipts');
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine.startsWith('"Plaisio, Downtown ""Store"""')).toBe(true);
  });

  it('CSV-injection guard: a leading =/+/-/@ gets prefixed with a bare apostrophe (no surrounding quotes needed)', async () => {
    receiptFindMock.mockReturnValueOnce(chainData([{ store: '=SUM(A1:A9)', date: null, total: 0, paymentMethod: '', verified: false }]));
    const csv = await exportCSV('receipts');
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine.startsWith("'=SUM(A1:A9),")).toBe(true);
  });

  it('an empty date renders as an empty string, not "Invalid Date"', async () => {
    receiptFindMock.mockReturnValueOnce(chainData([{ store: 'X', date: null, total: 0, paymentMethod: '', verified: false }]));
    const csv = await exportCSV('receipts');
    expect(csv.split('\r\n')[1]).toBe('X,,0,0,0,,no');
  });
});

describe('exportInsuranceBundle', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(exportInsuranceBundle()).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('queries only received/installed items, sorted by title, and skips Receipt.find entirely when nothing references a receipt', async () => {
    await exportInsuranceBundle();
    expect(itemFindMock).toHaveBeenCalledWith({ status: { $in: ['received', 'installed'] } });
    expect(receiptFindMock).not.toHaveBeenCalled();
  });

  it('returns a valid empty ZIP with itemCount 0 / totalValue 0 when there are no owned items', async () => {
    const result = await exportInsuranceBundle();
    expect(result.itemCount).toBe(0);
    expect(result.totalValue).toBe(0);
    const zip = await JSZip.loadAsync(result.base64, { base64: true });
    expect(await zip.file('insurance-manifest.csv')!.async('string')).toBe('﻿insurance-csv');
    expect(await zip.file('insurance-manifest.html')!.async('string')).toBe('<html>insurance</html>');
  });

  it('sums only positive estimatedItemValue results, skips a missing photo/attachment file, and sanitizes an attachment display name into a safe zip entry name', async () => {
    itemFindMock.mockReturnValueOnce(
      chainData([
        {
          _id: 'i1',
          title: 'RTX 5080',
          category: 'compute',
          serialNumber: 'SN-1',
          location: 'Battle Station',
          purchasedAt: '2026-04-01T00:00:00.000Z',
          purchasedFrom: 'TechLamb',
          warrantyUntil: '2028-04-01T00:00:00.000Z',
          currentPrice: 1000,
          purchasedPrice: 1443.72,
          photos: ['equipment/i1/photo0.jpg', 'equipment/i1/missing.jpg'],
          attachments: [{ path: 'equipment/i1/manual.pdf', name: '../../etc/passwd' }],
          receiptIds: [],
        },
        {
          _id: 'i2',
          title: 'Free sample',
          category: 'other',
          serialNumber: '',
          location: '',
          purchasedAt: null,
          purchasedFrom: '',
          warrantyUntil: null,
          currentPrice: 0,
          purchasedPrice: 0,
          photos: [],
          attachments: [],
          receiptIds: [],
        },
      ])
    );
    estimatedItemValueMock.mockImplementationOnce(() => 900).mockImplementationOnce(() => -5);
    readFileMock.mockImplementationOnce(async () => Buffer.from('photo-bytes')).mockRejectedValueOnce(new Error('ENOENT')).mockImplementationOnce(async () => Buffer.from('manual-bytes'));

    const result = await exportInsuranceBundle();

    expect(result.itemCount).toBe(2);
    expect(result.totalValue).toBe(900); // -5 from item 2 is NOT subtracted, only value>0 is summed

    const zip = await JSZip.loadAsync(result.base64, { base64: true });
    expect(await zip.file('files/i1/photo_0.jpg')!.async('string')).toBe('photo-bytes');
    expect(zip.file('files/i1/photo_1.jpg')).toBeNull(); // the throwing readFile call was skipped, not fataled
    // safeZipName(att.name || att.path, fallback) uses the DISPLAY name first, then takes
    // only its last path segment and strips anything but [a-zA-Z0-9._-] — so a malicious
    // "../../etc/passwd" display name collapses to the harmless basename "passwd", never
    // escaping the files/<id>/ folder.
    expect(await zip.file('files/i1/passwd')!.async('string')).toBe('manual-bytes');
    expect(zip.file('files/i1/manual.pdf')).toBeNull();

    const passedItems = buildInsuranceCsvMock.mock.calls[0][0];
    expect(passedItems[0].photoFiles).toEqual(['photo_0.jpg']);
    expect(passedItems[0].attachmentFiles).toEqual([{ file: 'passwd', name: '../../etc/passwd' }]);
    expect(passedItems[0].value).toBe(900);
    expect(passedItems[1].value).toBe(-5);
  });

  it('dedupes ids for the Receipt.find query, but still walks the ORIGINAL (non-deduped) receiptIds list per item, skipping an id with no matching receipt', async () => {
    itemFindMock.mockReturnValueOnce(
      chainData([
        { _id: 'i1', title: 'A', category: 'other', serialNumber: '', location: '', purchasedAt: null, purchasedFrom: '', warrantyUntil: null, currentPrice: 0, purchasedPrice: 0, photos: [], attachments: [], receiptIds: ['r1', 'r1', 'r-missing'] },
      ])
    );
    receiptFindMock.mockReturnValueOnce(chainData([{ _id: 'r1', store: 'Skroutz', date: '2026-01-05T00:00:00.000Z', filePath: 'receipts/r1.pdf' }]));

    await exportInsuranceBundle();

    // The lookup query is deduped ($in gets each id once)...
    expect(receiptFindMock).toHaveBeenCalledWith({ _id: { $in: ['r1', 'r-missing'] } });
    // ...but the per-item receiptFiles loop re-walks the raw (non-deduped) array, so the
    // repeated 'r1' produces TWO zip entries (receipt_0.pdf, receipt_1.pdf) — a genuine
    // dupe-file wart in the export, not a bug fixed here, just pinned as current behaviour.
    const passedItems = buildInsuranceCsvMock.mock.calls[0][0];
    expect(passedItems[0].receiptFiles).toEqual([
      { file: 'receipt_0.pdf', store: 'Skroutz', date: '2026-01-05T00:00:00.000Z' },
      { file: 'receipt_1.pdf', store: 'Skroutz', date: '2026-01-05T00:00:00.000Z' },
    ]);
  });

  it('rounds totalValue to 2 decimal places', async () => {
    itemFindMock.mockReturnValueOnce(
      chainData([
        { _id: 'i1', title: 'A', category: 'other', serialNumber: '', location: '', purchasedAt: null, purchasedFrom: '', warrantyUntil: null, currentPrice: 0, purchasedPrice: 0, photos: [], attachments: [], receiptIds: [] },
        { _id: 'i2', title: 'B', category: 'other', serialNumber: '', location: '', purchasedAt: null, purchasedFrom: '', warrantyUntil: null, currentPrice: 0, purchasedPrice: 0, photos: [], attachments: [], receiptIds: [] },
      ])
    );
    estimatedItemValueMock.mockImplementationOnce(() => 10.005).mockImplementationOnce(() => 0.001);
    const result = await exportInsuranceBundle();
    expect(result.totalValue).toBe(10.01);
  });
});

describe('exportTaxBundle', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(exportTaxBundle(2026)).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('queries expense-kind + taxDeductible rows within the UTC calendar-year range, sorted ascending, and fetches (but never reads) getAppSettings', async () => {
    await exportTaxBundle(2026);
    expect(getAppSettingsMock).toHaveBeenCalled();
    expect(expenseFindMock).toHaveBeenCalledWith({
      kind: 'expense',
      taxDeductible: true,
      date: { $gte: new Date(Date.UTC(2026, 0, 1)), $lt: new Date(Date.UTC(2027, 0, 1)) },
    });
  });

  it('falls back to the current calendar year for a non-finite year argument', async () => {
    await exportTaxBundle(Number.NaN);
    const filter = expenseFindMock.mock.calls[0][0] as { date: { $gte: Date; $lt: Date } };
    expect(filter.date.$gte.getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });

  it('sums amount with NO positivity filter (a negative/refund row still counts)', async () => {
    expenseFindMock.mockReturnValueOnce(
      chainData([
        { _id: 'e1', vendor: 'DEI', category: 'utilities', taxCategory: 'utilities', amount: 100, date: '2026-03-01', notes: '', filePath: '' },
        { _id: 'e2', vendor: 'DEI', category: 'utilities', taxCategory: 'utilities', amount: -20, date: '2026-04-01', notes: 'refund', filePath: '' },
      ])
    );
    const result = await exportTaxBundle(2026);
    expect(result.itemCount).toBe(2);
    expect(result.totalValue).toBe(80);
  });

  it('reads the filePath into the zip and names it bill_<idx>.<ext>, leaving fileName blank when filePath is empty or unreadable', async () => {
    expenseFindMock.mockReturnValueOnce(
      chainData([
        { _id: 'e1', vendor: 'DEI', category: 'utilities', taxCategory: '', amount: 62, date: '2026-06-04', notes: '', filePath: 'expenses/2026/06/dei.pdf' },
        { _id: 'e2', vendor: 'OTE', category: 'utilities', taxCategory: '', amount: 30, date: '2026-06-05', notes: '', filePath: '' },
        { _id: 'e3', vendor: 'Cosmote', category: 'utilities', taxCategory: '', amount: 20, date: '2026-06-06', notes: '', filePath: 'expenses/2026/06/missing.pdf' },
      ])
    );
    readFileMock.mockImplementationOnce(async () => Buffer.from('bill-bytes')).mockRejectedValueOnce(new Error('ENOENT'));

    const result = await exportTaxBundle(2026);
    const zip = await JSZip.loadAsync(result.base64, { base64: true });
    expect(await zip.file('files/e1/bill_0.pdf')!.async('string')).toBe('bill-bytes');
    expect(zip.file('files/e2')).toBeNull();
    expect(zip.file('files/e3/bill_2.pdf')).toBeNull(); // read threw, skipped, not fatal

    const passedRows = buildTaxCsvMock.mock.calls[0][0];
    expect(passedRows.map((r) => r.fileName)).toEqual(['bill_0.pdf', '', '']);
    expect(passedRows[1].category).toBe('utilities');
  });

  it('defaults a missing category to "other" in the row passed to the builders', async () => {
    expenseFindMock.mockReturnValueOnce(chainData([{ _id: 'e1', vendor: 'X', category: '', taxCategory: '', amount: 5, date: '2026-01-01', notes: '', filePath: '' }]));
    await exportTaxBundle(2026);
    expect(buildTaxCsvMock.mock.calls[0][0][0].category).toBe('other');
  });
});

describe('verifyBackup', () => {
  it('is admin-gated', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(verifyBackup('{}')).rejects.toThrow('not admin');
  });

  it('never touches the database — checking a backup must be free of consequence', async () => {
    await verifyBackup(JSON.stringify({ collections: { items: [{ _id: 'i1' }] } }));
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemFindMock).not.toHaveBeenCalled();
    expect(itemUpdateOneMock).not.toHaveBeenCalled();
    expect(itemCreateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns the verdict plus a human-readable summary of what the file holds', async () => {
    const r = await verifyBackup(
      JSON.stringify({
        app: 'homepage',
        version: 1,
        exportedAt: '2026-08-04T03:30:00.000Z',
        collections: { items: [{ _id: 'i1' }, { _id: 'i2' }], receipts: [{ _id: 'r1' }] },
      })
    );
    expect(r.ok).toBe(true);
    expect(r.summary).toBe('2 items, 1 receipts');
    expect(r.exportedAt).toBe('2026-08-04T03:30:00.000Z');
    expect(r.totalDocs).toBe(3);
  });

  it('reports a corrupted file as not ok, with the reason', async () => {
    const r = await verifyBackup('{"collections":{"items":[');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.level === 'error' && /not valid json/i.test(i.message))).toBe(true);
  });
});

describe('importData', () => {
  it('requires admin even before attempting to parse the JSON', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(importData('not json')).rejects.toThrow('not admin');
  });

  // ── Pre-flight (P74) ──────────────────────────────────────────────────────
  // importData now runs verifyBackupJson BEFORE connectDB. The three "rejects"
  // cases below all used to reach a bare `return {ok:false}` (or, for the empty
  // one, a cheerful `{ok:true, restored:0}`); the value of the change is that the
  // message now says WHICH way the file is broken. The exact strings come from
  // lib/backupVerify.ts and are pinned there — matched loosely here on purpose so
  // rewording the message does not fail two suites at once.

  it('rejects invalid JSON without ever calling connectDB, saying the file is truncated/corrupted', async () => {
    const result = await importData('{not valid json');
    expect(result.ok).toBe(false);
    expect(result.restored).toBe(0);
    expect(result.error).toMatch(/not valid json/i);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('rejects a payload without a collections object, without ever calling connectDB', async () => {
    const result = await importData(JSON.stringify({ app: 'homepage' }));
    expect(result.ok).toBe(false);
    expect(result.restored).toBe(0);
    expect(result.error).toMatch(/no "collections" section/i);
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('REFUSES a payload with nothing restorable in it instead of reporting a successful empty restore', async () => {
    // Behaviour change, deliberate: `{items: 'not-an-array'}` (and an array holding
    // only junk) previously returned {ok:true, restored:0}, which reads as "restore
    // succeeded" — the exact silent failure P74 exists to end. Nothing was written
    // then and nothing is written now; only the verdict changed.
    for (const collections of [{ items: 'not-an-array' }, { items: ['just a string', null, 42] }]) {
      const result = await importData(JSON.stringify({ collections }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/no documents at all/i);
    }
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemUpdateOneMock).not.toHaveBeenCalled();
    expect(itemCreateMock).not.toHaveBeenCalled();
  });

  it('still restores the good part of a file whose other collection is unusable, and REPORTS the skip', async () => {
    // Warnings must never block: 1 good collection out of 2 is worth restoring at the
    // moment a user actually needs it. What must not happen is the skip being silent.
    const result = await importData(JSON.stringify({ collections: { items: [{ title: 'Mouse' }], receipts: 'not-an-array' } }));
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(1);
    expect(result.warnings?.join(' ')).toMatch(/receipts: not a list/i);
    expect(receiptCreateMock).not.toHaveBeenCalled();
  });

  it('upserts a doc WITH an _id via updateOne(...).setOptions({withDeleted:true}), stripping __v/createdAt/updatedAt', async () => {
    const setOptionsMock = vi.fn(() => Promise.resolve({}));
    itemUpdateOneMock.mockReturnValueOnce({ setOptions: setOptionsMock });
    const result = await importData(JSON.stringify({ collections: { items: [{ _id: 'i1', __v: 3, createdAt: 'x', updatedAt: 'y', title: 'Mouse' }] } }));

    expect(result.ok).toBe(true);
    expect(result.restored).toBe(1);
    // The `$unset` rides along because this backup document carries no `deletedAt`: an export only
    // ever contains live documents, so a restore must pull the copy here back out of the Trash.
    expect(itemUpdateOneMock).toHaveBeenCalledWith(
      { _id: 'i1' },
      { $set: { title: 'Mouse' }, $unset: { deletedAt: '' } },
      { upsert: true }
    );
    expect(setOptionsMock).toHaveBeenCalledWith({ withDeleted: true });
    expect(itemCreateMock).not.toHaveBeenCalled();
    // The payload carries no `receipts` key, so the restore correctly warns that the
    // collection will not be touched (an older backup predating a model looks like this).
    expect(result.warnings?.join(' ')).toMatch(/missing collection.*receipts/i);
  });

  it('creates a doc WITHOUT an _id via Model.create, warning that it will not merge', async () => {
    const result = await importData(JSON.stringify({ collections: { items: [{ title: 'New item' }] } }));
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(1);
    expect(itemCreateMock).toHaveBeenCalledWith({ title: 'New item' });
    expect(itemUpdateOneMock).not.toHaveBeenCalled();
    expect(result.warnings?.join(' ')).toMatch(/items: 1 document without an _id/i);
  });

  it('skips (does not count, does not throw) a doc that fails to save', async () => {
    itemCreateMock.mockRejectedValueOnce(new Error('validation failed'));
    const result = await importData(JSON.stringify({ collections: { items: [{ title: 'Bad' }, { title: 'Good' }] } }));
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(1);
  });

  it('strips an unsafe filePath/thumbPath (absolute or traversal) before saving, keeps a safe one', async () => {
    await importData(
      JSON.stringify({
        collections: {
          items: [
            { title: 'A', filePath: '../../etc/passwd', thumbPath: '/etc/shadow' },
            { title: 'B', filePath: 'receipts/2026/06/ok.pdf', thumbPath: 'receipts/2026/06/ok_thumb.jpg' },
          ],
        },
      })
    );
    expect(itemCreateMock.mock.calls[0][0]).toEqual({ title: 'A' });
    expect(itemCreateMock.mock.calls[1][0]).toEqual({ title: 'B', filePath: 'receipts/2026/06/ok.pdf', thumbPath: 'receipts/2026/06/ok_thumb.jpg' });
  });

  it('filters photos to only safe paths and drops an attachment whose path is unsafe', async () => {
    await importData(
      JSON.stringify({
        collections: {
          items: [
            {
              title: 'A',
              photos: ['equipment/ok.jpg', '../escape.jpg', '/absolute.jpg'],
              attachments: [{ path: 'equipment/manual.pdf', name: 'manual' }, { path: '../../evil.pdf', name: 'evil' }],
            },
          ],
        },
      })
    );
    expect(itemCreateMock.mock.calls[0][0]).toEqual({
      title: 'A',
      photos: ['equipment/ok.jpg'],
      attachments: [{ path: 'equipment/manual.pdf', name: 'manual' }],
    });
  });

  it('restores across multiple BACKUP_MODELS keys and invalidates the store cache + revalidates settings and home', async () => {
    const result = await importData(
      JSON.stringify({
        collections: {
          items: [{ title: 'Mouse' }],
          receipts: [{ store: 'Skroutz' }],
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(2);
    // Both docs are _id-less (that is what routes them through Model.create above), so
    // the restore correctly warns that they were inserted as new rather than merged.
    expect(result.warnings?.join(' ')).toMatch(/items: 1 document without an _id/i);
    expect(result.warnings?.join(' ')).toMatch(/receipts: 1 document without an _id/i);
    expect(receiptCreateMock).toHaveBeenCalledWith({ store: 'Skroutz' });
    expect(invalidateStoreCacheMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

describe('exportDataEncrypted / importDataEncrypted (P54)', () => {
  const PASS = 'correct horse battery';
  const itemDoc = { _id: 'i1', title: 'Mouse', filePath: 'items/i1.jpg' };
  const receiptDoc = { _id: 'r1', store: 'Skroutz', total: 12.5 };

  // A real encrypted export of two documents, produced through the action itself, so the
  // round-trip below proves export and import agree on the format end to end.
  async function encryptedBackup(passphrase = PASS) {
    itemFindMock.mockReturnValueOnce(chainData([itemDoc]));
    receiptFindMock.mockReturnValueOnce(chainData([receiptDoc]));
    const envelope = await exportDataEncrypted(passphrase);
    vi.clearAllMocks(); // the export's own connectDB call must not satisfy the import assertions
    return envelope;
  }

  function expectNothingWritten() {
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemUpdateOneMock).not.toHaveBeenCalled();
    expect(itemCreateMock).not.toHaveBeenCalled();
    expect(receiptUpdateOneMock).not.toHaveBeenCalled();
    expect(receiptCreateMock).not.toHaveBeenCalled();
  }

  it('the export is an envelope, not the plaintext backup', async () => {
    const envelope = await encryptedBackup();
    const parsed = JSON.parse(envelope);
    expect(parsed.app).toBe('pharos-enc');
    expect(parsed.collections).toBeUndefined();
    // Financial data must not survive in the file in readable form.
    expect(envelope).not.toContain('Skroutz');
    expect(envelope).not.toContain('Mouse');
  });

  it('export refuses a passphrase under 8 characters instead of writing a weakly keyed file', async () => {
    await expect(exportDataEncrypted('short')).rejects.toThrow(/at least 8 characters/);
  });

  it('export is admin-gated (it wraps exportData)', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(exportDataEncrypted(PASS)).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('round-trip: an encrypted export restores the same documents in every collection', async () => {
    const envelope = await encryptedBackup();

    const result = await importDataEncrypted(envelope, PASS);

    expect(result).toEqual({ ok: true, restored: 2 });
    const { _id: itemId, ...itemRest } = itemDoc;
    const { _id: receiptId, ...receiptRest } = receiptDoc;
    const untrash = { deletedAt: '' };
    expect(itemUpdateOneMock).toHaveBeenCalledWith({ _id: itemId }, { $set: itemRest, $unset: untrash }, { upsert: true });
    expect(receiptUpdateOneMock).toHaveBeenCalledWith(
      { _id: receiptId },
      { $set: receiptRest, $unset: untrash },
      { upsert: true }
    );
    expect(itemCreateMock).not.toHaveBeenCalled();
    expect(receiptCreateMock).not.toHaveBeenCalled();
  });

  it('import is admin-gated before any decrypt or DB work', async () => {
    const envelope = await encryptedBackup();
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(importDataEncrypted(envelope, PASS)).rejects.toThrow('not admin');
    expectNothingWritten();
  });

  it('wrong passphrase → clear error, nothing written', async () => {
    const envelope = await encryptedBackup();

    const result = await importDataEncrypted(envelope, 'not the passphrase');

    expect(result).toEqual({ ok: false, restored: 0, error: 'Wrong passphrase, or the backup file is corrupt' });
    expectNothingWritten();
  });

  it('tampered ciphertext → the same clear error, nothing written (GCM auth, not garbage JSON)', async () => {
    const envelope = await encryptedBackup();
    const env = JSON.parse(envelope);
    const bytes = Buffer.from(env.data, 'base64');
    bytes[0] ^= 0xff; // flip one byte of the ciphertext
    env.data = bytes.toString('base64');

    const result = await importDataEncrypted(JSON.stringify(env), PASS);

    expect(result).toEqual({ ok: false, restored: 0, error: 'Wrong passphrase, or the backup file is corrupt' });
    expectNothingWritten();
  });

  it('truncated / non-JSON file → "not a valid encrypted backup", nothing written', async () => {
    const envelope = await encryptedBackup();

    const result = await importDataEncrypted(envelope.slice(0, envelope.length / 2), PASS);

    expect(result).toEqual({ ok: false, restored: 0, error: 'Not a valid encrypted backup file' });
    expectNothingWritten();
  });

  it('a PLAINTEXT backup passed to the encrypted restore → a sensible error, not a crash and not a restore', async () => {
    const plaintext = JSON.stringify({ app: 'homepage', version: 1, collections: { items: [itemDoc], receipts: [receiptDoc] } });

    const result = await importDataEncrypted(plaintext, PASS);

    expect(result).toEqual({ ok: false, restored: 0, error: 'Not a valid encrypted backup file' });
    expectNothingWritten();
  });
});
