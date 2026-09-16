import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/shopping-list/actions.ts — the lightweight "to-buy" list (add/toggle/delete/clear
// + an optional AI product-photo scan), never directly unit-tested before. Mirrors the
// DB-mock pattern from bills/actions.test.ts: mock only the DB seam (connectDB/
// ShoppingListItem), next/cache's revalidatePath, the AI feature gate
// (`isFeatureEnabled`), and the vision parser (`parseProductPhoto`) — the AI call itself
// belongs to lib/ollama.ts, not this module.
//
// Behaviour pinned:
//  - serialize(): every optional field (quantity/category/brand/note) defaults to '' when
//    absent on the lean doc, checked/aiScanned coerce to booleans via `!!`.
//  - scanProductPhoto: short-circuits with a friendly error when the AI feature is off, or
//    when no file / an empty file is given — parseProductPhoto is never called in those
//    cases. On AI failure, aiError() distinguishes an "AI not reachable" message for
//    connection-refused/fetch-failed/not-found errors from a generic truncated message.
//  - addListItem: every free-text field is trimmed, checked is always forced to false
//    regardless of input, and a blank/whitespace-only name is rejected before connectDB.
//  - updateListItem/toggleListItem/deleteListItem: report `found` from matchedCount, not
//    from an assumed success; updateListItem only $sets the keys actually present on the
//    partial (undefined keys are left untouched, not overwritten with '').
//  - deleteListItem: SOFT delete ($set deletedAt), not an actual removal.
//  - clearChecked: only targets checked:true docs, reports modifiedCount as `cleared`.

const {
  connectDBMock,
  itemFind,
  itemCreate,
  itemUpdateOne,
  itemUpdateMany,
  isFeatureEnabledMock,
  parseProductPhotoMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn(async () => [] as Record<string, unknown>[]),
  itemCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  itemUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({ matchedCount: 1 })),
  itemUpdateMany: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({ modifiedCount: 0 })),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  parseProductPhotoMock: vi.fn(async (_b64: string) => ({ parsed: { name: 'Milk' }, raw: '{}', model: 'test-model' })),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
// Flat tenancy seam: this file pins the CRUD behaviour itself. The tenant ROUTING is pinned
// tenant-aware in the sibling actions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));
vi.mock('@/models/ShoppingListItem', () => ({
  ShoppingListItem: {
    find: () => ({ sort: () => ({ lean: itemFind }) }),
    create: itemCreate,
    updateOne: itemUpdateOne,
    updateMany: itemUpdateMany,
  },
}));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/ollama', () => ({ parseProductPhoto: parseProductPhotoMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { getListItems, scanProductPhoto, addListItem, updateListItem, toggleListItem, deleteListItem, clearChecked } from './actions';

