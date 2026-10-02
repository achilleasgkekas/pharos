import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/inboxActions.ts: the AI inbox. Mocks the AI calls, the scans, storage and the models.
const { runVisionJSON, runTextJSON, featureOn, scanHomeFile, saveFile, billCreate, docCreate } = vi.hoisted(() => ({
  runVisionJSON: vi.fn(),
  runTextJSON: vi.fn(),
  featureOn: vi.fn(async (_k: string) => true),
  scanHomeFile: vi.fn(),
  saveFile: vi.fn(async () => ({ relativePath: 'equipment/x.jpg', filePath: '/s/equipment/x.jpg' })),
  billCreate: vi.fn(async (d: Record<string, unknown>) => ({ _id: 'b1', ...d })),
  docCreate: vi.fn(async (d: Record<string, unknown>) => ({ _id: 'd1', ...d })),
}));

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: async () => undefined, requireUser: async () => undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: featureOn }));
vi.mock('@/lib/ollama', () => ({ runVisionJSON, runTextJSON }));
vi.mock('@/lib/pdf', () => ({ extractPdfText: async () => 'ΔΕΗ Λογαριασμός ρεύματος ποσό 84,37 λήξη 20/10/2026', looksLikeScannedPdf: () => false }));
vi.mock('@/lib/pdfThumb', () => ({ pdfFirstPageJpeg: async () => Buffer.from('jpg') }));
vi.mock('@/lib/storage', () => ({ saveFile }));
vi.mock('@/lib/homeScan.server', () => ({ scanHomeFile }));
vi.mock('@/models/Bill', () => ({ Bill: { create: billCreate } }));
vi.mock('@/models/Document', () => ({ Document: { create: docCreate } }));

import { classifyInboxFile, inboxToBill, inboxToDocument } from './inboxActions';

const form = (name: string, type = 'image/jpeg') => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array([1, 2, 3])], name, { type }));
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe('classifyInboxFile', () => {
  it('reads a photo and returns a cleaned guess', async () => {
    runVisionJSON.mockResolvedValueOnce({ json: { destination: 'expense', alternatives: ['receipt'], title: 'efood', amount: 18.5, date: '2026-09-30', why: 'Delivery order' } });
    const r = await classifyInboxFile(form('order.png'));
    expect(r).toMatchObject({ ok: true, guess: { destination: 'expense', title: 'efood', amount: 18.5 } });
    expect(runVisionJSON.mock.calls[0][3]).toEqual({ feature: 'inbox', trigger: 'user' });
  });
  it('reads a PDF with text as text', async () => {
    runTextJSON.mockResolvedValueOnce({ json: { destination: 'bill' } });
    const r = await classifyInboxFile(form('dei.pdf', 'application/pdf'));
    expect(r).toMatchObject({ ok: true, guess: { destination: 'bill' } });
    expect(runVisionJSON).not.toHaveBeenCalled();
  });
  it('stops when the feature is off or the file is wrong', async () => {
    featureOn.mockResolvedValueOnce(false);
    expect((await classifyInboxFile(form('a.jpg'))).ok).toBe(false);
    expect(await classifyInboxFile(form('a.exe'))).toEqual({ ok: false, error: 'Use a photo or a PDF' });
    expect(await classifyInboxFile(new FormData())).toEqual({ ok: false, error: 'No file' });
    expect(runVisionJSON).not.toHaveBeenCalled();
  });
  it('reports an unreachable provider', async () => {
    runVisionJSON.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await classifyInboxFile(form('a.jpg'))).toEqual({ ok: false, error: 'AI not reachable (check the AI provider)' });
  });
});

describe('inboxToBill / inboxToDocument', () => {
  it('creates a bill from the scan and keeps the file', async () => {
    scanHomeFile.mockResolvedValueOnce({ vendor: 'ΔΕΗ', title: 'ΔΕΗ ρεύμα', amount: 84.37, dueDate: '2026-10-20', paymentCode: 'RF12', periodFrom: '', periodTo: '', category: 'electricity' });
    const r = await inboxToBill(form('dei.pdf', 'application/pdf'), { title: 'x' });
    expect(r).toEqual({ ok: true, id: 'b1' });
    const doc = billCreate.mock.calls[0][0];
    expect(doc).toMatchObject({ title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 84.37, category: 'electricity', notes: 'Payment code: RF12' });
    expect(doc.dueDate).toEqual(new Date('2026-10-20T12:00:00Z'));
    expect((doc.attachments as unknown[])[0]).toMatchObject({ path: 'equipment/x.jpg', name: 'dei.pdf', mimeType: 'application/pdf' });
  });
  it('falls back to the guess when the bill scan is off', async () => {
    featureOn.mockImplementation(async (k: string) => k !== 'bills');
    await inboxToBill(form('b.jpg'), { title: 'Water co', amount: 30, date: '2026-11-01' });
    expect(scanHomeFile).not.toHaveBeenCalled();
    expect(billCreate.mock.calls[0][0]).toMatchObject({ title: 'Water co', amount: 30, category: 'utilities' });
    featureOn.mockImplementation(async () => true);
  });
  it('creates a document and notes a missing expiry', async () => {
    scanHomeFile.mockResolvedValueOnce({ title: 'Passport', type: 'passport', holder: 'A', number: 'X1', issuedAt: '', expiryDate: '' });
    const r = await inboxToDocument(form('pass.jpg'), {});
    expect(r).toEqual({ ok: true, id: 'd1' });
    const doc = docCreate.mock.calls[0][0];
    expect(doc).toMatchObject({ title: 'Passport', type: 'passport', number: 'X1' });
    expect(doc.notes).toMatch(/No expiry/);
    expect(doc.attachments).toHaveLength(1);
  });
});
