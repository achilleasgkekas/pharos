import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// P80: dispatchAlert used to be single-attempt fire-and-forget, so an endpoint that
// happened to be restarting lost the alert with no trace anywhere. These tests drive
// the real dispatchAlert (mocked DB + fetch) and pin the two guarantees that replaced
// that: a transient failure is retried with backoff, and EVERY dispatch — success or
// final failure — writes one capped row per channel to AppConfig.deliveryLog, which is
// what makes a silently-broken channel visible in Settings.
// (notifiers.dispatch.test.ts pins the per-channel wire payloads; this is the delivery
// policy layer on top.)

// Run retries at zero delay so the suite does not actually sleep 6s.
process.env.NOTIFY_RETRY_DELAYS_MS = '0,0';

const { findOne, select, lean, updateOne, connectDBMock, state } = vi.hoisted(() => {
  const state: { doc: unknown } = { doc: null };
  const lean = vi.fn(async () => state.doc);
  const select = vi.fn(() => ({ lean }));
  const findOne = vi.fn(() => ({ select }));
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const connectDBMock = vi.fn(async () => {});
  return { findOne, select, lean, updateOne, connectDBMock, state };
});
vi.mock('./db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { findOne, updateOne } }));
vi.mock('./tenancy/connection', () => ({ currentModel: async () => ({ findOne, updateOne }) }));
vi.mock('./notify', () => ({ sendNtfyTo: vi.fn(async () => true) }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

import { lookup } from 'node:dns/promises';
import { dispatchAlert } from './notifiers';
import type { DeliveryLogEntry } from './deliveryLog.shared';

const mockLookup = vi.mocked(lookup);

/** The deliveryLog map written by the last recordDeliveries() call. */
function writtenLog(): Record<string, DeliveryLogEntry[]> {
  const call = updateOne.mock.calls.at(-1) as unknown as [unknown, { $set: { deliveryLog: Record<string, DeliveryLogEntry[]> } }];
  return call[1].$set.deliveryLog;
}

/** One enabled Slack channel (a plain POST path, no extra transport to mock). */
const oneChannel = { notifiers: [{ id: 'c1', type: 'slack', enabled: true, url: 'https://hooks.slack.com/services/T/B/x' }] };

beforeEach(() => {
  state.doc = oneChannel;
  findOne.mockClear();
  select.mockClear();
  lean.mockClear();
  updateOne.mockClear();
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }] as never);
});

afterAll(() => {
  delete process.env.NOTIFY_RETRY_DELAYS_MS;
});

describe('dispatchAlert — retry', () => {
  it('retries a 503 and counts the delivery as sent once it succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    expect(await dispatchAlert('t', 'm')).toEqual({ sent: 1, total: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(writtenLog()['notifier:c1'][0]).toMatchObject({ ok: true, attempts: 2 });
  });

  it('retries a network error (no status) the same way', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    expect(await dispatchAlert('t', 'm')).toEqual({ sent: 1, total: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured retries and reports the failure', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await dispatchAlert('t', 'm')).toEqual({ sent: 0, total: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(writtenLog()['notifier:c1'][0]).toMatchObject({ ok: false, status: 500, attempts: 3 });
  });

  it('does not retry a 404 — the receiver refused it, repeating cannot help', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await dispatchAlert('t', 'm');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry (or even fetch) a channel whose URL resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await dispatchAlert('t', 'm')).toEqual({ sent: 0, total: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writtenLog()['notifier:c1'][0]).toMatchObject({ ok: false, attempts: 1 });
  });
});

describe('dispatchAlert — delivery log', () => {
  it('writes one row per channel in a single update, keyed by channel id', async () => {
    state.doc = {
      notifiers: [
        { id: 'c1', type: 'slack', enabled: true, url: 'https://hooks.slack.com/x' },
        { id: 'c2', type: 'webhook', enabled: true, url: 'https://n8n.example/hook' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));

    await dispatchAlert('t', 'm');
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(Object.keys(writtenLog()).sort()).toEqual(['notifier:c1', 'notifier:c2']);
  });

  it('appends to the existing history instead of replacing it', async () => {
    state.doc = {
      ...oneChannel,
      deliveryLog: { 'notifier:c1': [{ at: '2026-08-01T00:00:00.000Z', ok: false, attempts: 3 }] },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));

    await dispatchAlert('t', 'm');
    const rows = writtenLog()['notifier:c1'];
    expect(rows).toHaveLength(2);
    expect(rows[0].ok).toBe(false); // the older row survived
    expect(rows[1].ok).toBe(true);
  });

  it('records a readable reason on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    await dispatchAlert('t', 'm');
    expect(writtenLog()['notifier:c1'][0].error).toContain('401');
  });

  it('writes nothing when there are no enabled channels', async () => {
    state.doc = { notifiers: [{ id: 'c1', type: 'slack', enabled: false, url: 'https://hooks.slack.com/x' }] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    expect(await dispatchAlert('t', 'm')).toEqual({ sent: 0, total: 0 });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('still reports a successful delivery when the log write itself fails', async () => {
    updateOne.mockRejectedValueOnce(new Error('mongo down') as never);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));

    await expect(dispatchAlert('t', 'm')).resolves.toEqual({ sent: 1, total: 1 });
  });
});
