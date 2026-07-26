import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/settings/actions.ts is the largest module in the repo (1793+ lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the file-storage-backends
// concern: getStorageInfo / saveStorageConfig / testRemoteConnection / getSyncManifest /
// syncOnedriveBatch / syncToRemote, plus the internal (unexported) buildSyncManifest that
// all the sync paths funnel through. Everything else is out of scope.
//
// Importing the module pulls in every top-level import of the file, so the same full
// mock set from actions.aiEngine.test.ts is required just to let the import resolve,
// even though only a handful of those modules are actually exercised here.
//
// Behaviour pinned:
//  - getStorageInfo: maps StorageConfig + OneDrive creds into the settings-editor shape;
//    onedriveConnected reflects whether a refresh token is stored (independent of the
//    account name capture); the password itself is never exposed.
//  - saveStorageConfig: requires admin; backend coerces to 'local' unless it's an exact
//    ftp/smb/onedrive match; folder/file templates fall back to the defaults when blank;
//    remotePort clamps to [0,65535]; a blank remotePass field means "keep the existing
//    password" (omitted from the $set), a non-blank one overwrites it; always upserts +
//    invalidates the config cache + revalidates /settings.
//  - testRemoteConnection: tests the SAVED config (not the form), short-circuits with a
//    friendly error when backend is 'local' without calling testRemote at all.
//  - buildSyncManifest (via getSyncManifest/syncToRemote): only archived:false receipts
//    with a real filePath, plus all statements/expenses with a filePath, are included;
//    statements fall back to `${period}-01` when statementDate is missing; each entry's
//    remote path is rendered from the configured templates using the record's kind/store
//    (vendor-or-kind for expenses)/date/total/short-id/basename/extension.
//  - getSyncManifest: refuses (no manifest built) when backend is local, when backend is
//    onedrive without stored creds, or when a non-onedrive remote has no host configured.
//  - syncOnedriveBatch: per-item; missing local file (ENOENT) counts as skipped, not
//    failed; any other read/upload failure counts as failed with the error captured
//    (capped at 5); a successful upload counts as pushed.
//  - syncToRemote: requires admin; same local/no-host guards as above; a local file that
//    can no longer be read is silently skipped (not failed) before the batch push; the
//    overall result is ok only when the remote push reports zero failures.

function makeStorageConfig(overrides: Record<string, unknown> = {}) {
  return {
    backend: 'local',
    mirror: false,
    folderTemplate: '{kind}/{year}/{month}',
    fileNameTemplate: '{date}_{store}_{id}',
    remote: { backend: 'ftp', host: '', port: 0, user: '', pass: '', share: '', basePath: '', secure: false },
    hasPass: false,
    ...overrides,
  };
}

const {
  connectDBMock,
  appConfigUpdateOne,
  requireAdminMock,
  revalidatePathMock,
  getStorageConfigMock,
  invalidateStorageConfigMock,
  getOnedriveCredsMock,
  uploadToOnedriveMock,
  pushBatchToRemoteMock,
  testRemoteMock,
  renderStoragePathMock,
  readFileMock,
  receiptFindLean,
  statementFindLean,
  expenseFindLean,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  revalidatePathMock: vi.fn(),
  getStorageConfigMock: vi.fn(async (): Promise<any> => makeStorageConfigHoisted()),
  invalidateStorageConfigMock: vi.fn(),
  getOnedriveCredsMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  uploadToOnedriveMock: vi.fn(async (_rel: string, _data: Buffer) => ({ ok: true }) as { ok: boolean; error?: string }),
  pushBatchToRemoteMock: vi.fn(async (_cfg: unknown, _files: unknown[]) => ({ pushed: 0, failed: 0, errors: [] as string[] })),
  testRemoteMock: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  renderStoragePathMock: vi.fn((_folder: string, _name: string, tokens: Record<string, unknown>) => `rendered/${tokens.kind}/${tokens.original}.${tokens.ext}`),
  readFileMock: vi.fn(async (_p: string): Promise<Buffer> => Buffer.from('data')),
  receiptFindLean: vi.fn(async (_filter?: unknown, _fields?: unknown): Promise<Record<string, unknown>[]> => []),
  statementFindLean: vi.fn(async (_filter?: unknown, _fields?: unknown): Promise<Record<string, unknown>[]> => []),
  expenseFindLean: vi.fn(async (_filter?: unknown, _fields?: unknown): Promise<Record<string, unknown>[]> => []),
}));

