import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_RETRY_DELAYS_MS,
  deliverWithRetry,
  describeOutcome,
  isRetryable,
  parseRetryDelays,
  retryDelays,
  type DeliveryOutcome,
} from './deliveryRetry';

// The retry policy decides whether a missed alert gets a second chance or is dropped
// forever, so both halves matter: retrying what cannot succeed (a 404 webhook, a
// private-address target) wastes the caller's request budget, and NOT retrying a
// transient blip is exactly the P24 bug this replaces. These tests pin the
// classification, the attempt/backoff sequence, and the env override.

const OK: DeliveryOutcome = { ok: true };

afterEach(() => {
  delete process.env.NOTIFY_RETRY_DELAYS_MS;
});

describe('isRetryable', () => {
  it('never retries a success', () => {
    expect(isRetryable(OK)).toBe(false);
  });

  it('retries a failure with no HTTP status (network error / timeout / DNS)', () => {
    expect(isRetryable({ ok: false, error: 'ECONNREFUSED' })).toBe(true);
  });

  it.each([500, 502, 503, 504, 429, 408])('retries HTTP %i', (status) => {
    expect(isRetryable({ ok: false, status })).toBe(true);
  });

  it.each([400, 401, 403, 404, 410, 422])('gives up on HTTP %i (receiver refused it)', (status) => {
    expect(isRetryable({ ok: false, status })).toBe(false);
  });

  it('gives up on an explicitly permanent failure even without a status', () => {
    expect(isRetryable({ ok: false, error: 'Missing configuration', permanent: true })).toBe(false);
  });
});

describe('parseRetryDelays', () => {
  it('returns null (→ caller uses the default) when unset or unparseable', () => {
    expect(parseRetryDelays(undefined)).toBeNull();
    expect(parseRetryDelays('soon, later')).toBeNull();
    expect(parseRetryDelays('-1')).toBeNull();
  });

  it('treats an explicitly empty value as "no retries"', () => {
    expect(parseRetryDelays('')).toEqual([]);
    expect(parseRetryDelays('   ')).toEqual([]);
  });

  it('parses a comma list, tolerating whitespace', () => {
    expect(parseRetryDelays('250, 1000 ,4000')).toEqual([250, 1000, 4000]);
  });

  it('caps each delay at 60s and the list at 5 entries (no accidental hour-long backoff)', () => {
    expect(parseRetryDelays('999999')).toEqual([60_000]);
    expect(parseRetryDelays('1,2,3,4,5,6,7')).toHaveLength(5);
  });
});

describe('retryDelays', () => {
  it('falls back to the two-retry default', () => {
    expect(retryDelays()).toEqual(DEFAULT_RETRY_DELAYS_MS);
  });

  it('honours NOTIFY_RETRY_DELAYS_MS', () => {
    process.env.NOTIFY_RETRY_DELAYS_MS = '10,20,30';
    expect(retryDelays()).toEqual([10, 20, 30]);
  });

  it('lets a self-hoster turn retries off entirely', () => {
    process.env.NOTIFY_RETRY_DELAYS_MS = '';
    expect(retryDelays()).toEqual([]);
  });
});

describe('deliverWithRetry', () => {
  // Typed with the `ms` parameter it is actually called with: an argless `vi.fn` infers a
  // zero-length tuple for `mock.calls`, so the backoff assertion below (`c[0]`) failed to compile.
  const sleep = vi.fn(async (_ms: number) => {});

  it('sends once and reports attempts:1 when the first try works', async () => {
    const send = vi.fn(async () => OK);
    expect(await deliverWithRetry(send, { delays: [1, 2], sleep })).toEqual({ ok: true, attempts: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and reports the successful attempt count', async () => {
    const send = vi
      .fn<() => Promise<DeliveryOutcome>>()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(OK);
    const r = await deliverWithRetry(send, { delays: [1, 2], sleep });
    expect(r).toEqual({ ok: true, attempts: 2 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('waits the configured backoff between attempts, in order', async () => {
    sleep.mockClear();
    const send = vi.fn(async () => ({ ok: false, status: 500 }) as DeliveryOutcome);
    await deliverWithRetry(send, { delays: [1000, 5000], sleep });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 5000]);
  });

  it('stops after delays are exhausted (2 retries → 3 attempts) and keeps the last outcome', async () => {
    const send = vi.fn(async () => ({ ok: false, status: 500, error: 'Rejected by receiver' }) as DeliveryOutcome);
    const r = await deliverWithRetry(send, { delays: [1, 2], sleep });
    expect(r).toEqual({ ok: false, status: 500, error: 'Rejected by receiver', attempts: 3 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent failure — one attempt, no sleep', async () => {
    sleep.mockClear();
    const send = vi.fn(async () => ({ ok: false, error: 'Missing configuration', permanent: true }) as DeliveryOutcome);
    const r = await deliverWithRetry(send, { delays: [1, 2], sleep });
    expect(r.attempts).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry a 4xx the receiver refused', async () => {
    const send = vi.fn(async () => ({ ok: false, status: 404 }) as DeliveryOutcome);
    expect((await deliverWithRetry(send, { delays: [1, 2], sleep })).attempts).toBe(1);
  });

  it('makes exactly one attempt when retries are disabled', async () => {
    const send = vi.fn(async () => ({ ok: false, status: 500 }) as DeliveryOutcome);
    expect((await deliverWithRetry(send, { delays: [], sleep })).attempts).toBe(1);
  });
});

describe('describeOutcome', () => {
  it('summarizes each shape for the delivery log', () => {
    expect(describeOutcome({ ok: true })).toBe('ok');
    expect(describeOutcome({ ok: false, status: 500, error: 'Rejected by receiver' })).toBe('HTTP 500 — Rejected by receiver');
    expect(describeOutcome({ ok: false, error: 'ECONNREFUSED' })).toBe('ECONNREFUSED');
    expect(describeOutcome({ ok: false, status: 502 })).toBe('HTTP 502');
    expect(describeOutcome({ ok: false })).toBe('failed');
  });
});
