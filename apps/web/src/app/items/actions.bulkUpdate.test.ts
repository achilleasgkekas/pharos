import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header for
// the full concern list). This file covers the P78 bulk field-edit concern (bulkUpdateItems) —
// the items-side counterpart to expenses/actions.bulkUpdate.test.ts. Same mocking convention as
// actions.duplicates.test.ts (that file's header explains why every external dependency of the
// module needs its own mock for the import to succeed at all).
//
// Behaviour pinned:
//  - ids are deduped and falsy entries dropped before any DB call.
//  - empty (post-dedup) ids -> {ok:false, updated:0, error:'No items selected'}, no DB call.
//  - an unrecognised `status` value is silently DROPPED (not rejected) — category/tags may
//    still be worth applying, so the call is not thrown away entirely.
//  - category is trimmed; an empty/whitespace-only category is treated as "no change".
//  - addTags are deduped, trimmed, and empty entries filtered before being sent.
//  - when the patch resolves to literally nothing (no category, no valid status, no tags) ->
//    {ok:false, updated:0, error:'Nothing to update'}, no DB call.
//  - the actual Mongo update is exactly ONE `updateMany({_id:{$in:ids}}, ...)` call: $set for
//    category/status when present, $addToSet with $each for tags when present, and the two are
//    combined in the SAME update object when both apply.
//  - revalidates /items AND /shopping.
//  - returns {ok:true, updated: res.modifiedCount} on success.

const { connectDBMock, itemUpdateMany, revalidatePathMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemUpdateMany: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({ modifiedCount: 0 }) as { modifiedCount?: number }),
  revalidatePathMock: vi.fn(),
}));

const itemModel = { updateMany: itemUpdateMany };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (_token: unknown) => itemModel }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: vi.fn() }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: vi.fn() }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(), searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { bulkUpdateItems } from './actions';

const ID1 = '507f1f77bcf86cd799439001';
const ID2 = '507f1f77bcf86cd799439002';

beforeEach(() => {
  vi.clearAllMocks();
  itemUpdateMany.mockImplementation(async () => ({ modifiedCount: 2 }));
});

describe('bulkUpdateItems', () => {
  it('no ids -> "No items selected", never touches the DB', async () => {
    const res = await bulkUpdateItems([], { category: 'network' });
    expect(res).toEqual({ ok: false, updated: 0, error: 'No items selected' });
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it('falsy/duplicate ids are filtered before the DB call', async () => {
    await bulkUpdateItems([ID1, '', ID1, ID2], { category: 'network' });
    expect(itemUpdateMany).toHaveBeenCalledTimes(1);
    const [filter] = itemUpdateMany.mock.calls[0];
    expect(filter._id.$in.sort()).toEqual([ID1, ID2].sort());
  });

  it('an empty patch -> "Nothing to update", never touches the DB', async () => {
    const res = await bulkUpdateItems([ID1], {});
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to update' });
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it('a whitespace-only category counts as no category (not "no change" from the caller though) -> "Nothing to update" when nothing else is set', async () => {
    const res = await bulkUpdateItems([ID1], { category: '   ' });
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to update' });
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it('an unrecognised status is silently dropped, not rejected — category still applies', async () => {
    const res = await bulkUpdateItems([ID1], { category: 'audio', status: 'not-a-real-status' });
    expect(res.ok).toBe(true);
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({ $set: { category: 'audio' } });
  });

  it('an unrecognised status ALONE (no category/tags) -> "Nothing to update"', async () => {
    const res = await bulkUpdateItems([ID1], { status: 'bogus' });
    expect(res).toEqual({ ok: false, updated: 0, error: 'Nothing to update' });
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it('category alone -> $set only, no $addToSet', async () => {
    await bulkUpdateItems([ID1], { category: 'storage' });
    const [filter, update] = itemUpdateMany.mock.calls[0];
    expect(filter).toEqual({ _id: { $in: [ID1] } });
    expect(update).toEqual({ $set: { category: 'storage' } });
  });

  it('status alone (a real one) -> $set only', async () => {
    await bulkUpdateItems([ID1], { status: 'received' });
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({ $set: { status: 'received' } });
  });

  it('clears lending fields if status changes to a non-lending state', async () => {
    await bulkUpdateItems([ID1], { status: 'sold' });
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({
      $set: { status: 'sold', lentTo: '', lentAt: null, expectedReturnAt: null },
    });
  });

  it('tags alone -> $addToSet with $each, no $set', async () => {
    await bulkUpdateItems([ID1], { addTags: ['gaming', 'ssd'] });
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({ $addToSet: { tags: { $each: ['gaming', 'ssd'] } } });
  });

  it('tags are trimmed, deduped, and blank entries dropped', async () => {
    await bulkUpdateItems([ID1], { addTags: [' gaming ', 'gaming', '', '  '] });
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({ $addToSet: { tags: { $each: ['gaming'] } } });
  });

  it('category + status + tags together combine into ONE update object', async () => {
    await bulkUpdateItems([ID1], { category: 'compute', status: 'installed', addTags: ['rig'] });
    const [, update] = itemUpdateMany.mock.calls[0];
    expect(update).toEqual({
      $set: { category: 'compute', status: 'installed' },
      $addToSet: { tags: { $each: ['rig'] } },
    });
  });

  it('revalidates /items and /shopping on success', async () => {
    await bulkUpdateItems([ID1], { category: 'network' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('returns {ok:true, updated: modifiedCount} from the real Mongo result', async () => {
    itemUpdateMany.mockResolvedValueOnce({ modifiedCount: 7 });
    const res = await bulkUpdateItems([ID1, ID2], { category: 'network' });
    expect(res).toEqual({ ok: true, updated: 7 });
  });

  it('falls back to targets.length when modifiedCount is missing from the driver result', async () => {
    itemUpdateMany.mockResolvedValueOnce({});
    const res = await bulkUpdateItems([ID1, ID2], { category: 'network' });
    expect(res).toEqual({ ok: true, updated: 2 });
  });
});