// Self-contained factory usable inside vi.hoisted (can't reference the outer
// makeStorageConfig — hoisting runs before the module body).
function makeStorageConfigHoisted() {
  return {
    backend: 'local',
    mirror: false,
    folderTemplate: '{kind}/{year}/{month}',
    fileNameTemplate: '{date}_{store}_{id}',
    remote: { backend: 'ftp', host: '', port: 0, user: '', pass: '', share: '', basePath: '', secure: false },
    hasPass: false,
  };
}

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    updateOne: appConfigUpdateOne,
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  },
}));
vi.mock('@/models/Store', () => ({ Store: {} }));
vi.mock('@/models/Receipt', () => ({
  Receipt: {
    find: (filter: Record<string, unknown>) => ({
      select: (fields: string) => ({ lean: () => receiptFindLean(filter, fields) }),
    }),
  },
}));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/models/Statement', () => ({
  Statement: {
    find: (filter: Record<string, unknown>) => ({
      select: (fields: string) => ({ lean: () => statementFindLean(filter, fields) }),
    }),
  },
}));
vi.mock('@/models/Subscription', () => ({ Subscription: {} }));
vi.mock('@/models/Voucher', () => ({ Voucher: {} }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: {} }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: {} }));
vi.mock('@/lib/giftcard', () => ({ giftCardBalance: vi.fn(), giftCardDaysLeft: vi.fn() }));
vi.mock('@/models/Bill', () => ({ Bill: {} }));
vi.mock('@/lib/bill', () => ({ billDaysUntilDue: vi.fn() }));
vi.mock('@/models/Card', () => ({ Card: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/models/Expense', () => ({
  Expense: {
    find: (filter: Record<string, unknown>) => ({
      select: (fields: string) => ({ lean: () => expenseFindLean(filter, fields) }),
    }),
  },
}));
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
vi.mock('@/lib/storageConfig', () => ({
  getStorageConfig: getStorageConfigMock,
  invalidateStorageConfig: invalidateStorageConfigMock,
}));
vi.mock('@/lib/remoteStorage', () => ({
  pushBatchToRemote: pushBatchToRemoteMock,
  testRemote: testRemoteMock,
}));
vi.mock('@/lib/storagePath', () => ({
  renderStoragePath: renderStoragePathMock,
  DEFAULT_FOLDER_TEMPLATE: 'DEFAULT_FOLDER',
  DEFAULT_NAME_TEMPLATE: 'DEFAULT_NAME',
}));
vi.mock('@/lib/storage', () => ({ readFile: readFileMock, deleteFile: vi.fn() }));
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
  getOnedriveCreds: getOnedriveCredsMock,
  disconnectOnedrive: vi.fn(),
  testOnedrive: vi.fn(),
  uploadToOnedrive: uploadToOnedriveMock,
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

import { getStorageInfo, saveStorageConfig, testRemoteConnection, getSyncManifest, syncOnedriveBatch, syncToRemote } from './actions';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  revalidatePathMock.mockImplementation(() => undefined);
  getStorageConfigMock.mockImplementation(async () => makeStorageConfig());
  invalidateStorageConfigMock.mockImplementation(() => undefined);
  getOnedriveCredsMock.mockImplementation(async () => null);
  uploadToOnedriveMock.mockImplementation(async () => ({ ok: true }));
  pushBatchToRemoteMock.mockImplementation(async () => ({ pushed: 0, failed: 0, errors: [] }));
  testRemoteMock.mockImplementation(async () => ({ ok: true }));
  renderStoragePathMock.mockImplementation((_f: string, _n: string, tokens: Record<string, unknown>) => `rendered/${tokens.kind}/${tokens.original}.${tokens.ext}`);
  readFileMock.mockImplementation(async () => Buffer.from('data'));
  receiptFindLean.mockImplementation(async () => []);
  statementFindLean.mockImplementation(async () => []);
  expenseFindLean.mockImplementation(async () => []);
});

