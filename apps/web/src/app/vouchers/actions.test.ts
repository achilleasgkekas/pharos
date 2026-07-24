import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/vouchers/actions.ts — the plain voucher/coupon CRUD + AI scan actions (NOT
// giftcardActions.ts/loyaltyActions.ts, which are separate modules in the same folder with
// their own test files). Never directly unit-tested before. Mirrors the DB-mock pattern from
// shopping-list/actions.test.ts (AI feature gate + vision/text parser mocked, aiError()
// friendly-message split) and giftcardActions.test.ts (safeDateOrNull left un-mocked — it is
// pure/deterministic and already has its own dedicated test file, so exercising the real
// implementation here pins the actual expiresAt handling end-to-end).
//
// Behaviour pinned:
//  - scanVoucherText/scanVoucherImage: short-circuit with a friendly error when the AI
//    feature is off, or (text) when the pasted text is blank / (image) when no file or an
//    empty file is given — parseVoucherText/parseVoucherImage are never called in those
//    cases. On AI failure, aiError() distinguishes an "AI not reachable" message for
//    connection-refused/fetch-failed/not-found errors from a generic truncated message.
//  - createVoucher/updateVoucher: Zod `VoucherFormSchema` parses FormData-shaped input with
//    its defaults (code/store/discount/url/notes default to ''), rejects a missing/empty
//    title, and runs `expiresAt` through safeDateOrNull (invalid/blank string → null, not
//    thrown). createVoucher always sets `used: false` regardless of any incoming field.
//  - toggleVoucherUsed: sets `used` to whatever boolean is passed, no other field touched.
//  - deleteVoucher: SOFT delete ($set deletedAt), not an actual document removal.

const {
  connectDBMock,
  voucherCreate,
  voucherFindByIdAndUpdate,
  voucherUpdateOne,
  isFeatureEnabledMock,
  parseVoucherTextMock,
  parseVoucherImageMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  voucherCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  voucherFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  voucherUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  parseVoucherTextMock: vi.fn(async (_text: string) => ({
    parsed: { title: 'SAVE10', code: '', store: '', discount: '', expiresAt: '', url: '', notes: '' },
    raw: '{}',
    model: 'test-model',
  })),
  parseVoucherImageMock: vi.fn(async (_b64: string) => ({
    parsed: { title: 'SAVE10', code: '', store: '', discount: '', expiresAt: '', url: '', notes: '' },
    raw: '{}',
    model: 'test-model',
  })),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Voucher', () => ({
  Voucher: {
    create: voucherCreate,
    findByIdAndUpdate: voucherFindByIdAndUpdate,
    updateOne: voucherUpdateOne,
  },
}));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/ollama', () => ({
  parseVoucherText: parseVoucherTextMock,
  parseVoucherImage: parseVoucherImageMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { scanVoucherText, scanVoucherImage, createVoucher, updateVoucher, toggleVoucherUsed, deleteVoucher } from './actions';

function fileOf(bytes: string, name = 'coupon.jpg'): File {
  return new File([bytes], name, { type: 'image/jpeg' });
}

function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// safeDateOrNull builds day-first EU dates as local midnight (no `Z`), so asserting via
// toISOString() would shift by a day depending on the machine's timezone offset. Compare
// local date parts instead, which is timezone-independent for a date constructed at local
// midnight.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  parseVoucherTextMock.mockResolvedValue({
    parsed: { title: 'SAVE10', code: '', store: '', discount: '', expiresAt: '', url: '', notes: '' },
    raw: '{}',
    model: 'test-model',
  });
  parseVoucherImageMock.mockResolvedValue({
    parsed: { title: 'SAVE10', code: '', store: '', discount: '', expiresAt: '', url: '', notes: '' },
    raw: '{}',
    model: 'test-model',
  });
  voucherFindByIdAndUpdate.mockResolvedValue({});
  voucherUpdateOne.mockResolvedValue({});
});

describe('scanVoucherText', () => {
  it('returns a friendly error when the AI feature is off, without calling the parser', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const result = await scanVoucherText('15% off SUMMER15');
    expect(result).toEqual({ ok: false, error: 'Voucher scanning (AI) is turned off.' });
    expect(parseVoucherTextMock).not.toHaveBeenCalled();
  });

  it('rejects blank/whitespace-only text before calling the parser', async () => {
    const result = await scanVoucherText('   ');
    expect(result).toEqual({ ok: false, error: 'Paste some voucher text first' });
    expect(parseVoucherTextMock).not.toHaveBeenCalled();
  });

  it('returns the parsed data on success', async () => {
    parseVoucherTextMock.mockResolvedValue({
      parsed: { title: 'SUMMER15', code: '', store: '', discount: '15%', expiresAt: '', url: '', notes: '' },
      raw: '{}',
      model: 'test-model',
    });
    const result = await scanVoucherText('15% off code SUMMER15');
    expect(result).toEqual({ ok: true, data: { title: 'SUMMER15', code: '', store: '', discount: '15%', expiresAt: '', url: '', notes: '' } });
    expect(parseVoucherTextMock).toHaveBeenCalledWith('15% off code SUMMER15');
  });

  it('maps a connection-refused error to a friendly "AI not reachable" message', async () => {
    parseVoucherTextMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));
    const result = await scanVoucherText('some voucher text');
    expect(result).toEqual({ ok: false, error: 'AI not reachable (check Ollama / provider)' });
  });

  it('truncates a generic parser error to a bounded "AI failed: ..." message', async () => {
    parseVoucherTextMock.mockRejectedValue(new Error('x'.repeat(300)));
    const result = await scanVoucherText('some voucher text');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.startsWith('AI failed: ')).toBe(true);
      expect(result.error.length).toBeLessThanOrEqual('AI failed: '.length + 120);
    }
  });
});

