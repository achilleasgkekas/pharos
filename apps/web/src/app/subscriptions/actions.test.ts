import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/subscriptions/actions.ts — never directly unit-tested before. Mocks the DB layer
// (Subscription/Expense models), the AI feature gate + suggestSubscription (lib/ollama), and
// the pure recurring-discovery algorithm (lib/recurringDiscovery — already has its own
// dedicated test file, so it is mocked here rather than re-exercised; this file focuses on
// the wiring: query shape, exclude-set construction, defaults). `vendorKey` (app/expenses/lib)
// is left un-mocked — it is pure/deterministic and already covered by expenses/lib.test.ts, so
// exercising the real implementation pins the actual exclude-set normalization end-to-end.
//
// Behaviour pinned:
//  - suggestSubscriptionInfo: feature-off and blank-name short-circuit before ever calling the
//    AI; ECONNREFUSED/fetch-failed/ENOTFOUND map to "Ollama is not reachable", anything else to
//    a truncated "AI failed: ..." message.
//  - createSubscription/updateSubscription: Zod `SubFormSchema` defaults apply, trialEndsAt ''
//    → null, nextRenewal is computed by rolling startDate forward by the billing cycle until it
//    lands in the future (lifetime → null renewal). createSubscription always sets active:true;
//    updateSubscription never touches `active`.
//  - toggleSubscriptionActive: active:true clears cancelledAt, active:false stamps it with now.
//  - deleteSubscription: SOFT delete ($set deletedAt), not an actual removal.
//  - discoverUntrackedRecurring: builds the exclude set from vendorKey(name) + vendorKey(provider)
//    of every existing Subscription (blank/empty keys skipped), then delegates the actual
//    discovery to discoverRecurringCandidates.
//  - trackDiscoveredSubscription: name falls back to 'Untitled' when the candidate vendor is
//    blank, provider mirrors name, startDate falls back to now() when firstDate is blank.

const {
  connectDBMock,
  subCreate,
  subFindByIdAndUpdate,
  subUpdateOne,
  subFind,
  expenseFind,
  isFeatureEnabledMock,
  suggestSubscriptionMock,
  revalidatePathMock,
  discoverRecurringCandidatesMock,
  settingsState,
  getAppSettingsMock,
} = vi.hoisted(() => {
  // P9: the base currency the write paths resolve foreign amounts against.
  const settingsState = { currency: 'EUR' };
  return {
  settingsState,
  getAppSettingsMock: vi.fn(async () => settingsState),
  connectDBMock: vi.fn(async () => {}),
  subCreate: vi.fn(async (_doc: Record<string, any>) => ({})),
  subFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  subUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  subFind: vi.fn(() => ({
    select: () => ({ lean: async () => [] as Array<{ name?: string; provider?: string }> }),
  })),
  expenseFind: vi.fn(() => ({
    select: () => ({ lean: async () => [] as Array<Record<string, unknown>> }),
  })),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  suggestSubscriptionMock: vi.fn(async (_name: string) => ({
    parsed: { provider: 'Netflix', category: 'streaming', amount: 15, currency: 'EUR', billingCycle: 'monthly', url: '', notes: '' },
    model: 'test-model',
  })),
  revalidatePathMock: vi.fn(),
  discoverRecurringCandidatesMock: vi.fn(
    (_rows: Array<Record<string, unknown>>, _opts: { excludeVendorKeys: Set<string> }) => [] as unknown[]
  ),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
// Tenancy seam mocked flat (pass the model straight through, run the body inline): this file
// pins CRUD/discovery behaviour, while actions.tenant.test.ts mocks the same seam tenant-aware
// to pin the routing itself.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/models/Subscription', () => ({
  Subscription: {
    create: subCreate,
    findByIdAndUpdate: subFindByIdAndUpdate,
    updateOne: subUpdateOne,
    find: subFind,
  },
}));
vi.mock('@/models/Expense', () => ({
  Expense: { find: expenseFind },
}));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/ollama', () => ({ suggestSubscription: suggestSubscriptionMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));
vi.mock('@/lib/recurringDiscovery', () => ({ discoverRecurringCandidates: discoverRecurringCandidatesMock }));

