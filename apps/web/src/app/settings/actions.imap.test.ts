import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImapConfig } from '@/lib/imapConfig';
import type { TestResult, FetchResult } from '@/lib/imapImport';

// app/settings/actions.ts is the largest module in the repo (1793 lines, ~20 concerns),
// split into one focused test file per concern (see actions.aiEngine.test.ts for the
// first slice + the full rationale). This file covers ONLY the IMAP email-in concern
// (P11): getImapInfo / saveImapConfigAction / testImapConnectionAction / checkImapInboxNow
// — polling an existing mailbox for receipt emails and feeding each one through the same
// upload+parse pipeline as a manual drag-drop. Everything else is out of scope.
//
// Importing the module pulls in every top-level import of the 1793-line file, so the
// same full mock set from actions.aiEngine.test.ts is required just to let the import
// resolve, even though only @/lib/imapConfig, @/lib/imapImport, @/app/receipts/actions
// and @/models/AppConfig are actually exercised here.
//
// Behaviour pinned:
//  - getImapInfo: thin projection of getImapConfig() onto the public ImapInfo shape
//    (drops `pass` and `lastUid`, keeps `hasPass`). No admin gate (read-only).
//  - saveImapConfigAction: requires admin; reads imap* fields off a FormData; port is
//    clamped [1,65535] with a 993 fallback; secure defaults true (only the literal
//    string 'false' turns it off); folder trims with an 'INBOX' fallback; blank pass
//    is omitted from $set entirely (keeps the existing one); always upserts + invalidates
//    the config cache + revalidates /settings.
//  - testImapConnectionAction: reads the SAVED config (Save-then-Test), delegates to
//    testImapConnection(cfg), and reshapes the discriminated-union result into a flat
//    {ok, error?, messageCount?} object.
//  - checkImapInboxNow: requires admin; short-circuits if !cfg.enabled (no fetch call);
//    propagates a fetchNewEmails failure verbatim; per email, builds the upload item
//    list from attachments when present, else falls back to a single synthetic .html
//    item from the body when there's no attachment, else nothing; each item goes through
//    uploadReceipt() independently (a per-item try/catch — one throwing item does not
//    stop the batch, it just counts as skipped); imapLastUid/imapLastCheckedAt are ALWAYS
//    advanced to the fetch result even when nothing imported, imapLastImportedAt is set
//    ONLY when imported>0; invalidates the config cache + revalidates /settings AND
//    /receipts on success.

const {
  connectDBMock,
  appConfigFindOneLean,
  appConfigUpdateOne,
  requireAdminMock,
  revalidatePathMock,
  getImapConfigMock,
  invalidateImapConfigMock,
  testImapConnectionMock,
  fetchNewEmailsMock,
  uploadReceiptMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  appConfigFindOneLean: vi.fn(async (_filter?: Record<string, unknown>): Promise<Record<string, unknown> | null> => null),
  appConfigUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({})),
  requireAdminMock: vi.fn(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' })),
  revalidatePathMock: vi.fn(),
  getImapConfigMock: vi.fn(async (): Promise<ImapConfig> => ({
    enabled: false, host: '', port: 993, user: '', pass: '', secure: true, folder: 'INBOX',
    lastUid: 0, lastCheckedAt: '', lastImportedAt: '', hasPass: false,
  })),
  invalidateImapConfigMock: vi.fn(),
  testImapConnectionMock: vi.fn(async (_cfg: ImapConfig): Promise<TestResult> => ({ ok: true, messageCount: 0 })),
  fetchNewEmailsMock: vi.fn(async (_cfg: ImapConfig): Promise<FetchResult> => ({ ok: true, emails: [], maxUid: 0 })),
  uploadReceiptMock: vi.fn(async (_fd: FormData): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
}));

vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    updateOne: appConfigUpdateOne,
    findOne: (filter: Record<string, unknown>) => ({
      select: () => ({ lean: () => appConfigFindOneLean(filter) }),
      lean: () => appConfigFindOneLean(filter),
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
vi.mock('@/lib/imapConfig', () => ({ getImapConfig: getImapConfigMock, invalidateImapConfig: invalidateImapConfigMock }));
vi.mock('@/lib/imapImport', () => ({ testImapConnection: testImapConnectionMock, fetchNewEmails: fetchNewEmailsMock }));
vi.mock('@/app/receipts/actions', () => ({ uploadReceipt: uploadReceiptMock }));
vi.mock('@/lib/storeService', () => ({ getStores: vi.fn(async () => []), invalidateStoreCache: vi.fn() }));
vi.mock('@/lib/returnWindow', () => ({ effectiveReturnWindow: vi.fn(), returnDaysLeft: vi.fn() }));
vi.mock('@/lib/budgetSuggest', () => ({ suggestBudgetsFromExpenses: vi.fn() }));
vi.mock('@/lib/categoryRules', () => ({ resolveCategoryRules: vi.fn() }));
vi.mock('@/lib/priceHike', () => ({ detectPriceHikes: vi.fn() }));
vi.mock('@/lib/anthropic', () => ({ anthropicTest: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(), invalidateAppSettings: vi.fn() }));
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

import { getImapInfo, saveImapConfigAction, testImapConnectionAction, checkImapInboxNow } from './actions';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const FULL_CFG: ImapConfig = {
  enabled: true, host: 'imap.example.com', port: 993, user: 'me@example.com', pass: 'secret',
  secure: true, folder: 'Receipts', lastUid: 42, lastCheckedAt: '2026-07-01T00:00:00.000Z',
  lastImportedAt: '2026-06-30T00:00:00.000Z', hasPass: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  appConfigFindOneLean.mockImplementation(async () => null);
  appConfigUpdateOne.mockImplementation(async () => ({}));
  requireAdminMock.mockImplementation(async () => ({ id: 'admin1', role: 'admin' as const, name: 'Admin' }));
  revalidatePathMock.mockImplementation(() => undefined);
  getImapConfigMock.mockImplementation(async () => ({
    enabled: false, host: '', port: 993, user: '', pass: '', secure: true, folder: 'INBOX',
    lastUid: 0, lastCheckedAt: '', lastImportedAt: '', hasPass: false,
  }));
  invalidateImapConfigMock.mockImplementation(() => undefined);
  testImapConnectionMock.mockImplementation(async () => ({ ok: true as const, messageCount: 0 }));
  fetchNewEmailsMock.mockImplementation(async () => ({ ok: true as const, emails: [], maxUid: 0 }));
  uploadReceiptMock.mockImplementation(async () => ({ ok: true as const }));
});

describe('getImapInfo', () => {
  it('has no admin gate', async () => {
    await getImapInfo();
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('projects the full config onto the public shape, dropping pass and lastUid', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    const info = await getImapInfo();
    expect(info).toEqual({
      enabled: true, host: 'imap.example.com', port: 993, user: 'me@example.com', secure: true,
      folder: 'Receipts', hasPass: true, lastCheckedAt: '2026-07-01T00:00:00.000Z',
      lastImportedAt: '2026-06-30T00:00:00.000Z',
    });
    expect(info).not.toHaveProperty('pass');
    expect(info).not.toHaveProperty('lastUid');
  });
});

describe('saveImapConfigAction', () => {
  it('requires admin before touching the DB', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(saveImapConfigAction(fd({ imapHost: 'x' }))).rejects.toThrow('not admin');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('saves a full config with all fields set', async () => {
    await saveImapConfigAction(fd({
      imapEnabled: 'true', imapHost: 'imap.example.com', imapPort: '993', imapUser: 'me@example.com',
      imapSecure: 'true', imapFolder: 'Receipts', imapPass: 'secret',
    }));
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $set: {
      imapEnabled: true, imapHost: 'imap.example.com', imapPort: 993, imapUser: 'me@example.com',
      imapSecure: true, imapFolder: 'Receipts', imapPass: 'secret',
    } });
    expect(opts).toEqual({ upsert: true });
  });

  it('imapEnabled is true only on an exact "true" string match', async () => {
    await saveImapConfigAction(fd({ imapEnabled: 'yes' }));
    const [, update] = appConfigUpdateOne.mock.calls[0];
    expect((update as { $set: Record<string, unknown> }).$set.imapEnabled).toBe(false);
  });

  it('clamps the port to [1, 65535]', async () => {
    await saveImapConfigAction(fd({ imapPort: '999999' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapPort).toBe(65535);

    appConfigUpdateOne.mockClear();
    await saveImapConfigAction(fd({ imapPort: '-5' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapPort).toBe(1);
  });

  it('falls back to port 993 when missing or not a number', async () => {
    await saveImapConfigAction(fd({}));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapPort).toBe(993);

    appConfigUpdateOne.mockClear();
    await saveImapConfigAction(fd({ imapPort: 'not-a-number' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapPort).toBe(993);
  });

  it('imapSecure defaults true, only the literal "false" turns it off', async () => {
    await saveImapConfigAction(fd({}));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapSecure).toBe(true);

    appConfigUpdateOne.mockClear();
    await saveImapConfigAction(fd({ imapSecure: 'no' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapSecure).toBe(true);

    appConfigUpdateOne.mockClear();
    await saveImapConfigAction(fd({ imapSecure: 'false' }));
    expect((appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.imapSecure).toBe(false);
  });

  it('trims host/user/folder, falling back folder to INBOX when blank', async () => {
    await saveImapConfigAction(fd({ imapHost: '  imap.example.com  ', imapUser: '  me@example.com  ', imapFolder: '   ' }));
    const s = (appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;
    expect(s.imapHost).toBe('imap.example.com');
    expect(s.imapUser).toBe('me@example.com');
    expect(s.imapFolder).toBe('INBOX');
  });

  it('omits a blank imapPass from $set entirely (keeps the existing one)', async () => {
    await saveImapConfigAction(fd({ imapHost: 'x' }));
    const s = (appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;
    expect(s).not.toHaveProperty('imapPass');
  });

  it('includes a non-blank imapPass in $set', async () => {
    await saveImapConfigAction(fd({ imapPass: 'newsecret' }));
    const s = (appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;
    expect(s.imapPass).toBe('newsecret');
  });

  it('always upserts, invalidates the config cache and revalidates /settings on success', async () => {
    const res = await saveImapConfigAction(fd({}));
    expect(res).toEqual({ ok: true });
    expect(invalidateImapConfigMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
  });
});

describe('testImapConnectionAction', () => {
  it('reads the saved config (Save-then-Test) and delegates to testImapConnection', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    testImapConnectionMock.mockResolvedValueOnce({ ok: true, messageCount: 7 });
    const res = await testImapConnectionAction();
    expect(testImapConnectionMock).toHaveBeenCalledWith(FULL_CFG);
    expect(res).toEqual({ ok: true, messageCount: 7 });
  });

  it('reshapes a failure result into {ok:false, error}', async () => {
    testImapConnectionMock.mockResolvedValueOnce({ ok: false, error: 'Missing host, username or password' });
    const res = await testImapConnectionAction();
    expect(res).toEqual({ ok: false, error: 'Missing host, username or password' });
  });
});

describe('checkImapInboxNow', () => {
  it('requires admin before reading the config', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('not admin'));
    await expect(checkImapInboxNow()).rejects.toThrow('not admin');
    expect(getImapConfigMock).not.toHaveBeenCalled();
  });

  it('short-circuits when email-in is not enabled, never calling fetchNewEmails', async () => {
    getImapConfigMock.mockResolvedValueOnce({ ...FULL_CFG, enabled: false });
    const res = await checkImapInboxNow();
    expect(res).toEqual({ ok: false, imported: 0, skipped: 0, error: 'Email-in is not enabled' });
    expect(fetchNewEmailsMock).not.toHaveBeenCalled();
  });

  it('propagates a fetchNewEmails failure verbatim', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({ ok: false, error: 'Authentication failed', emails: [], maxUid: 42 });
    const res = await checkImapInboxNow();
    expect(res).toEqual({ ok: false, imported: 0, skipped: 0, error: 'Authentication failed' });
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('uploads each attachment as its own item and counts imported vs skipped', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [
        {
          uid: 43, subject: 'Receipt', date: null, from: 'shop@example.com', html: null,
          attachments: [
            { filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from('a') },
            { filename: 'b.png', contentType: 'image/png', content: Buffer.from('b') },
          ],
        },
      ],
    });
    uploadReceiptMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'bad file' });
    const res = await checkImapInboxNow();
    expect(uploadReceiptMock).toHaveBeenCalledTimes(2);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it('falls back to a single synthetic .html item from the body when there are no attachments', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [
        { uid: 43, subject: 'Your Receipt', date: null, from: 'shop@example.com', html: '<p>hi</p>', attachments: [] },
      ],
    });
    uploadReceiptMock.mockResolvedValueOnce({ ok: true });
    await checkImapInboxNow();
    expect(uploadReceiptMock).toHaveBeenCalledTimes(1);
    const passedFd = uploadReceiptMock.mock.calls[0][0] as FormData;
    const file = passedFd.get('file') as File;
    expect(file.name).toBe('Your Receipt.html');
    expect(file.type).toBe('text/html');
  });

  it('sanitizes illegal filesystem characters out of the subject-derived filename', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [{ uid: 43, subject: 'Re: Your/Order*"2026"?', date: null, from: '', html: '<p>hi</p>', attachments: [] }],
    });
    uploadReceiptMock.mockResolvedValueOnce({ ok: true });
    await checkImapInboxNow();
    const passedFd = uploadReceiptMock.mock.calls[0][0] as FormData;
    const file = passedFd.get('file') as File;
    expect(file.name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('uses "email" as the filename base when the subject is blank', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [{ uid: 43, subject: '', date: null, from: '', html: '<p>hi</p>', attachments: [] }],
    });
    uploadReceiptMock.mockResolvedValueOnce({ ok: true });
    await checkImapInboxNow();
    const passedFd = uploadReceiptMock.mock.calls[0][0] as FormData;
    const file = passedFd.get('file') as File;
    expect(file.name).toBe('email.html');
  });

  it('uploads nothing for an email with no attachments and no html body', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [{ uid: 43, subject: 'Empty', date: null, from: '', html: null, attachments: [] }],
    });
    const res = await checkImapInboxNow();
    expect(uploadReceiptMock).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, imported: 0, skipped: 0 });
  });

  it('a throwing upload does not stop the batch, just counts as skipped', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 44,
      emails: [
        { uid: 43, subject: 'A', date: null, from: '', html: null, attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from('a') }] },
        { uid: 44, subject: 'B', date: null, from: '', html: null, attachments: [{ filename: 'b.pdf', contentType: 'application/pdf', content: Buffer.from('b') }] },
      ],
    });
    uploadReceiptMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true });
    const res = await checkImapInboxNow();
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it('always advances imapLastUid/imapLastCheckedAt, even when nothing was imported', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({ ok: true, emails: [], maxUid: 99 });
    await checkImapInboxNow();
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    const set = (update as { $set: Record<string, unknown> }).$set;
    expect(set.imapLastUid).toBe(99);
    expect(set.imapLastCheckedAt).toBeInstanceOf(Date);
    expect(set).not.toHaveProperty('imapLastImportedAt');
    expect(opts).toEqual({ upsert: true });
  });

  it('sets imapLastImportedAt only when imported>0', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({
      ok: true, maxUid: 100,
      emails: [{ uid: 100, subject: 'A', date: null, from: '', html: null, attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from('a') }] }],
    });
    uploadReceiptMock.mockResolvedValueOnce({ ok: true });
    await checkImapInboxNow();
    const set = (appConfigUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;
    expect(set.imapLastImportedAt).toBeInstanceOf(Date);
  });

  it('invalidates the config cache and revalidates both /settings and /receipts on success', async () => {
    getImapConfigMock.mockResolvedValueOnce(FULL_CFG);
    fetchNewEmailsMock.mockResolvedValueOnce({ ok: true, emails: [], maxUid: 50 });
    const res = await checkImapInboxNow();
    expect(res).toEqual({ ok: true, imported: 0, skipped: 0 });
    expect(invalidateImapConfigMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });
});
