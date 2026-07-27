import { describe, it, expect, vi, beforeEach } from 'vitest';

// The single server action behind the "Market rate" button (P9 phase 2). The feed itself
// (lib/fxRates.ts) already has its own unit tests; this file pins the ACTION's job, which
// is everything the feed cannot decide for itself:
//
//  - the base currency is resolved SERVER-SIDE from settings, never taken from the client,
//    so a fetched rate is always in the direction the rest of P9 means by `fxRate`
//    (base units per 1 unit of the printed currency);
//  - a single-currency deployment reaches outward for nothing at all;
//  - the lookup runs inside withRequestTenant, so a SaaS tenant reads its own settings;
//  - it only ever RETURNS a rate. There is no write path here on purpose: the number lands
//    in the input the user was already typing into, so accepting it stays an explicit act.
const { getAppSettingsMock, fetchFxRateMock, withRequestTenantMock } = vi.hoisted(() => ({
  getAppSettingsMock: vi.fn(async () => ({ multiCurrency: true, currency: 'EUR' } as Record<string, unknown>)),
  fetchFxRateMock: vi.fn(async (_from: string, _to: string, _date?: string | null) => ({
    ok: true as const,
    hit: { rate: 0.92, date: '2026-07-24', source: 'ECB' },
  })),
  withRequestTenantMock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/fxRates', () => ({ fetchFxRate: fetchFxRateMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: withRequestTenantMock }));

import { lookupMarketRate } from './fxRateActions';

beforeEach(() => {
  vi.clearAllMocks();
  getAppSettingsMock.mockResolvedValue({ multiCurrency: true, currency: 'EUR' });
  fetchFxRateMock.mockResolvedValue({ ok: true, hit: { rate: 0.92, date: '2026-07-24', source: 'ECB' } });
  withRequestTenantMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
});

describe('lookupMarketRate', () => {
  it('asks for printed -> base and reports the day the fixing came from', async () => {
    const res = await lookupMarketRate('USD', '2026-07-25');

    expect(fetchFxRateMock).toHaveBeenCalledWith('USD', 'EUR', '2026-07-25');
    expect(res).toEqual({ ok: true, rate: 0.92, date: '2026-07-24', source: 'ECB' });
  });

  it('normalizes the currency the client sent', async () => {
    const res = await lookupMarketRate(' usd ');

    expect(fetchFxRateMock).toHaveBeenCalledWith('USD', 'EUR', undefined);
    expect(res.ok).toBe(true);
  });

  it('rejects a junk code without spending a request', async () => {
    const res = await lookupMarketRate('dollars');

    expect(res).toEqual({ ok: false, error: 'Invalid currency code' });
    expect(fetchFxRateMock).not.toHaveBeenCalled();
    expect(getAppSettingsMock).not.toHaveBeenCalled();
  });

  it('reaches outward for nothing while multi-currency is off', async () => {
    getAppSettingsMock.mockResolvedValue({ multiCurrency: false, currency: 'EUR' });

    const res = await lookupMarketRate('USD');

    expect(res).toEqual({ ok: false, error: 'Multi-currency is off' });
    expect(fetchFxRateMock).not.toHaveBeenCalled();
  });

  it('refuses the base currency itself, whatever the base happens to be', async () => {
    getAppSettingsMock.mockResolvedValue({ multiCurrency: true, currency: 'USD' });

    const res = await lookupMarketRate('usd');

    expect(res).toEqual({ ok: false, error: 'That is the base currency' });
    expect(fetchFxRateMock).not.toHaveBeenCalled();
  });

  it('takes the base from settings, not from the caller', async () => {
    getAppSettingsMock.mockResolvedValue({ multiCurrency: true, currency: 'GBP' });

    await lookupMarketRate('USD');

    expect(fetchFxRateMock).toHaveBeenCalledWith('USD', 'GBP', undefined);
  });

  it('falls back to EUR when settings carry no usable base', async () => {
    getAppSettingsMock.mockResolvedValue({ multiCurrency: true, currency: '' });

    await lookupMarketRate('USD');

    expect(fetchFxRateMock).toHaveBeenCalledWith('USD', 'EUR', undefined);
  });

  it('passes the feed failure through instead of inventing a number', async () => {
    fetchFxRateMock.mockResolvedValue({ ok: false, error: 'No published rate for USD on that date' } as never);

    const res = await lookupMarketRate('USD', '2026-07-25');

    expect(res).toEqual({ ok: false, error: 'No published rate for USD on that date' });
  });

  it('runs the lookup inside the request tenant', async () => {
    await lookupMarketRate('USD');

    expect(withRequestTenantMock).toHaveBeenCalledTimes(1);
  });
});