import {
  suggestSubscriptionInfo,
  createSubscription,
  updateSubscription,
  toggleSubscriptionActive,
  deleteSubscription,
  discoverUntrackedRecurring,
  trackDiscoveredSubscription,
} from './actions';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsState.currency = 'EUR';
  getAppSettingsMock.mockImplementation(async () => settingsState);
  isFeatureEnabledMock.mockResolvedValue(true);
  subFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  expenseFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  discoverRecurringCandidatesMock.mockReturnValue([]);
});

describe('suggestSubscriptionInfo', () => {
  it('short-circuits when the AI feature is off, without calling suggestSubscription', async () => {
    isFeatureEnabledMock.mockResolvedValueOnce(false);
    const res = await suggestSubscriptionInfo('Netflix');
    expect(res).toEqual({ ok: false, error: 'Subscription autofill (AI) is turned off.' });
    expect(suggestSubscriptionMock).not.toHaveBeenCalled();
  });

  it('rejects a blank name without calling the AI', async () => {
    const res = await suggestSubscriptionInfo('   ');
    expect(res).toEqual({ ok: false, error: 'Type a name first' });
    expect(suggestSubscriptionMock).not.toHaveBeenCalled();
  });

  it('trims the name before calling suggestSubscription and returns the parsed data', async () => {
    const res = await suggestSubscriptionInfo('  Netflix  ');
    expect(suggestSubscriptionMock).toHaveBeenCalledWith('Netflix');
    expect(res).toEqual({
      ok: true,
      data: { provider: 'Netflix', category: 'streaming', amount: 15, currency: 'EUR', billingCycle: 'monthly', url: '', notes: '' },
    });
  });

  it('maps a connection-refused failure to "Ollama is not reachable"', async () => {
    suggestSubscriptionMock.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));
    const res = await suggestSubscriptionInfo('Spotify');
    expect(res).toEqual({ ok: false, error: 'Ollama is not reachable' });
  });

  it('truncates a generic AI failure to 100 chars', async () => {
    suggestSubscriptionMock.mockRejectedValueOnce(new Error('x'.repeat(200)));
    const res = await suggestSubscriptionInfo('Spotify');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.startsWith('AI failed: ')).toBe(true);
      expect(res.error.length).toBe('AI failed: '.length + 100);
    }
  });
});

