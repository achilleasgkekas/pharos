import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchFxRate,
  clearFxRateCache,
  normalizeRateDate,
  parseRatesResponse,
  rateEndpoint,
  ratesUrl,
} from './fxRates';

// P9 phase 2 — the optional rate feed behind the "market rate" button.
// Only the network seam is mocked (global fetch). What matters here is that the
// module never HANDS BACK a number it did not actually receive: an unsupported
// currency, an outage and a garbled payload must each fail loudly, because the
// number it returns goes straight into a field that multiplies stored money.

type Handler = (url: string) => { status?: number; body?: unknown };

let calls: string[] = [];

function mockFetch(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const { status = 200, body = {} } = handler(String(url));
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as unknown as Response;
    })
  );
}

const payload = (rate: number, date = '2026-07-24') => ({ amount: 1, base: 'USD', date, rates: { EUR: rate } });

beforeEach(() => {
  calls = [];
  clearFxRateCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FX_RATE_API_URL;
});

describe('rateEndpoint', () => {
  it('defaults to the public Frankfurter instance', () => {
    expect(rateEndpoint(undefined)).toBe('https://api.frankfurter.dev/v1');
    expect(rateEndpoint('')).toBe('https://api.frankfurter.dev/v1');
  });

  it('accepts a self-hosted instance and trims trailing slashes', () => {
    expect(rateEndpoint('http://nas.local:8080/v1/')).toBe('http://nas.local:8080/v1');
  });

  it('falls back to the default for a non-http scheme or junk', () => {
    expect(rateEndpoint('file:///etc/passwd')).toBe('https://api.frankfurter.dev/v1');
    expect(rateEndpoint('not a url')).toBe('https://api.frankfurter.dev/v1');
  });
});

describe('normalizeRateDate', () => {
  const today = new Date('2026-07-27T10:00:00Z');

  it('keeps a real past date', () => {
    expect(normalizeRateDate('2026-07-20', today)).toBe('2026-07-20');
  });

  it('treats today and the future as "latest"', () => {
    expect(normalizeRateDate('2026-07-27', today)).toBeNull();
    expect(normalizeRateDate('2027-01-01', today)).toBeNull();
  });

  it('rejects junk, impossible days and anything before the ECB series', () => {
    expect(normalizeRateDate('', today)).toBeNull();
    expect(normalizeRateDate('20/07/2026', today)).toBeNull();
    expect(normalizeRateDate('2026-02-31', today)).toBeNull();
    expect(normalizeRateDate('1998-12-31', today)).toBeNull();
  });
});

describe('ratesUrl', () => {
  it('asks for the latest fixing when no date is given', () => {
    expect(ratesUrl('https://api.frankfurter.dev/v1', 'USD', 'EUR')).toBe(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
    );
  });

  it('asks for a specific day when one is given', () => {
    expect(ratesUrl('https://api.frankfurter.dev/v1', 'USD', 'EUR', '2026-07-20')).toBe(
      'https://api.frankfurter.dev/v1/2026-07-20?base=USD&symbols=EUR'
    );
  });
});

describe('parseRatesResponse', () => {
  it('reads the requested symbol and the effective date', () => {
    expect(parseRatesResponse(payload(0.92), 'EUR')).toEqual({ rate: 0.92, date: '2026-07-24' });
  });

  it('returns null when the symbol is absent or not a positive number', () => {
    expect(parseRatesResponse(payload(0.92), 'GBP')).toBeNull();
    expect(parseRatesResponse({ rates: { EUR: 0 } }, 'EUR')).toBeNull();
    expect(parseRatesResponse({ rates: { EUR: 'many' } }, 'EUR')).toBeNull();
    expect(parseRatesResponse({}, 'EUR')).toBeNull();
    expect(parseRatesResponse(null, 'EUR')).toBeNull();
  });
});

describe('fetchFxRate', () => {
  it('returns the rate and the day it actually came from', async () => {
    mockFetch(() => ({ body: payload(0.92) }));
    const res = await fetchFxRate('usd', 'eur');
    expect(res).toEqual({ ok: true, hit: { rate: 0.92, date: '2026-07-24', source: 'ECB' } });
    expect(calls[0]).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR');
  });

  it('reports the previous working day a weekend date resolves to', async () => {
    // The ECB does not fix on a Sunday; the service answers with Friday and says so.
    mockFetch(() => ({ body: payload(0.93, '2026-07-17') }));
    const res = await fetchFxRate('USD', 'EUR', '2026-07-19');
    expect(res.ok && res.hit.date).toBe('2026-07-17');
    expect(calls[0]).toContain('/2026-07-19?');
  });

  it('spends no request on an invalid or identical pair', async () => {
    mockFetch(() => ({ body: payload(0.92) }));
    expect(await fetchFxRate('US', 'EUR')).toEqual({ ok: false, error: 'Invalid currency code' });
    expect(await fetchFxRate('EUR', 'EUR')).toEqual({ ok: false, error: 'Same currency' });
    expect(calls).toHaveLength(0);
  });

  it('distinguishes "no published rate" from an outage', async () => {
    mockFetch(() => ({ status: 404 }));
    const missing = await fetchFxRate('XYZ', 'EUR');
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.error).toContain('No published rate');

    clearFxRateCache();
    mockFetch(() => ({ status: 503 }));
    const down = await fetchFxRate('USD', 'EUR');
    expect(!down.ok && down.error).toContain('503');
  });

  it('fails rather than inventing a number when the payload lacks the symbol', async () => {
    mockFetch(() => ({ body: { date: '2026-07-24', rates: { GBP: 0.85 } } }));
    const res = await fetchFxRate('USD', 'EUR');
    expect(res.ok).toBe(false);
  });

  it('reports a transport failure instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timed out');
      })
    );
    const res = await fetchFxRate('USD', 'EUR');
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('unreachable');
  });

  it('serves a repeat question from cache, and caches per pair and day', async () => {
    mockFetch((url) => ({ body: payload(url.includes('2026-07-20') ? 0.9 : 0.92) }));
    await fetchFxRate('USD', 'EUR');
    await fetchFxRate('USD', 'EUR');
    expect(calls).toHaveLength(1);

    const dated = await fetchFxRate('USD', 'EUR', '2026-07-20');
    expect(dated.ok && dated.hit.rate).toBe(0.9);
    expect(calls).toHaveLength(2);
  });

  it('does not cache a failure', async () => {
    mockFetch(() => ({ status: 503 }));
    await fetchFxRate('USD', 'EUR');
    await fetchFxRate('USD', 'EUR');
    expect(calls).toHaveLength(2);
  });

  it('honours a self-hosted endpoint', async () => {
    process.env.FX_RATE_API_URL = 'http://nas.local:8080';
    mockFetch(() => ({ body: payload(0.92) }));
    await fetchFxRate('USD', 'EUR');
    expect(calls[0]).toBe('http://nas.local:8080/latest?base=USD&symbols=EUR');
  });
});
