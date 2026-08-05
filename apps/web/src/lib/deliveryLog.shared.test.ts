import { describe, it, expect } from 'vitest';
import {
  DELIVERY_LOG_CAP,
  appendCapped,
  normalizeDeliveryLog,
  notifierLogKey,
  pruneLogKeys,
  webhookLogKey,
  type DeliveryLogEntry,
} from './deliveryLog.shared';

// The delivery log lives in a Mixed AppConfig field, so it has two jobs: survive
// whatever shape is already stored (it is schemaless), and stay bounded — a webhook
// endpoint that fails every hour forever must not grow the singleton config document
// without limit. These tests pin both, plus the key scheme the UI joins on.

const row = (over: Partial<DeliveryLogEntry> = {}): DeliveryLogEntry => ({
  at: '2026-08-05T10:00:00.000Z',
  ok: true,
  attempts: 1,
  ...over,
});

describe('log keys', () => {
  it('namespaces the two outbound surfaces so ids cannot collide', () => {
    expect(notifierLogKey('abc')).toBe('notifier:abc');
    expect(webhookLogKey('abc')).toBe('webhook:abc');
  });
});

describe('appendCapped', () => {
  it('appends newest-last', () => {
    const out = appendCapped([row({ at: 'a' })], row({ at: 'b' }));
    expect(out.map((r) => r.at)).toEqual(['a', 'b']);
  });

  it('keeps only the last N rows', () => {
    let rows: DeliveryLogEntry[] = [];
    for (let i = 0; i < DELIVERY_LOG_CAP + 7; i++) rows = appendCapped(rows, row({ at: `t${i}` }));
    expect(rows).toHaveLength(DELIVERY_LOG_CAP);
    expect(rows[0].at).toBe('t7'); // the seven oldest fell off
    expect(rows.at(-1)!.at).toBe(`t${DELIVERY_LOG_CAP + 6}`);
  });
});

describe('normalizeDeliveryLog', () => {
  it('returns {} for anything that is not an object', () => {
    expect(normalizeDeliveryLog(null)).toEqual({});
    expect(normalizeDeliveryLog('nope')).toEqual({});
    expect(normalizeDeliveryLog(undefined)).toEqual({});
  });

  it('drops non-array values and rows without a timestamp', () => {
    const out = normalizeDeliveryLog({ 'notifier:a': 'junk', 'notifier:b': [{ ok: true }, row()] });
    expect(out['notifier:a']).toBeUndefined();
    expect(out['notifier:b']).toHaveLength(1);
  });

  it('accepts a Date timestamp (Mixed fields can round-trip either)', () => {
    const out = normalizeDeliveryLog({ 'webhook:w': [{ at: new Date('2026-08-05T09:00:00Z'), ok: false, attempts: 3 }] });
    expect(out['webhook:w'][0]).toEqual({ at: '2026-08-05T09:00:00.000Z', ok: false, attempts: 3 });
  });

  it('defaults attempts to 1, coerces ok to a strict boolean, and drops a junk status', () => {
    const out = normalizeDeliveryLog({ 'notifier:n': [{ at: 'x', ok: 'yes', status: 'nope' }] });
    expect(out['notifier:n'][0]).toEqual({ at: 'x', ok: false, attempts: 1 });
  });

  it('truncates a runaway error string', () => {
    const out = normalizeDeliveryLog({ 'notifier:n': [{ at: 'x', ok: false, error: 'e'.repeat(500), attempts: 1 }] });
    expect(out['notifier:n'][0].error!.length).toBe(200);
  });

  it('re-caps an over-long stored array (keeping the newest)', () => {
    const many = Array.from({ length: DELIVERY_LOG_CAP + 5 }, (_, i) => row({ at: `t${i}` }));
    const out = normalizeDeliveryLog({ 'notifier:n': many });
    expect(out['notifier:n']).toHaveLength(DELIVERY_LOG_CAP);
    expect(out['notifier:n'].at(-1)!.at).toBe(`t${DELIVERY_LOG_CAP + 4}`);
  });
});

describe('pruneLogKeys', () => {
  it('leaves the map untouched while under the cap', () => {
    const log = { a: [row()], b: [row()] };
    expect(pruneLogKeys(log, 5)).toBe(log);
  });

  it('keeps the most recently active channels and drops the stalest', () => {
    const log = {
      old: [row({ at: '2026-01-01T00:00:00.000Z' })],
      mid: [row({ at: '2026-06-01T00:00:00.000Z' })],
      fresh: [row({ at: '2026-08-05T00:00:00.000Z' })],
    };
    expect(Object.keys(pruneLogKeys(log, 2)).sort()).toEqual(['fresh', 'mid']);
  });
});