describe('createSubscription', () => {
  it('applies Zod defaults and always sets active:true', async () => {
    await createSubscription(fd({ name: 'Netflix', amount: '15', startDate: '2020-01-01' }));
    expect(subCreate).toHaveBeenCalledTimes(1);
    const doc = subCreate.mock.calls[0][0];
    expect(doc).toMatchObject({
      name: 'Netflix',
      provider: '',
      category: 'other',
      amount: 15,
      currency: 'EUR',
      billingCycle: 'monthly',
      active: true,
    });
    expect(doc.trialEndsAt).toBeNull();
    expect(doc.startDate).toEqual(new Date('2020-01-01'));
  });

  it('rejects a missing name before touching the DB', async () => {
    await expect(createSubscription(fd({ amount: '15', startDate: '2020-01-01' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('parses a non-blank trialEndsAt into a Date', async () => {
    await createSubscription(fd({ name: 'Trial App', amount: '0', startDate: '2026-01-01', trialEndsAt: '2026-01-15' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.trialEndsAt).toEqual(new Date('2026-01-15'));
  });

  it('a lifetime billingCycle gets no renewal date', async () => {
    await createSubscription(fd({ name: 'Lifetime App', amount: '99', startDate: '2020-01-01', billingCycle: 'lifetime' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.nextRenewal).toBeNull();
  });

  it('rolls a past monthly startDate forward to a date within one cycle of now', async () => {
    await createSubscription(fd({ name: 'Netflix', amount: '15', startDate: '2020-01-01', billingCycle: 'monthly' }));
    const doc = subCreate.mock.calls[0][0];
    const now = new Date();
    expect(doc.nextRenewal).toBeInstanceOf(Date);
    expect(doc.nextRenewal.getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(doc.nextRenewal.getTime() - now.getTime()).toBeLessThan(32 * 86_400_000);
  });

  it('a future startDate is left untouched (no rolling needed)', async () => {
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    await createSubscription(fd({ name: 'Future App', amount: '5', startDate: future, billingCycle: 'yearly' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.nextRenewal).toEqual(new Date(future));
  });

  it('revalidates the subscriptions path', async () => {
    await createSubscription(fd({ name: 'Netflix', amount: '15', startDate: '2020-01-01' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/subscriptions');
  });
});

describe('createSubscription / updateSubscription — schema edges (#29, #30)', () => {
  // #29: the Subscription model relaxed `category` to a free string so Settings → Lists can
  // add custom ones, and the form offers them, but the action schema still held the old enum.
  it('accepts a custom category configured in Settings (#29)', async () => {
    await createSubscription(fd({ name: 'Power', amount: '40', startDate: '2020-01-01', category: 'utilities' }));
    expect(subCreate).toHaveBeenCalledTimes(1);
    expect(subCreate.mock.calls[0][0].category).toBe('utilities');
  });

  it('updateSubscription keeps a custom category too (#29)', async () => {
    await updateSubscription('sub1', fd({ name: 'Power', amount: '40', startDate: '2020-01-01', category: 'utilities' }));
    expect(subFindByIdAndUpdate.mock.calls[0][1].category).toBe('utilities');
  });

  it('a blank category falls back to "other" instead of storing an empty string', async () => {
    await createSubscription(fd({ name: 'Power', amount: '40', startDate: '2020-01-01', category: '  ' }));
    expect(subCreate.mock.calls[0][0].category).toBe('other');
  });

  // #30: a cleared date input submits '' and new Date('') is Invalid Date, which reached the
  // write as both startDate and nextRenewal.
  it.each(['', 'not-a-date'])('rejects startDate %j before touching the DB (#30)', async (startDate) => {
    await expect(createSubscription(fd({ name: 'Netflix', amount: '15', startDate }))).rejects.toThrow();
    await expect(updateSubscription('sub1', fd({ name: 'Netflix', amount: '15', startDate }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(subCreate).not.toHaveBeenCalled();
    expect(subFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('updateSubscription', () => {
  it('updates by id without forcing `active`', async () => {
    await updateSubscription('sub1', fd({ name: 'Netflix HD', amount: '18', startDate: '2020-01-01' }));
    expect(subFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = subFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('sub1');
    expect(update).toMatchObject({ name: 'Netflix HD', amount: 18 });
    expect(update).not.toHaveProperty('active');
    expect(revalidatePathMock).toHaveBeenCalledWith('/subscriptions');
  });
});

describe('toggleSubscriptionActive', () => {
  it('reactivating clears cancelledAt', async () => {
    await toggleSubscriptionActive('sub1', true);
    expect(subFindByIdAndUpdate).toHaveBeenCalledWith('sub1', { active: true, cancelledAt: null });
  });

  it('cancelling stamps cancelledAt with a Date', async () => {
    await toggleSubscriptionActive('sub1', false);
    const [id, update] = subFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('sub1');
    expect(update.active).toBe(false);
    expect(update.cancelledAt).toBeInstanceOf(Date);
  });
});

describe('deleteSubscription', () => {
  it('soft-deletes via $set deletedAt, not a real removal', async () => {
    await deleteSubscription('sub1');
    expect(subUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = subUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'sub1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/subscriptions');
  });
});

describe('discoverUntrackedRecurring', () => {
  it('queries expense/subscription shape and delegates with an empty exclude set when there are no subs', async () => {
    expenseFind.mockReturnValueOnce({ select: () => ({ lean: async () => [{ vendor: 'DEH', amount: 60 }] }) });
    subFind.mockReturnValueOnce({ select: () => ({ lean: async () => [] }) });
    await discoverUntrackedRecurring();

    expect(expenseFind).toHaveBeenCalledWith({ kind: 'expense', amount: { $gt: 0 } });
    expect(subFind).toHaveBeenCalledWith();
    expect(discoverRecurringCandidatesMock).toHaveBeenCalledTimes(1);
    const [rows, opts] = discoverRecurringCandidatesMock.mock.calls[0];
    expect(rows).toEqual([{ vendor: 'DEH', amount: 60 }]);
    expect(opts.excludeVendorKeys.size).toBe(0);
  });

  it('builds the exclude set from every subscription name + provider, skipping blanks', async () => {
    subFind.mockReturnValueOnce({
      select: () => ({
        lean: async () => [
          { name: 'Netflix', provider: 'Netflix Inc' },
          { name: '', provider: '' },
          { name: 'Spotify', provider: '' },
        ],
      }),
    });
    await discoverUntrackedRecurring();
    const [, opts] = discoverRecurringCandidatesMock.mock.calls[0];
    // vendorKey() lowercases, strips legal suffixes (inc/sa/ae/...) and non-alnum chars.
    expect(opts.excludeVendorKeys.has('netflix')).toBe(true);
    expect(opts.excludeVendorKeys.has('spotify')).toBe(true);
    expect(opts.excludeVendorKeys.size).toBe(2);
  });

  it('returns whatever discoverRecurringCandidates yields', async () => {
    const fake = [{ vendorKey: 'deh', vendor: 'DEH' }];
    discoverRecurringCandidatesMock.mockReturnValueOnce(fake);
    const res = await discoverUntrackedRecurring();
    expect(res).toBe(fake);
  });
});

describe('trackDiscoveredSubscription', () => {
  it('creates an active Subscription named + provider from the candidate vendor', async () => {
    await trackDiscoveredSubscription({ vendor: 'DEH', amount: 60, cycle: 'monthly', firstDate: '2020-01-01' });
    expect(subCreate).toHaveBeenCalledTimes(1);
    const doc = subCreate.mock.calls[0][0];
    expect(doc).toMatchObject({ name: 'DEH', provider: 'DEH', category: 'other', amount: 60, currency: 'EUR', billingCycle: 'monthly', active: true });
    expect(doc.startDate).toEqual(new Date('2020-01-01'));
    expect(revalidatePathMock).toHaveBeenCalledWith('/subscriptions');
  });

  it('falls back to "Untitled" when the vendor is blank', async () => {
    await trackDiscoveredSubscription({ vendor: '  ', amount: 10, cycle: 'weekly', firstDate: '2020-01-01' });
    const doc = subCreate.mock.calls[0][0];
    expect(doc.name).toBe('Untitled');
    expect(doc.provider).toBe('Untitled');
  });

  it('falls back to now() when firstDate is blank', async () => {
    const before = Date.now();
    await trackDiscoveredSubscription({ vendor: 'DEH', amount: 60, cycle: 'monthly', firstDate: '' });
    const after = Date.now();
    const doc = subCreate.mock.calls[0][0];
    expect(doc.startDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc.startDate.getTime()).toBeLessThanOrEqual(after);
  });
});

// P9 multi-currency. The stored `amount` is ALWAYS base currency (lib/fx.ts), so that every
// existing roll-up (monthly equivalent, calendar agenda, reports) keeps summing it untouched.
// These pin the two halves of that promise: a foreign sub is converted before storage, and a
// base-currency sub is written byte-for-byte as it was before the feature existed.
describe('createSubscription / updateSubscription — multi-currency (P9)', () => {
  const baseForm = { name: 'Netflix', startDate: '2026-01-15', billingCycle: 'monthly' };

  it('stores a base-currency subscription exactly as before (no FX fields set)', async () => {
    await createSubscription(fd({ ...baseForm, amount: '15.99', currency: 'EUR' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.amount).toBe(15.99);
    expect(doc.currency).toBe('EUR');
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });

  it('converts a foreign amount to base currency and keeps the printed one', async () => {
    await createSubscription(fd({ ...baseForm, amount: '10', currency: 'USD', fxRate: '0.92' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.amount).toBe(9.2);
    expect(doc.currency).toBe('USD');
    expect(doc.origAmount).toBe(10);
    expect(doc.fxRate).toBe(0.92);
  });

  it('does NOT invent a 1:1 rate: a foreign amount with no rate stays the printed number', async () => {
    await createSubscription(fd({ ...baseForm, amount: '10', currency: 'USD' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.amount).toBe(10);
    expect(doc.origAmount).toBe(10);
    expect(doc.fxRate).toBe(0);
  });

  it('converts firstChargeAmount with the SAME rate as amount', async () => {
    await createSubscription(fd({ ...baseForm, amount: '10', currency: 'USD', fxRate: '0.5', firstChargeAmount: '4' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.amount).toBe(5);
    expect(doc.firstChargeAmount).toBe(2);
  });

  it('leaves firstChargeAmount alone when the rate is unknown (same rule as amount)', async () => {
    await createSubscription(fd({ ...baseForm, amount: '10', currency: 'USD', firstChargeAmount: '4' }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.firstChargeAmount).toBe(4);
  });

  it('is relative to the deployment base currency, not to EUR', async () => {
    settingsState.currency = 'USD';
    await createSubscription(fd({ ...baseForm, amount: '10', currency: 'USD', fxRate: '0.92' }));
    const doc = subCreate.mock.calls[0][0];
    // USD IS the base here, so the rate is irrelevant and nothing is converted.
    expect(doc.amount).toBe(10);
    expect(doc.currency).toBe('USD');
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });

  it('re-saving a foreign subscription unchanged does not double-convert it', async () => {
    // The form always submits the PRINTED figure, so the same input yields the same stored one.
    const form = { ...baseForm, amount: '10', currency: 'USD', fxRate: '0.92' };
    await createSubscription(fd(form));
    await updateSubscription('sub1', fd(form));
    expect(subCreate.mock.calls[0][0].amount).toBe(9.2);
    expect(subFindByIdAndUpdate.mock.calls[0][1].amount).toBe(9.2);
  });

  it('updateSubscription writes all four money fields', async () => {
    await updateSubscription('sub1', fd({ ...baseForm, amount: '200', currency: 'GBP', fxRate: '1.17' }));
    const update = subFindByIdAndUpdate.mock.calls[0][1];
    expect(update.amount).toBe(234);
    expect(update.currency).toBe('GBP');
    expect(update.origAmount).toBe(200);
    expect(update.fxRate).toBe(1.17);
  });
});

// Household cost-split (P73). The form serializes SplitEntry[] as JSON into one FormData
// field; the schema transform + cleanSplit() (lib/split.ts, shared with Expenses' P35)
// parse and sanitize it. These pin: the default (no field submitted) is an empty split,
// a well-formed array survives cleaning, and malformed/non-array JSON degrades to []
// rather than throwing (a corrupt field must never block saving the rest of the form).
describe('createSubscription / updateSubscription — cost-split (P73)', () => {
  const baseForm = { name: 'Netflix Family', amount: '15', startDate: '2026-01-15' };

  it('defaults to an empty split when the field is not submitted', async () => {
    await createSubscription(fd(baseForm));
    expect(subCreate.mock.calls[0][0].split).toEqual([]);
  });

  it('parses and cleans a well-formed split array', async () => {
    const split = JSON.stringify([
      { name: '  Maria  ', share: 5.005, settled: false },
      { name: 'Nikos', share: 2.5, settled: true },
    ]);
    await createSubscription(fd({ ...baseForm, split }));
    const doc = subCreate.mock.calls[0][0];
    expect(doc.split).toEqual([
      { name: 'Maria', share: 5.01, settled: false },
      { name: 'Nikos', share: 2.5, settled: true },
    ]);
  });

  it('drops nameless rows', async () => {
    const split = JSON.stringify([{ name: '   ', share: 5, settled: false }]);
    await createSubscription(fd({ ...baseForm, split }));
    expect(subCreate.mock.calls[0][0].split).toEqual([]);
  });

  it('malformed JSON degrades to an empty split instead of throwing', async () => {
    await expect(createSubscription(fd({ ...baseForm, split: '{not json' }))).resolves.toBeUndefined();
    expect(subCreate.mock.calls[0][0].split).toEqual([]);
  });

  it('a JSON object (not an array) degrades to an empty split', async () => {
    await createSubscription(fd({ ...baseForm, split: JSON.stringify({ name: 'oops' }) }));
    expect(subCreate.mock.calls[0][0].split).toEqual([]);
  });

  it('updateSubscription cleans the split the same way', async () => {
    const split = JSON.stringify([{ name: 'Maria', share: 5, settled: false }]);
    await updateSubscription('sub1', fd({ ...baseForm, split }));
    const update = subFindByIdAndUpdate.mock.calls[0][1];
    expect(update.split).toEqual([{ name: 'Maria', share: 5, settled: false }]);
  });
});

describe('trackDiscoveredSubscription — currency (P9)', () => {
  it('stamps the deployment base currency, not a hardcoded EUR', async () => {
    settingsState.currency = 'USD';
    await trackDiscoveredSubscription({ vendor: 'DEH', amount: 60, cycle: 'monthly', firstDate: '2026-01-01' });
    // The candidate comes from Expense.amount, which is already base currency, so it must NOT
    // look foreign on a non-EUR deployment.
    expect(subCreate.mock.calls[0][0].currency).toBe('USD');
  });
});
