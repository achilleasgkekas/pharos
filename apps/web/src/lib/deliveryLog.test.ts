import { describe, it, expect, vi, beforeEach } from 'vitest';

// deliveryLog.shared.test.ts pins the pure normalize/append/prune helpers with no
// mocks at all. This slice covers the thin DB wiring on top (deliveryLog.ts itself):
// one read, one read+merge+write, tenancy routing via currentModel, and the
// never-throws contract that recordDeliveries makes to every caller — a channel that
// fails to persist its own history must not turn into a second failure on top of the
// delivery that already failed (or, worse, break a delivery that actually succeeded).

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

import { getDeliveryLog, recordDeliveries, DELIVERY_LOG_CAP } from './deliveryLog';
import type { DeliveryLogEntry } from './deliveryLog.shared';

const row = (over: Partial<DeliveryLogEntry> = {}): DeliveryLogEntry => ({
  at: '2026-08-08T10:00:00.000Z',
  ok: true,
  attempts: 1,
  ...over,
});

beforeEach(() => {
  state.doc = null;
  findOne.mockClear();
  select.mockClear();
  lean.mockClear();
  updateOne.mockClear();
  connectDBMock.mockClear();
  currentModelMock.mockClear();
});

describe('getDeliveryLog', () => {
  it('connects, routes through currentModel, and reads only the deliveryLog field', async () => {
    state.doc = { deliveryLog: { 'notifier:a': [row()] } };
    const out = await getDeliveryLog();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(currentModelMock).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ key: 'singleton' });
    expect(select).toHaveBeenCalledWith('deliveryLog');
    expect(out['notifier:a']).toHaveLength(1);
  });

  it('normalizes a missing document to an empty map', async () => {
    state.doc = null;
    expect(await getDeliveryLog()).toEqual({});
  });

  it('normalizes junk in the Mixed field the same way normalizeDeliveryLog does', async () => {
    state.doc = { deliveryLog: { 'notifier:a': 'not-an-array', 'notifier:b': [row()] } };
    const out = await getDeliveryLog();
    expect(out['notifier:a']).toBeUndefined();
    expect(out['notifier:b']).toHaveLength(1);
  });
});

describe('recordDeliveries', () => {
  it('does nothing (no DB call at all) for an empty entry list', async () => {
    await recordDeliveries([]);
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('does one read then one write, upserting the merged map', async () => {
    state.doc = { deliveryLog: { 'notifier:a': [row({ at: 'old' })] } };
    await recordDeliveries([['notifier:a', row({ at: 'new' })]]);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = updateOne.mock.calls[0] as unknown as [unknown, { $set: { deliveryLog: Record<string, DeliveryLogEntry[]> } }, { upsert: boolean }];
    expect(filter).toEqual({ key: 'singleton' });
    expect(opts).toEqual({ upsert: true });
    expect(update.$set.deliveryLog['notifier:a'].map((r) => r.at)).toEqual(['old', 'new']);
  });

  it('appends one row per channel in a single write when given multiple entries', async () => {
    state.doc = { deliveryLog: {} };
    await recordDeliveries([
      ['notifier:a', row()],
      ['webhook:b', row()],
    ]);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [, update] = updateOne.mock.calls[0] as unknown as [unknown, { $set: { deliveryLog: Record<string, DeliveryLogEntry[]> } }];
    expect(Object.keys(update.$set.deliveryLog).sort()).toEqual(['notifier:a', 'webhook:b']);
  });

  it('re-caps a channel past DELIVERY_LOG_CAP rows on write', async () => {
    const existing = Array.from({ length: DELIVERY_LOG_CAP }, (_, i) => row({ at: `t${i}` }));
    state.doc = { deliveryLog: { 'notifier:a': existing } };
    await recordDeliveries([['notifier:a', row({ at: 'newest' })]]);
    const [, update] = updateOne.mock.calls[0] as unknown as [unknown, { $set: { deliveryLog: Record<string, DeliveryLogEntry[]> } }];
    const rows = update.$set.deliveryLog['notifier:a'];
    expect(rows).toHaveLength(DELIVERY_LOG_CAP);
    expect(rows.at(-1)!.at).toBe('newest');
    expect(rows[0].at).toBe('t1'); // t0 fell off the cap
  });

  it('swallows a connectDB failure instead of throwing (best-effort bookkeeping)', async () => {
    connectDBMock.mockImplementationOnce(async () => {
      throw new Error('mongo down');
    });
    await expect(recordDeliveries([['notifier:a', row()]])).resolves.toBeUndefined();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('swallows a write failure the same way (a broken audit write must not surface as a second error)', async () => {
    state.doc = { deliveryLog: {} };
    updateOne.mockImplementationOnce(async () => {
      throw new Error('write conflict');
    });
    await expect(recordDeliveries([['notifier:a', row()]])).resolves.toBeUndefined();
  });
});