describe('getStorageInfo', () => {
  it('maps a local backend + no OneDrive creds', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig());
    const info = await getStorageInfo();
    expect(info).toEqual({
      backend: 'local',
      mirror: false,
      folderTemplate: '{kind}/{year}/{month}',
      fileNameTemplate: '{date}_{store}_{id}',
      hasPass: false,
      remoteHost: '',
      remotePort: 0,
      remoteUser: '',
      remoteShare: '',
      remoteBasePath: '',
      remoteSecure: false,
      onedriveConnected: false,
      onedriveAccount: '',
    });
  });

  it('maps a configured remote backend', async () => {
    getStorageConfigMock.mockResolvedValueOnce(
      makeStorageConfig({
        backend: 'smb',
        mirror: true,
        hasPass: true,
        remote: { backend: 'smb', host: 'nas.local', port: 445, user: 'bob', pass: 'x', share: 'Pharos', basePath: 'files', secure: true },
      })
    );
    const info = await getStorageInfo();
    expect(info.backend).toBe('smb');
    expect(info.mirror).toBe(true);
    expect(info.hasPass).toBe(true);
    expect(info.remoteHost).toBe('nas.local');
    expect(info.remotePort).toBe(445);
    expect(info.remoteUser).toBe('bob');
    expect(info.remoteShare).toBe('Pharos');
    expect(info.remoteBasePath).toBe('files');
    expect(info.remoteSecure).toBe(true);
  });

  it('onedriveConnected reflects a stored refresh token, independent of the account name', async () => {
    getOnedriveCredsMock.mockResolvedValueOnce({ clientId: 'c', refreshToken: 'r', account: '' });
    const info = await getStorageInfo();
    expect(info.onedriveConnected).toBe(true);
    expect(info.onedriveAccount).toBe('');
  });

  it('reports the captured OneDrive account name when present', async () => {
    getOnedriveCredsMock.mockResolvedValueOnce({ clientId: 'c', refreshToken: 'r', account: 'me@example.com' });
    const info = await getStorageInfo();
    expect(info.onedriveConnected).toBe(true);
    expect(info.onedriveAccount).toBe('me@example.com');
  });

  it('defaults remotePort/remoteShare/remoteBasePath when the config omits them', async () => {
    getStorageConfigMock.mockResolvedValueOnce(
      makeStorageConfig({ remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: '' } })
    );
    const info = await getStorageInfo();
    expect(info.remotePort).toBe(0);
    expect(info.remoteShare).toBe('');
    expect(info.remoteBasePath).toBe('');
  });
});

