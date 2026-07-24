import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/statements/actions.ts is a large multi-concern module (929 lines: CRUD, installment
// signature-linking, receipt<->transaction reconciliation, AI categorize/import/rescan). This
// file covers ONLY the plain CRUD + transaction-array slice, the most isolated concern —
// createStatement/updateStatement/deleteStatement/addTransaction/deleteTransaction. The
// AI-driven import/rescan/categorize and the signature-based installment linking are separate
// concerns left for their own focused test files in later runs.
//
// Behaviour pinned:
//  - createStatement/updateStatement: Zod `StatementFormSchema` parses FormData-shaped input
//    (card required, period must match YYYY-MM, totalAmount/minimumPayment/paidAmount coerced
//    to numbers with 0 defaults, dueDate optional/blank-safe via safeDateOrNull). safeDate/
//    safeDateOrNull are left un-mocked (pure/deterministic, already pinned in lib/dates.test.ts)
//    so the real EU-date handling is exercised end-to-end.
//  - deleteStatement: best-effort deletes the attached PDF file first (swallows a missing-file
//    error so a broken/already-gone file never blocks the DB delete), then deletes the doc.
//    When there is no filePath, deleteFile is never called.
//  - addTransaction: builds installmentInfo only when BOTH currentInstallment and
//    totalInstallments are provided (either one alone -> null), $push's onto the transactions
//    array via findByIdAndUpdate (no full-document read).
//  - deleteTransaction: $pull's the transactions array by subdocument _id via findByIdAndUpdate.
//  - Every mutator calls revalidatePath('/statements').

const {
  connectDBMock,
  statementCreate,
  statementFindByIdAndUpdate,
  statementFindById,
  statementFindByIdAndDelete,
  deleteFileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  statementCreate: vi.fn(async (_doc: Record<string, any>) => ({})),
  statementFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  statementFindById: vi.fn(async (_id: string) => null as any),
  statementFindByIdAndDelete: vi.fn(async (_id: string) => ({})),
  deleteFileMock: vi.fn(async (_path: string) => {}),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Statement', () => ({
  Statement: {
    create: statementCreate,
    findByIdAndUpdate: statementFindByIdAndUpdate,
    findById: statementFindById,
    findByIdAndDelete: statementFindByIdAndDelete,
  },
}));
vi.mock('@/models/Card', () => ({ Card: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: vi.fn() } }));
vi.mock('@/lib/storage', () => ({
  saveFile: vi.fn(async () => ({ relativePath: 'statements/test.pdf' })),
  deleteFile: deleteFileMock,
  readFile: vi.fn(async () => Buffer.from('')),
}));
vi.mock('@/lib/pdf', () => ({ extractPdfText: vi.fn(), looksLikeScannedPdf: vi.fn() }));
vi.mock('@/lib/ocr', () => ({ ocrPdf: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseStatementText: vi.fn(), categorizeTransactions: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/cards', () => ({
  normalizeLast4: (s: string) => s,
  detectCardType: () => 'credit',
  buildCardLabel: (name: string, last4: string) => `${name} ${last4}`,
}));
vi.mock('@/lib/mirror', () => ({ mirrorFileToRemote: vi.fn() }));
vi.mock('@/lib/installments', () => ({ installmentSignature: vi.fn(() => '') }));
vi.mock('@/lib/reconcile', () => ({ reconcile: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { createStatement, updateStatement, deleteStatement, addTransaction, deleteTransaction } from './actions';

function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const validStatementFields = {
  card: 'Mastercard 7791',
  period: '2026-06',
  statementDate: '2026-06-03',
  totalAmount: '0',
};

beforeEach(() => {
  vi.clearAllMocks();
  statementFindById.mockResolvedValue(null);
});

describe('createStatement', () => {
  it('rejects a missing card before touching the DB', async () => {
    await expect(createStatement(formOf({ ...validStatementFields, card: '' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(statementCreate).not.toHaveBeenCalled();
  });

  it('rejects a period not shaped like YYYY-MM before touching the DB', async () => {
    await expect(createStatement(formOf({ ...validStatementFields, period: 'June 2026' }))).rejects.toThrow();
    expect(statementCreate).not.toHaveBeenCalled();
  });

  it('parses defaults, coerces numeric fields, and creates with a Date statementDate', async () => {
    await createStatement(formOf(validStatementFields));
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(statementCreate).toHaveBeenCalledTimes(1);
    const doc = statementCreate.mock.calls[0][0];
    expect(doc.card).toBe('Mastercard 7791');
    expect(doc.period).toBe('2026-06');
    expect(doc.statementDate).toBeInstanceOf(Date);
    expect(localYmd(doc.statementDate as Date)).toBe('2026-06-03');
    expect(doc.minimumPayment).toBe(0);
    expect(doc.paidAmount).toBe(0);
    expect(doc.notes).toBe('');
    expect(doc.dueDate).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });

  it('coerces totalAmount/minimumPayment/paidAmount from string form fields', async () => {
    await createStatement(formOf({ ...validStatementFields, totalAmount: '245.90', minimumPayment: '20', paidAmount: '245.90' }));
    const doc = statementCreate.mock.calls[0][0];
    expect(doc.totalAmount).toBe(245.9);
    expect(doc.minimumPayment).toBe(20);
    expect(doc.paidAmount).toBe(245.9);
  });

  it('parses a European day-first dueDate and falls back to undefined for a blank one', async () => {
    await createStatement(formOf({ ...validStatementFields, dueDate: '15/07/2026' }));
    let doc = statementCreate.mock.calls[0][0];
    expect(localYmd(doc.dueDate as Date)).toBe('2026-07-15');

    statementCreate.mockClear();
    await createStatement(formOf(validStatementFields));
    doc = statementCreate.mock.calls[0][0];
    expect(doc.dueDate).toBeUndefined();
  });
});

describe('updateStatement', () => {
  it('rejects an invalid period before touching the DB', async () => {
    await expect(updateStatement('s1', formOf({ ...validStatementFields, period: 'bad' }))).rejects.toThrow();
    expect(statementFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('updates by id with the parsed fields, including a null dueDate for a blank/invalid input', async () => {
    await updateStatement('s1', formOf({ ...validStatementFields, dueDate: 'not-a-date' }));
    expect(statementFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = statementFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('s1');
    expect(update.card).toBe('Mastercard 7791');
    expect(update.dueDate).toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});

describe('deleteStatement', () => {
  it('deletes the attached file first, then the document', async () => {
    statementFindById.mockResolvedValue({ filePath: 'statements/2026-06.pdf' });
    await deleteStatement('s1');
    expect(deleteFileMock).toHaveBeenCalledWith('statements/2026-06.pdf');
    expect(statementFindByIdAndDelete).toHaveBeenCalledWith('s1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });

  it('skips the file delete when there is no filePath', async () => {
    statementFindById.mockResolvedValue({ filePath: '' });
    await deleteStatement('s1');
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(statementFindByIdAndDelete).toHaveBeenCalledWith('s1');
  });

  it('swallows a failed file delete (e.g. file already gone) and still deletes the document', async () => {
    statementFindById.mockResolvedValue({ filePath: 'statements/missing.pdf' });
    deleteFileMock.mockRejectedValue(new Error('ENOENT'));
    await expect(deleteStatement('s1')).resolves.toBeUndefined();
    expect(statementFindByIdAndDelete).toHaveBeenCalledWith('s1');
  });
});

describe('addTransaction', () => {
  it('rejects a missing description before touching the DB', async () => {
    await expect(addTransaction('s1', formOf({ date: '2026-06-03', description: '', amount: '10' }))).rejects.toThrow();
    expect(statementFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('$pushes a transaction with installmentInfo:null when installment fields are absent', async () => {
    await addTransaction('s1', formOf({ date: '2026-06-03', description: 'PLAISIO', amount: '39.47' }));
    expect(statementFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = statementFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('s1');
    const pushed = update.$push.transactions;
    expect(pushed.description).toBe('PLAISIO');
    expect(pushed.amount).toBe(39.47);
    expect(pushed.category).toBe('uncategorized');
    expect(pushed.installmentInfo).toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });

  it('builds installmentInfo only when BOTH currentInstallment and totalInstallments are given', async () => {
    await addTransaction(
      's1',
      formOf({ date: '2026-06-03', description: 'PLAISIO 09/12', amount: '39.47', currentInstallment: '9', totalInstallments: '12' })
    );
    const update = statementFindByIdAndUpdate.mock.calls[0][1];
    expect(update.$push.transactions.installmentInfo).toEqual({
      currentInstallment: 9,
      totalInstallments: 12,
      originalPurchase: 'PLAISIO 09/12',
    });

    statementFindByIdAndUpdate.mockClear();
    await addTransaction('s1', formOf({ date: '2026-06-03', description: 'PLAISIO', amount: '39.47', currentInstallment: '9' }));
    const update2 = statementFindByIdAndUpdate.mock.calls[0][1];
    expect(update2.$push.transactions.installmentInfo).toBeNull();
  });

  it('coerces the amount from a string form field and applies the category default', async () => {
    await addTransaction('s1', formOf({ date: '2026-06-03', description: 'KOTSOVOLOS', amount: '25.25', category: 'electronics' }));
    const update = statementFindByIdAndUpdate.mock.calls[0][1];
    expect(update.$push.transactions.amount).toBe(25.25);
    expect(update.$push.transactions.category).toBe('electronics');
  });
});

describe('deleteTransaction', () => {
  it('$pulls the transaction by subdocument id via findByIdAndUpdate', async () => {
    await deleteTransaction('s1', 'tx1');
    expect(statementFindByIdAndUpdate).toHaveBeenCalledWith('s1', { $pull: { transactions: { _id: 'tx1' } } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});