function fileOf(bytes: string, name = 'photo.jpg'): File {
  return new File([bytes], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  itemFind.mockImplementation(async () => []);
  itemCreate.mockImplementation(async () => ({}));
  itemUpdateOne.mockImplementation(async () => ({ matchedCount: 1 }));
  itemUpdateMany.mockImplementation(async () => ({ modifiedCount: 0 }));
  isFeatureEnabledMock.mockImplementation(async () => true);
  parseProductPhotoMock.mockImplementation(async () => ({ parsed: { name: 'Milk' }, raw: '{}', model: 'test-model' }));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('getListItems', () => {
  it('serializes optional fields to "" when absent, and coerces checked/aiScanned to booleans', async () => {
    itemFind.mockResolvedValueOnce([
      { _id: 'a1', name: 'Bread', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res = await getListItems();
    expect(res).toEqual([{
      _id: 'a1', name: 'Bread', quantity: '', category: '', brand: '', note: '',
      checked: false, aiScanned: false, restockIntervalDays: null, lastRestockedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
    }]);
  });

  it('re-surfaces due recurring items before returning the refreshed list', async () => {
    await getListItems();
    expect(itemUpdateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = itemUpdateMany.mock.calls[0];
    expect(filter).toMatchObject({ checked: true, restockIntervalDays: { $gt: 0 }, lastRestockedAt: { $type: 'date' } });
    expect((filter.$expr as any).$lte[1].$subtract[1]).toEqual({ $multiply: ['$restockIntervalDays', 86_400_000] });
    expect(update).toEqual({ $set: { checked: false } });
  });

  it('passes through explicit field values and truthy checked/aiScanned', async () => {
    itemFind.mockResolvedValueOnce([
      { _id: 'a2', name: 'Milk', quantity: '2L', category: 'dairy', brand: 'Farma', note: 'lactose-free', checked: true, aiScanned: true, createdAt: new Date('2026-02-02T00:00:00Z') },
    ]);
    const res = await getListItems();
    expect(res[0]).toMatchObject({ quantity: '2L', category: 'dairy', brand: 'Farma', note: 'lactose-free', checked: true, aiScanned: true });
  });
});

describe('scanProductPhoto', () => {
  it('is refused with a friendly error when the AI feature is off, without touching the parser', async () => {
    isFeatureEnabledMock.mockResolvedValueOnce(false);
    const fd = new FormData();
    fd.set('file', fileOf('x'));
    const res = await scanProductPhoto(fd);
    expect(res).toEqual({ ok: false, error: 'Product photo scanning (AI) is turned off.' });
    expect(parseProductPhotoMock).not.toHaveBeenCalled();
  });

  it('rejects when no file field is present', async () => {
    const res = await scanProductPhoto(new FormData());
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(parseProductPhotoMock).not.toHaveBeenCalled();
  });

  it('rejects an empty (0-byte) file', async () => {
    const fd = new FormData();
    fd.set('file', fileOf(''));
    const res = await scanProductPhoto(fd);
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(parseProductPhotoMock).not.toHaveBeenCalled();
  });

  it('on success, base64-encodes the file bytes and returns the parsed product', async () => {
    const fd = new FormData();
    fd.set('file', fileOf('hello'));
    const res = await scanProductPhoto(fd);
    expect(res).toEqual({ ok: true, data: { name: 'Milk' } });
    expect(parseProductPhotoMock).toHaveBeenCalledTimes(1);
    expect(parseProductPhotoMock.mock.calls[0][0]).toBe(Buffer.from('hello').toString('base64'));
  });

  it('maps a connection-refused failure to a friendly "AI not reachable" message', async () => {
    parseProductPhotoMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:11434'));
    const fd = new FormData();
    fd.set('file', fileOf('x'));
    const res = await scanProductPhoto(fd);
    expect(res).toEqual({ ok: false, error: 'AI not reachable (check Ollama / provider)' });
  });

  it('maps any other failure to a truncated generic "AI failed" message', async () => {
    parseProductPhotoMock.mockRejectedValueOnce(new Error('schema validation exploded'));
    const fd = new FormData();
    fd.set('file', fileOf('x'));
    const res = await scanProductPhoto(fd);
    expect(res).toEqual({ ok: false, error: 'AI failed: schema validation exploded' });
  });
});

describe('addListItem', () => {
  it('trims every free-text field and forces checked:false regardless of input', async () => {
    const res = await addListItem({ name: '  Eggs  ', quantity: ' 12 ', category: ' dairy ', brand: ' Farma ', note: ' fresh ', aiScanned: true });
    expect(res).toEqual({ ok: true });
    expect(itemCreate).toHaveBeenCalledTimes(1);
    expect(itemCreate.mock.calls[0][0]).toEqual({
      name: 'Eggs', quantity: '12', category: 'dairy', brand: 'Farma', note: 'fresh', aiScanned: true, checked: false, restockIntervalDays: undefined,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping-list');
  });

  it('rejects a blank name before touching the DB', async () => {
    const res = await addListItem({ name: '   ' });
    expect(res).toEqual({ ok: false, error: 'Name required' });
    expect(itemCreate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('defaults every optional field to "" and aiScanned to false when omitted', async () => {
    await addListItem({ name: 'Bread' });
    expect(itemCreate.mock.calls[0][0]).toEqual({
      name: 'Bread', quantity: '', category: '', brand: '', note: '', aiScanned: false, checked: false, restockIntervalDays: undefined,
    });
  });

  it('persists a valid optional restock interval and rejects invalid intervals', async () => {
    await expect(addListItem({ name: 'Coffee', restockIntervalDays: 30 })).resolves.toEqual({ ok: true });
    expect(itemCreate.mock.calls[0][0]).toMatchObject({ restockIntervalDays: 30 });
    await expect(addListItem({ name: 'Coffee', restockIntervalDays: 0 })).resolves.toMatchObject({ ok: false });
    expect(itemCreate).toHaveBeenCalledTimes(1);
  });
});

describe('updateListItem', () => {
  it('only $sets the keys present on the partial, trimmed, leaving the rest untouched', async () => {
    const res = await updateListItem('id1', { name: '  Bread  ', note: ' fresh ' });
    expect(res).toEqual({ ok: true, found: true });
    expect(itemUpdateOne).toHaveBeenCalledWith({ _id: 'id1' }, { $set: { name: 'Bread', note: 'fresh' } });
  });

  it('reports found:false when matchedCount is 0 (id not found / trashed)', async () => {
    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const res = await updateListItem('ghost', { name: 'X' });
    expect(res).toEqual({ ok: true, found: false });
  });

  it('can set or remove the restock interval', async () => {
    await updateListItem('id1', { restockIntervalDays: 14 });
    expect(itemUpdateOne).toHaveBeenLastCalledWith({ _id: 'id1' }, { $set: { restockIntervalDays: 14 } });
    await updateListItem('id1', { restockIntervalDays: null });
    expect(itemUpdateOne).toHaveBeenLastCalledWith({ _id: 'id1' }, { $set: {}, $unset: { restockIntervalDays: 1 } });
  });
});

describe('toggleListItem', () => {
  it('sets checked and reports found from matchedCount', async () => {
    const res = await toggleListItem('id1', true);
    expect(res).toEqual({ ok: true, found: true });
    const [, update] = itemUpdateOne.mock.calls[0];
    expect(update.$set.checked).toBe(true);
    expect(update.$set.lastRestockedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping-list');
  });

  it('reports found:false when nothing matched', async () => {
    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const res = await toggleListItem('ghost', false);
    expect(res.found).toBe(false);
  });
});

describe('deleteListItem', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    const res = await deleteListItem('id1');
    expect(res).toEqual({ ok: true, found: true });
    const [filter, update] = itemUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'id1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping-list');
  });

  it('reports found:false when nothing matched', async () => {
    itemUpdateOne.mockResolvedValueOnce({ matchedCount: 0 });
    const res = await deleteListItem('ghost');
    expect(res.found).toBe(false);
  });
});

describe('clearChecked', () => {
  it('targets only checked:true docs and reports modifiedCount as cleared', async () => {
    itemUpdateMany.mockResolvedValueOnce({ modifiedCount: 3 });
    const res = await clearChecked();
    expect(res).toEqual({ ok: true, cleared: 3 });
    const [filter, update] = itemUpdateMany.mock.calls[0];
    expect(filter).toEqual({ checked: true, restockIntervalDays: { $exists: false } });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping-list');
  });

  it('reports cleared:0 when nothing was checked', async () => {
    const res = await clearChecked();
    expect(res).toEqual({ ok: true, cleared: 0 });
  });
});