describe('scanVoucherImage', () => {
  it('returns a friendly error when the AI feature is off, without calling the parser', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const result = await scanVoucherImage(formOf({}));
    expect(result).toEqual({ ok: false, error: 'Voucher scanning (AI) is turned off.' });
    expect(parseVoucherImageMock).not.toHaveBeenCalled();
  });

  it('rejects when no file is provided', async () => {
    const result = await scanVoucherImage(new FormData());
    expect(result).toEqual({ ok: false, error: 'No image' });
    expect(parseVoucherImageMock).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const fd = new FormData();
    fd.set('file', fileOf(''));
    const result = await scanVoucherImage(fd);
    expect(result).toEqual({ ok: false, error: 'No image' });
    expect(parseVoucherImageMock).not.toHaveBeenCalled();
  });

  it('base64-encodes the file bytes and returns the parsed data on success', async () => {
    parseVoucherImageMock.mockResolvedValue({
      parsed: { title: 'SAVE10', code: '', store: 'Skroutz', discount: '', expiresAt: '', url: '', notes: '' },
      raw: '{}',
      model: 'test-model',
    });
    const fd = new FormData();
    fd.set('file', fileOf('fake-image-bytes'));
    const result = await scanVoucherImage(fd);
    expect(result).toEqual({ ok: true, data: { title: 'SAVE10', code: '', store: 'Skroutz', discount: '', expiresAt: '', url: '', notes: '' } });
    expect(parseVoucherImageMock).toHaveBeenCalledTimes(1);
    const b64 = parseVoucherImageMock.mock.calls[0][0];
    expect(Buffer.from(b64, 'base64').toString()).toBe('fake-image-bytes');
  });

  it('maps a fetch-failed error to a friendly "AI not reachable" message', async () => {
    parseVoucherImageMock.mockRejectedValue(new Error('fetch failed'));
    const fd = new FormData();
    fd.set('file', fileOf('bytes'));
    const result = await scanVoucherImage(fd);
    expect(result).toEqual({ ok: false, error: 'AI not reachable (check Ollama / provider)' });
  });
});

describe('createVoucher', () => {
  it('rejects a missing/empty title before touching the DB', async () => {
    await expect(createVoucher(formOf({ title: '' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('defaults optional fields, forces used:false, and parses a valid expiresAt', async () => {
    await createVoucher(formOf({ title: '10% off at Skroutz', expiresAt: '2026-12-31' }));
    expect(voucherCreate).toHaveBeenCalledTimes(1);
    const doc = voucherCreate.mock.calls[0][0];
    expect(doc.title).toBe('10% off at Skroutz');
    expect(doc.code).toBe('');
    expect(doc.store).toBe('');
    expect(doc.discount).toBe('');
    expect(doc.url).toBe('');
    expect(doc.notes).toBe('');
    expect(doc.used).toBe(false);
    expect(doc.expiresAt).toBeInstanceOf(Date);
    expect(localYmd(doc.expiresAt as Date)).toBe('2026-12-31');
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });

  it('accepts European day-first dates and falls back to null for an invalid/blank expiresAt', async () => {
    await createVoucher(formOf({ title: 'Free shipping', expiresAt: '31/12/2026' }));
    let doc = voucherCreate.mock.calls[0][0];
    expect(localYmd(doc.expiresAt as Date)).toBe('2026-12-31');

    voucherCreate.mockClear();
    await createVoucher(formOf({ title: 'No expiry voucher' }));
    doc = voucherCreate.mock.calls[0][0];
    expect(doc.expiresAt).toBeNull();
  });
});

describe('updateVoucher', () => {
  it('rejects a missing/empty title before touching the DB', async () => {
    await expect(updateVoucher('v1', formOf({ title: '' }))).rejects.toThrow();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(voucherFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('parses the form and updates by id, without forcing `used`', async () => {
    await updateVoucher('v1', formOf({ title: 'Updated title', store: 'Amazon', expiresAt: 'not-a-date' }));
    expect(voucherFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = voucherFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('v1');
    expect(update.title).toBe('Updated title');
    expect(update.store).toBe('Amazon');
    expect(update.expiresAt).toBeNull();
    expect(update.used).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('toggleVoucherUsed', () => {
  it('sets used:true and revalidates', async () => {
    await toggleVoucherUsed('v1', true);
    expect(voucherFindByIdAndUpdate).toHaveBeenCalledWith('v1', { used: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });

  it('sets used:false and revalidates', async () => {
    await toggleVoucherUsed('v1', false);
    expect(voucherFindByIdAndUpdate).toHaveBeenCalledWith('v1', { used: false });
  });
});

describe('deleteVoucher', () => {
  it('soft-deletes by setting deletedAt instead of removing the document', async () => {
    await deleteVoucher('v1');
    expect(voucherUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = voucherUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'v1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});
