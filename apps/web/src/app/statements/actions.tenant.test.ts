import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant } from '@/lib/tenancy/current';
import type { TenantContext } from '@/lib/tenancy/context';

// statements/actions.ts imported Statement/Card/Receipt directly, so in SaaS mode every
// statement read and write went to the DEFAULT tenant db no matter who was logged in — while
// the sibling FX-audit feature (lib/fxAudit.ts, reports/fxActions.ts) already reached the very
// same collection through `currentModel()`. That asymmetry is what these tests pin: each
// exported action must touch its collections inside `withRequestTenant`, so the row lands in
// (and comes back from) the CURRENT tenant's db.
//
// (Own file, like bills/actions.tenant.test.ts: it mocks the tenancy seam tenant-aware, while
// actions.crud/installments/reconcile.test.ts mock it flat to pin the behaviour itself.)

// One fake model set per tenant, tagged with the tenant it belongs to. Every DB touch records
// into that tenant's own log, so a leak to the wrong db is directly observable.
type Op = { model: string; op: string };
const ops = new Map<string, Op[]>();

function log(tag: string, model: string, op: string) {
  const list = ops.get(tag) ?? [];
  list.push({ model, op });
  ops.set(tag, list);
}
const opsOf = (tag: string) => (ops.get(tag) ?? []).map((o) => `${o.model}.${o.op}`);

/** A statement document rich enough for the code paths under test. */
function fakeDoc(tag: string) {
  return {
    _id: 's1',
    period: '2026-06',
    filePath: 'statements/x.pdf',
    fxRate: 0,
    currency: '',
    statementDate: new Date('2026-06-10'),
    transactions: Object.assign([] as any[], {
      id: () => ({ description: 'CHARGE', installmentInfo: null, matchedReceiptId: null }),
    }),
    markModified: () => {},
    save: async () => log(tag, 'Statement', 'save'),
  };
}

function makeStatementModel(tag: string) {
  // `.select().lean()` and `.lean()` chains, plus the plain awaited `find()`.
  const chain = (rows: any[]) => ({
    select: () => ({ lean: async () => rows }),
    lean: async () => rows,
    then: (res: (v: any[]) => unknown) => res(rows),
  });
  return {
    modelName: 'Statement',
    create: async (doc: Record<string, any>) => {
      log(tag, 'Statement', 'create');
      return { ...doc, _id: 's1' };
    },
    find: (..._args: unknown[]) => {
      log(tag, 'Statement', 'find');
      return chain([]);
    },
    findOne: (..._args: unknown[]) => {
      log(tag, 'Statement', 'findOne');
      return chain([] as any) as any;
    },
    findById: (_id: string) => {
      log(tag, 'Statement', 'findById');
      const doc = fakeDoc(tag);
      return Object.assign(Promise.resolve(doc), { lean: async () => doc });
    },
    findByIdAndUpdate: async () => log(tag, 'Statement', 'findByIdAndUpdate'),
    findByIdAndDelete: async () => log(tag, 'Statement', 'findByIdAndDelete'),
    findOneAndUpdate: async () => {
      log(tag, 'Statement', 'findOneAndUpdate');
      return { _id: 's1', statementDate: new Date('2026-06-10') };
    },
  };
}

function makeCardModel(tag: string) {
  return {
    modelName: 'Card',
    findOne: async () => {
      log(tag, 'Card', 'findOne');
      return null;
    },
    create: async (doc: Record<string, any>) => {
      log(tag, 'Card', 'create');
      return { ...doc, _id: 'c1' };
    },
  };
}

function makeReceiptModel(tag: string) {
  return {
    modelName: 'Receipt',
    find: () => {
      log(tag, 'Receipt', 'find');
      return { select: () => ({ lean: async () => [] }) };
    },
  };
}

vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (m: { modelName: string }) => {
    const { currentTenant } = await import('@/lib/tenancy/current');
    const ctx = currentTenant();
    const tag = ctx.isDefault || !ctx.tenantId ? 'default' : ctx.slug;
    if (m.modelName === 'Card') return makeCardModel(tag);
    if (m.modelName === 'Receipt') return makeReceiptModel(tag);
    return makeStatementModel(tag);
  },
}));
// The real wrapper resolves the tenant from request headers (none in a unit test), so run the
// body inside whatever tenant the test established with `withTenant`.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Deliberately empty: if a direct `Statement.create(...)` ever comes back, it throws here.
vi.mock('@/models/Statement', () => ({ Statement: { modelName: 'Statement' } }));
vi.mock('@/models/Card', () => ({ Card: { modelName: 'Card' } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { modelName: 'Receipt' } }));
vi.mock('@/lib/storage', () => ({
  saveFile: async () => ({ relativePath: 'statements/x.pdf' }),
  deleteFile: async () => {},
  readFile: async () => Buffer.from(''),
}));
vi.mock('@/lib/pdf', () => ({ extractPdfText: async () => 'a long statement text', looksLikeScannedPdf: () => false }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: async () => '' }));
vi.mock('@/lib/ollama', () => ({
  parseStatementText: async () => ({
    parsed: { card: 'Mastercard', last4: '7791', statementDate: '2026-06-10', totalAmount: 100, minimumPayment: 10, transactions: [] },
  }),
  categorizeTransactions: async () => [],
}));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: async () => true }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ currency: 'EUR' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import {
  createStatement,
  updateStatement,
  deleteStatement,
  addTransaction,
  deleteTransaction,
  setTransactionInstallment,
  linkPlanToItem,
  getReconciliation,
  importStatementPdf,
  attachStatementPdf,
} from './actions';

