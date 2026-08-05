import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/statements/actions.ts is a large multi-concern module (see actions.crud.test.ts's
// header for the full concern list + which slices already exist: crud, installments,
// reconcile, tenant). This file covers `categorizeStatement` — the one remaining exported
// action with ZERO coverage anywhere in the repo (confirmed via
// `grep -rln "categorizeStatement\b" --include="*.test.ts" src` before writing this file,
// which returned nothing). `rescanStatement` and the behaviour (not just tenant-routing)
// of `importStatementPdf`/`attachStatementPdf` are ALSO uncovered and deliberately left for
// their own future slices — this file is intentionally scoped to just categorizeStatement.
//
// Behaviour pinned:
//  - Gated by assertCanWrite (untested here, like every sibling statements slice: it
//    no-ops when getSessionUser() throws outside a request scope, which is what happens
//    in every one of these unit tests — the same reason no slice in this directory mocks
//    '@/lib/auth').
//  - The 'statementCategorize' AI feature flag is checked BEFORE connectDB/findById even
//    run — a disabled flag returns a fixed error and touches nothing else.
//  - A missing statement returns {ok:false, error:'Not found'} without calling
//    categorizeTransactions.
//  - Zero transactions short-circuits to {ok:true} WITHOUT ever calling
//    categorizeTransactions (nothing to categorize, not an error).
//  - categorizeTransactions throwing is caught and reported as "AI failed: <message>"
//    (truncated to 100 chars), the statement is never saved.
//  - A category-count mismatch (AI returned a different array length than the number of
//    transactions) is rejected BEFORE any category is applied or saved — no partial write.
//  - On a length match: each transaction's category is overwritten ONLY when the
//    corresponding AI result is truthy (falsy/blank entries leave the existing category
//    untouched, positionally) — then one save() + revalidatePath('/statements').

const {
  connectDBMock,
  statementFindById,
  isFeatureEnabledMock,
  categorizeTransactionsMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  statementFindById: vi.fn(async (_id: string): Promise<any> => null),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  categorizeTransactionsMock: vi.fn(async (_descriptions: string[]): Promise<string[]> => []),
  revalidatePathMock: vi.fn(),
}));

// Tenancy seam mocked flat (same as the sibling crud/installments/reconcile slices): tenant
// ROUTING itself is pinned separately in actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Statement', () => ({ Statement: { findById: statementFindById } }));
vi.mock('@/models/Card', () => ({ Card: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn(), readFile: vi.fn() }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: vi.fn(), categorizeTransactions: categorizeTransactionsMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/cards', () => ({ normalizeLast4: (s: string) => s, detectCardType: () => 'credit', buildCardLabel: (n: string, l: string) => `${n} ${l}` }));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/installments', () => ({ installmentSignature: vi.fn(() => '') }));
vi.mock('@/lib/reconcile', () => ({ reconcile: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { categorizeStatement } from './actions';

function stmtOf(transactions: Array<{ description: string; category?: string }>) {
  return {
    transactions,
    save: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  statementFindById.mockImplementation(async () => null);
  isFeatureEnabledMock.mockImplementation(async () => true);
  categorizeTransactionsMock.mockImplementation(async () => []);
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('categorizeStatement', () => {
  it('checks the statementCategorize feature flag before touching the DB at all', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const res = await categorizeStatement('s1');
    expect(res).toEqual({ ok: false, error: 'Auto-categorize (AI) is turned off.' });
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('statementCategorize');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(statementFindById).not.toHaveBeenCalled();
  });

  it('reports "Not found" for a missing statement, never calling categorizeTransactions', async () => {
    statementFindById.mockResolvedValue(null);
    const res = await categorizeStatement('missing');
    expect(res).toEqual({ ok: false, error: 'Not found' });
    expect(categorizeTransactionsMock).not.toHaveBeenCalled();
  });

  it('short-circuits to ok:true on zero transactions, without ever calling categorizeTransactions', async () => {
    statementFindById.mockResolvedValue(stmtOf([]));
    const res = await categorizeStatement('s1');
    expect(res).toEqual({ ok: true });
    expect(categorizeTransactionsMock).not.toHaveBeenCalled();
  });

  it('reports a truncated "AI failed" error when categorizeTransactions throws, and never saves', async () => {
    const stmt = stmtOf([{ description: 'COFFEE SHOP' }]);
    statementFindById.mockResolvedValue(stmt);
    categorizeTransactionsMock.mockRejectedValue(new Error('x'.repeat(200)));
    const res = await categorizeStatement('s1');
    expect(res.ok).toBe(false);
    expect(res.error).toBe(`AI failed: ${'x'.repeat(100)}`);
    expect(stmt.save).not.toHaveBeenCalled();
  });

  it('rejects a category-count mismatch before applying or saving anything', async () => {
    const stmt = stmtOf([{ description: 'A' }, { description: 'B' }]);
    statementFindById.mockResolvedValue(stmt);
    categorizeTransactionsMock.mockResolvedValue(['groceries']); // only 1 for 2 transactions
    const res = await categorizeStatement('s1');
    expect(res).toEqual({ ok: false, error: 'The AI returned the wrong number of categories' });
    expect(stmt.save).not.toHaveBeenCalled();
    expect(stmt.transactions[0].category).toBeUndefined();
  });

  it('applies each category positionally, saves once, and revalidates /statements', async () => {
    const stmt = stmtOf([{ description: 'COFFEE SHOP' }, { description: 'ELECTRIC CO' }]);
    statementFindById.mockResolvedValue(stmt);
    categorizeTransactionsMock.mockResolvedValue(['dining', 'utilities']);
    const res = await categorizeStatement('s1');
    expect(res).toEqual({ ok: true });
    expect(stmt.transactions[0].category).toBe('dining');
    expect(stmt.transactions[1].category).toBe('utilities');
    expect(stmt.save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });

  it('leaves the existing category untouched when the AI returns a falsy entry for that position', async () => {
    const stmt = stmtOf([{ description: 'A', category: 'existing' }, { description: 'B' }]);
    statementFindById.mockResolvedValue(stmt);
    categorizeTransactionsMock.mockResolvedValue(['', 'utilities']);
    const res = await categorizeStatement('s1');
    expect(res).toEqual({ ok: true });
    expect(stmt.transactions[0].category).toBe('existing'); // untouched, not blanked
    expect(stmt.transactions[1].category).toBe('utilities');
  });

  it('passes the full list of transaction descriptions to categorizeTransactions, in order', async () => {
    const stmt = stmtOf([{ description: 'A' }, { description: 'B' }, { description: 'C' }]);
    statementFindById.mockResolvedValue(stmt);
    categorizeTransactionsMock.mockResolvedValue(['x', 'y', 'z']);
    await categorizeStatement('s1');
    expect(categorizeTransactionsMock).toHaveBeenCalledWith(['A', 'B', 'C']);
  });
});
