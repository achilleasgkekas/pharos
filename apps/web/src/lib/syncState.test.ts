import { describe, it, expect, vi, beforeEach } from 'vitest';

// syncState.ts is the sibling of deliveryLog.ts: a thin AppConfig singleton
// wrapper, same tenancy routing, same "never throws" contract. The two exports
// have different shapes though — markRemoteSync is a single blind upsert (no
// read-merge-write like recordDeliveries), and getLastRemoteSync has its own
// Date-coercion branch (Date instance vs string vs invalid) worth pinning.

const { findOne, select, lean, updateOne, connectDBMock, currentModelMock, state } = vi.hoisted(() => {
  const state: { doc: unknown } = { doc: null };
  const lean = vi.fn(async () => state.doc);
  const select = vi.fn(() => ({ lean }));
  const findOne = vi.fn(() => ({ select }));
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const connectDBMock = vi.fn(async () => {});
  const currentModelMock = vi.fn(async () => ({ findOne, updateOne }));
  return { findOne, select, lean, updateOne, connectDBMock, currentModelMock, state };
});
vi.mock('./db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { findOne, updateOne } }));
vi.mock('./tenancy/connection', () => ({ currentModel: currentModelMock }));

import { markRemoteSync, getLastRemoteSync } from './syncState';

beforeEach(() => {
  state.doc = null;
  findOne.mockClear();
  select.mockClear();
  lean.mockClear();
  updateOne.mockClear();
  connectDBMock.mockClear();
  currentModelMock.mockClear();
});

describe('markRemoteSync', () => {
  it('connects, routes through currentModel, and upserts the given date', async () => {
    const at = new Date('2026-08-08T12:00:00.000Z');
    await markRemoteSync(at);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(currentModelMock).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = updateOne.mock.calls[0] as unknown as [unknown, { $set: { lastRemoteSyncAt: Date } }, { upsert: boolean }];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update.$set.lastRemoteSyncAt).toBe(at);
    expect(opts).toEqual({ upsert: true });
  });

  it('does no read at all — a blind upsert, not a read-merge-write', async () => {
    await markRemoteSync(new Date());
    expect(findOne).not.toHaveBeenCalled();
  });

  it('defaults to "now" when called with no argument', async () => {
    const before = Date.now();
    await markRemoteSync();
    const after = Date.now();
    const [, update] = updateOne.mock.calls[0] as unknown as [unknown, { $set: { lastRemoteSyncAt: Date } }];
    const stamped = update.$set.lastRemoteSyncAt.getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('swallows a connectDB failure instead of throwing, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    connectDBMock.mockImplementationOnce(async () => {
      throw new Error('mongo down');
    });
    await expect(markRemoteSync(new Date())).resolves.toBeUndefined();
    expect(updateOne).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('mongo down');
    warn.mockRestore();
  });

  it('swallows an updateOne failure the same way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updateOne.mockImplementationOnce(async () => {
      throw new Error('write conflict');
    });
    await expect(markRemoteSync(new Date())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('getLastRemoteSync', () => {
  it('connects, routes through currentModel, and reads only lastRemoteSyncAt', async () => {
    state.doc = { lastRemoteSyncAt: '2026-08-08T10:00:00.000Z' };
    await getLastRemoteSync();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(currentModelMock).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ key: 'singleton' });
    expect(select).toHaveBeenCalledWith('lastRemoteSyncAt');
  });

  it('returns null when the document does not exist', async () => {
    state.doc = null;
    expect(await getLastRemoteSync()).toBeNull();
  });

  it('returns null when the field is missing', async () => {
    state.doc = {};
    expect(await getLastRemoteSync()).toBeNull();
  });

  it('returns the value directly when it is already a Date instance', async () => {
    const d = new Date('2026-08-08T10:00:00.000Z');
    state.doc = { lastRemoteSyncAt: d };
    const out = await getLastRemoteSync();
    expect(out).toBeInstanceOf(Date);
    expect(out!.getTime()).toBe(d.getTime());
  });

  it('coerces a string value into a Date', async () => {
    state.doc = { lastRemoteSyncAt: '2026-08-08T10:00:00.000Z' };
    const out = await getLastRemoteSync();
    expect(out).toBeInstanceOf(Date);
    expect(out!.toISOString()).toBe('2026-08-08T10:00:00.000Z');
  });

  it('returns null for an invalid date string instead of an Invalid Date', async () => {
    state.doc = { lastRemoteSyncAt: 'not-a-date' };
    expect(await getLastRemoteSync()).toBeNull();
  });

  it('returns null on a connectDB failure instead of throwing', async () => {
    connectDBMock.mockImplementationOnce(async () => {
      throw new Error('mongo down');
    });
    await expect(getLastRemoteSync()).resolves.toBeNull();
  });

  it('returns null on a read failure instead of throwing', async () => {
    lean.mockImplementationOnce(async () => {
      throw new Error('read failed');
    });
    await expect(getLastRemoteSync()).resolves.toBeNull();
  });
});