const acme: TenantContext = {
  tenantId: '507f1f77bcf86cd799439011',
  slug: 'acme',
  dbName: 'tenant_acme',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

const globex: TenantContext = {
  tenantId: '507f1f77bcf86cd799439012',
  slug: 'globex',
  dbName: 'tenant_globex',
  plan: 'shared',
  status: 'active',
  isDefault: false,
};

function statementForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('card', 'Mastercard 7791');
  fd.set('period', '2026-06');
  fd.set('statementDate', '2026-06-10');
  fd.set('totalAmount', '100');
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function pdfForm(): FormData {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array([1, 2, 3])], 'statement.pdf', { type: 'application/pdf' }));
  return fd;
}

beforeEach(() => {
  ops.clear();
});

describe('statements actions — tenant routing', () => {
  it('createStatement writes into the CURRENT tenant db, not the default one', async () => {
    await withTenant(acme, () => createStatement(statementForm()));

    expect(opsOf('acme')).toEqual(['Statement.create']);
    expect(ops.get('default')).toBeUndefined();
    expect(ops.get('globex')).toBeUndefined();
  });

  it('keeps two tenants writing to their own db', async () => {
    await withTenant(acme, () => createStatement(statementForm()));
    await withTenant(globex, () => createStatement(statementForm()));

    expect(opsOf('acme')).toEqual(['Statement.create']);
    expect(opsOf('globex')).toEqual(['Statement.create']);
  });

  it('routes update / delete / transaction edits through the tenant model', async () => {
    await withTenant(acme, async () => {
      await updateStatement('s1', statementForm());
      await deleteStatement('s1');
      await addTransaction('s1', (() => {
        const fd = new FormData();
        fd.set('date', '2026-06-05');
        fd.set('description', 'CHARGE');
        fd.set('amount', '10');
        return fd;
      })());
      await deleteTransaction('s1', 't1');
      await attachStatementPdf('s1', pdfForm());
    });

    expect(opsOf('acme')).toEqual([
      'Statement.findById',
      'Statement.findByIdAndUpdate',
      'Statement.findById',
      'Statement.findByIdAndDelete',
      'Statement.findById',
      'Statement.findByIdAndUpdate',
      'Statement.findByIdAndUpdate',
      'Statement.findByIdAndUpdate',
    ]);
    expect(ops.get('default')).toBeUndefined();
  });

  it('setTransactionInstallment reads AND saves the same tenant db', async () => {
    await withTenant(acme, () => setTransactionInstallment('s1', 't1', 1, 12));

    expect(opsOf('acme')).toEqual(['Statement.findById', 'Statement.save']);
    expect(ops.get('default')).toBeUndefined();
  });

  it('the signature-based link helpers inherit the ambient tenant', async () => {
    // linkPlanToItem delegates to the internal addItemBySignature, which resolves its own
    // model — the regression this pins is that helper falling back to the default db.
    await withTenant(acme, () => linkPlanToItem('SIG|100|2026-05', '507f1f77bcf86cd799439013'));

    expect(opsOf('acme')).toEqual(['Statement.find']);
    expect(ops.get('default')).toBeUndefined();
  });

  it('getReconciliation reads statements AND receipts from the same tenant db', async () => {
    const res = await withTenant(acme, () => getReconciliation('507f1f77bcf86cd799439011'));

    expect(res.ok).toBe(true);
    expect(opsOf('acme')).toEqual(['Statement.findById', 'Receipt.find', 'Statement.find']);
    expect(ops.get('default')).toBeUndefined();
  });

  it('importStatementPdf puts the statement AND its auto-created card in the tenant db', async () => {
    const res = await withTenant(acme, () => importStatementPdf(pdfForm()));

    expect(res.ok).toBe(true);
    // Card.findOne/create prove findOrCreateCard is tenant-scoped too — a card created in the
    // default db would leave the tenant's statements pointing at a cardId it cannot resolve.
    expect(opsOf('acme')).toEqual([
      'Statement.find',
      'Card.findOne', // by last4
      'Card.findOne', // then by name
      'Card.create',
      'Statement.findOne',
      'Statement.findOneAndUpdate',
    ]);
    expect(ops.get('default')).toBeUndefined();
  });

  it('still works with no tenant established (self-hosted default connection)', async () => {
    await createStatement(statementForm());

    expect(opsOf('default')).toEqual(['Statement.create']);
    expect(ops.get('acme')).toBeUndefined();
  });
});