describe('saveStorageConfig', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(saveStorageConfig(fd({ storageBackend: 'smb' }))).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it.each(['ftp', 'smb', 'onedrive'])('accepts an exact backend match: %s', async (backend) => {
    await saveStorageConfig(fd({ storageBackend: backend }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as any).$set.storageBackend).toBe(backend);
  });

  it.each(['', 'dropbox', 'gdrive'])('falls back to local for any non-exact backend: %j', async (backend) => {
    await saveStorageConfig(fd({ storageBackend: backend }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as any).$set.storageBackend).toBe('local');
  });

  it('falls back to local when storageBackend is missing entirely', async () => {
    await saveStorageConfig(fd({}));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as any).$set.storageBackend).toBe('local');
  });

  it('storageMirror is true only on an exact "true" string match', async () => {
    await saveStorageConfig(fd({ storageMirror: 'true' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.storageMirror).toBe(true);
    appConfigUpdateOne.mockClear();
    await saveStorageConfig(fd({ storageMirror: 'yes' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.storageMirror).toBe(false);
  });

  it('trims folder/file templates and keeps a non-blank value', async () => {
    await saveStorageConfig(fd({ folderTemplate: '  {kind}/{store}  ', fileNameTemplate: '  {id}  ' }));
    const set = (appConfigUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.folderTemplate).toBe('{kind}/{store}');
    expect(set.fileNameTemplate).toBe('{id}');
  });

  it('falls back to the default templates when blank', async () => {
    await saveStorageConfig(fd({ folderTemplate: '   ', fileNameTemplate: '' }));
    const set = (appConfigUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.folderTemplate).toBe('DEFAULT_FOLDER');
    expect(set.fileNameTemplate).toBe('DEFAULT_NAME');
  });

  it('clamps remotePort into [0, 65535]', async () => {
    await saveStorageConfig(fd({ remotePort: '99999' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.remotePort).toBe(65535);
    appConfigUpdateOne.mockClear();
    await saveStorageConfig(fd({ remotePort: '-50' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.remotePort).toBe(0);
    appConfigUpdateOne.mockClear();
    await saveStorageConfig(fd({ remotePort: 'not-a-number' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.remotePort).toBe(0);
  });

  it('trims remoteHost/remoteUser/remoteShare/remoteBasePath', async () => {
    await saveStorageConfig(fd({ remoteHost: ' nas.local ', remoteUser: ' bob ', remoteShare: ' Pharos ', remoteBasePath: ' files ' }));
    const set = (appConfigUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.remoteHost).toBe('nas.local');
    expect(set.remoteUser).toBe('bob');
    expect(set.remoteShare).toBe('Pharos');
    expect(set.remoteBasePath).toBe('files');
  });

  it('remoteSecure is true only on an exact "true" string match', async () => {
    await saveStorageConfig(fd({ remoteSecure: 'true' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as any).$set.remoteSecure).toBe(true);
  });

  it('a blank remotePass is omitted from the update (keeps the existing password)', async () => {
    await saveStorageConfig(fd({ remotePass: '' }));
    const set = (appConfigUpdateOne.mock.calls[0][1] as any).$set;
    expect(set).not.toHaveProperty('remotePass');
  });

  it('a non-blank remotePass is included and overwrites the stored password', async () => {
    await saveStorageConfig(fd({ remotePass: 'secret123' }));
    const set = (appConfigUpdateOne.mock.calls[0][1] as any).$set;
    expect(set.remotePass).toBe('secret123');
  });

  it('always upserts by the singleton key, invalidates the cache, and revalidates /settings', async () => {
    const res = await saveStorageConfig(fd({ storageBackend: 'ftp' }));
    expect(res).toEqual({ ok: true });
    const [filter, , opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(opts).toEqual({ upsert: true });
    expect(invalidateStorageConfigMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('testRemoteConnection', () => {
  it('short-circuits on a local backend without calling testRemote', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'local' }));
    const res = await testRemoteConnection();
    expect(res).toEqual({ ok: false, error: 'Backend is Local — nothing to test' });
    expect(testRemoteMock).not.toHaveBeenCalled();
  });

  it('tests the SAVED remote config for a non-local backend', async () => {
    const remote = { backend: 'ftp' as const, host: 'ftp.local', port: 21, user: 'u', pass: 'p' };
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote }));
    testRemoteMock.mockResolvedValueOnce({ ok: true });
    const res = await testRemoteConnection();
    expect(testRemoteMock).toHaveBeenCalledWith(remote);
    expect(res).toEqual({ ok: true });
  });

  it('propagates a failure result from testRemote', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'smb' }));
    testRemoteMock.mockResolvedValueOnce({ ok: false, error: 'auth failed' });
    const res = await testRemoteConnection();
    expect(res).toEqual({ ok: false, error: 'auth failed' });
  });
});

describe('getSyncManifest (via buildSyncManifest)', () => {
  it('refuses when backend is local', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'local' }));
    const res = await getSyncManifest();
    expect(res).toEqual({ ok: false, error: 'Set a remote backend first', items: [] });
    expect(receiptFindLean).not.toHaveBeenCalled();
  });

  it('refuses when backend is onedrive without stored creds', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'onedrive' }));
    getOnedriveCredsMock.mockResolvedValueOnce(null);
    const res = await getSyncManifest();
    expect(res).toEqual({ ok: false, error: 'Connect OneDrive first', items: [] });
  });

  it('refuses when a non-onedrive remote has no host configured', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: '', user: '', pass: '' } }));
    const res = await getSyncManifest();
    expect(res).toEqual({ ok: false, error: 'No remote host configured', items: [] });
  });

  it('builds a manifest entry per receipt/statement/expense with a filePath', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    receiptFindLean.mockResolvedValueOnce([{ _id: 'r1', store: 'Skroutz', date: '2026-06-04', total: 129.98, filePath: 'receipts/r1.pdf' }]);
    statementFindLean.mockResolvedValueOnce([{ _id: 's1', card: 'Visa', period: '2026-06', totalAmount: 200, filePath: 'statements/s1.pdf' }]);
    expenseFindLean.mockResolvedValueOnce([{ _id: 'e1', kind: 'expense', vendor: 'DEI', amount: 50, date: '2026-06-01', filePath: 'expenses/e1.pdf' }]);

    const res = await getSyncManifest();
    expect(res.ok).toBe(true);
    expect(res.items).toHaveLength(3);
    expect(res.items.map((i) => i.filePath)).toEqual(['receipts/r1.pdf', 'statements/s1.pdf', 'expenses/e1.pdf']);
  });

  it('filters receipts by archived:false and a real filePath', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    await getSyncManifest();
    const [filter, fields] = receiptFindLean.mock.calls[0];
    expect(filter).toEqual({ archived: { $ne: true }, filePath: { $nin: ['', null] } });
    expect(fields).toBe('store date total filePath');
  });

  it('selects only filePath-having statements/expenses (no archived filter — not applicable)', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    await getSyncManifest();
    expect(statementFindLean.mock.calls[0][0]).toEqual({ filePath: { $nin: ['', null] } });
    expect(statementFindLean.mock.calls[0][1]).toBe('card period totalAmount statementDate filePath');
    expect(expenseFindLean.mock.calls[0][0]).toEqual({ filePath: { $nin: ['', null] } });
    expect(expenseFindLean.mock.calls[0][1]).toBe('kind vendor amount date filePath');
  });

  it('renders each token set correctly: receipt kind/store/date/total/id/original/ext', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    receiptFindLean.mockResolvedValueOnce([{ _id: 'abcdef123456', store: 'Skroutz', date: '2026-06-04T10:00:00Z', total: 129.98, filePath: 'a/receipts/2026-06_Skroutz.pdf' }]);
    await getSyncManifest();
    const [, , tokens] = renderStoragePathMock.mock.calls.find((c) => c[2].kind === 'receipts')!;
    expect(tokens).toEqual({
      kind: 'receipts',
      store: 'Skroutz',
      date: '2026-06-04',
      total: 129.98,
      id: '123456', // shortId = last 6 chars
      original: '2026-06_Skroutz',
      ext: 'pdf',
    });
  });

  it('statement falls back to `${period}-01` when statementDate is missing', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    statementFindLean.mockResolvedValueOnce([{ _id: 's1', card: 'Visa', period: '2026-06', totalAmount: 200, filePath: 'statements/s1.pdf' }]);
    await getSyncManifest();
    const [, , tokens] = renderStoragePathMock.mock.calls.find((c) => c[2].kind === 'statements')!;
    expect(tokens.date).toBe('2026-06-01');
  });

  it('statement uses statementDate when present, ignoring the period fallback', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    statementFindLean.mockResolvedValueOnce([{ _id: 's1', card: 'Visa', period: '2026-06', statementDate: '2026-06-15', totalAmount: 200, filePath: 'statements/s1.pdf' }]);
    await getSyncManifest();
    const [, , tokens] = renderStoragePathMock.mock.calls.find((c) => c[2].kind === 'statements')!;
    expect(tokens.date).toBe('2026-06-15');
  });

  it('expense store falls back to kind when vendor is blank', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: 'ftp.local', user: 'u', pass: 'p' } }));
    expenseFindLean.mockResolvedValueOnce([{ _id: 'e1', kind: 'income', vendor: '', amount: 500, date: '2026-06-01', filePath: 'expenses/e1.pdf' }]);
    await getSyncManifest();
    const [, , tokens] = renderStoragePathMock.mock.calls.find((c) => c[2].kind === 'expenses')!;
    expect(tokens.store).toBe('income');
  });
});

describe('syncOnedriveBatch', () => {
  it('counts a successful upload as pushed', async () => {
    const res = await syncOnedriveBatch([{ filePath: 'a.pdf', rel: 'receipts/a.pdf' }]);
    expect(res).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(readFileMock).toHaveBeenCalledWith('a.pdf');
    expect(uploadToOnedriveMock).toHaveBeenCalledWith('receipts/a.pdf', Buffer.from('data'));
  });

  it('counts an upload rejection (ok:false) as failed, with the error captured', async () => {
    uploadToOnedriveMock.mockResolvedValueOnce({ ok: false, error: 'throttled' });
    const res = await syncOnedriveBatch([{ filePath: 'a.pdf', rel: 'receipts/a.pdf' }]);
    expect(res.pushed).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.errors).toEqual(['receipts/a.pdf: throttled']);
  });

  it('counts a missing local file (ENOENT) as skipped, not failed', async () => {
    readFileMock.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));
    const res = await syncOnedriveBatch([{ filePath: 'gone.pdf', rel: 'receipts/gone.pdf' }]);
    expect(res).toEqual({ pushed: 0, failed: 0, skipped: 1, errors: [] });
  });

  it('counts any other read/upload exception as failed', async () => {
    readFileMock.mockRejectedValueOnce(new Error('disk error'));
    const res = await syncOnedriveBatch([{ filePath: 'x.pdf', rel: 'receipts/x.pdf' }]);
    expect(res.failed).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.errors).toEqual(['receipts/x.pdf: disk error']);
  });

  it('caps captured errors at 5 but keeps counting all failures', async () => {
    uploadToOnedriveMock.mockImplementation(async () => ({ ok: false, error: 'fail' }));
    const items = Array.from({ length: 8 }, (_, i) => ({ filePath: `f${i}.pdf`, rel: `r${i}.pdf` }));
    const res = await syncOnedriveBatch(items);
    expect(res.failed).toBe(8);
    expect(res.errors).toHaveLength(5);
  });

  it('processes an empty batch as a no-op', async () => {
    const res = await syncOnedriveBatch([]);
    expect(res).toEqual({ pushed: 0, failed: 0, skipped: 0, errors: [] });
    expect(readFileMock).not.toHaveBeenCalled();
  });
});

describe('syncToRemote', () => {
  it('requires admin before building any manifest', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(syncToRemote()).rejects.toThrow('not admin');
    expect(receiptFindLean).not.toHaveBeenCalled();
  });

  it('refuses on a local backend', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'local' }));
    const res = await syncToRemote();
    expect(res).toEqual({ ok: false, pushed: 0, failed: 0, skipped: 0, error: 'Set a remote backend first', errors: [] });
    expect(pushBatchToRemoteMock).not.toHaveBeenCalled();
  });

  it('refuses when no remote host is configured', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote: { backend: 'ftp', host: '', user: '', pass: '' } }));
    const res = await syncToRemote();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('No remote host configured');
  });

  it('reads every manifest file and pushes the batch, skipping unreadable local files', async () => {
    const remote = { backend: 'ftp' as const, host: 'ftp.local', user: 'u', pass: 'p' };
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'ftp', remote }));
    receiptFindLean.mockResolvedValueOnce([
      { _id: 'r1', store: 'A', date: '2026-06-01', total: 10, filePath: 'a.pdf' },
      { _id: 'r2', store: 'B', date: '2026-06-02', total: 20, filePath: 'b.pdf' },
    ]);
    readFileMock.mockImplementationOnce(async () => Buffer.from('ok'));
    readFileMock.mockImplementationOnce(async () => {
      throw new Error('ENOENT');
    });
    pushBatchToRemoteMock.mockResolvedValueOnce({ pushed: 1, failed: 0, errors: [] });

    const res = await syncToRemote();
    expect(pushBatchToRemoteMock).toHaveBeenCalledTimes(1);
    const [cfgArg, filesArg] = pushBatchToRemoteMock.mock.calls[0];
    expect(cfgArg).toEqual(remote);
    expect(filesArg).toHaveLength(1); // the second file's read threw → skipped, not pushed
    expect(res).toEqual({ ok: true, pushed: 1, failed: 0, skipped: 1, errors: [] });
  });

  it('is not ok when the remote push reports any failures', async () => {
    getStorageConfigMock.mockResolvedValueOnce(makeStorageConfig({ backend: 'smb', remote: { backend: 'smb', host: 'nas.local', user: 'u', pass: 'p' } }));
    pushBatchToRemoteMock.mockResolvedValueOnce({ pushed: 2, failed: 1, errors: ['x.pdf: boom'] });
    const res = await syncToRemote();
    expect(res.ok).toBe(false);
    expect(res.pushed).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.errors).toEqual(['x.pdf: boom']);
  });
});
