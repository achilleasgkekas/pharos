'use server';
// P9 phase 2 — the one entry point the UI uses to OFFER a rate.
//
// It fetches and returns; it never writes. Whatever comes back lands in the same input the
// user was already typing into, so accepting it stays an explicit act (see lib/fxRates.ts
// for why the feed is deliberately manual). The base currency is resolved here rather than
// trusted from the client, so a fetched rate is always in the direction the rest of P9
// means by `fxRate`: base units per 1 unit of the printed currency.
import { getAppSettings } from '@/lib/appSettings';
import { withRequestTenant } from '@/lib/tenancy/request';
import { normalizeCurrency } from '@/lib/fx';
import { fetchFxRate } from '@/lib/fxRates';

export type FxRateResult =
  | { ok: true; rate: number; date: string; source: string }
  | { ok: false; error: string };

/**
 * The market rate for `currency` against this deployment's base currency, as of `date`
 * when given (the record's own day, the rate that actually applied to it) and the latest
 * published fixing otherwise.
 */
export async function lookupMarketRate(currency: string, date?: string): Promise<FxRateResult> {
  const code = normalizeCurrency(currency);
  if (!code) return { ok: false, error: 'Invalid currency code' };

  return withRequestTenant(async () => {
    const settings = await getAppSettings();
    // Off = this deployment is single-currency; nothing should be reaching outward for it.
    if (!settings.multiCurrency) return { ok: false, error: 'Multi-currency is off' };
    const base = normalizeCurrency(settings.currency) || 'EUR';
    if (code === base) return { ok: false, error: 'That is the base currency' };

    const res = await fetchFxRate(code, base, date);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, rate: res.hit.rate, date: res.hit.date, source: res.hit.source };
  });
}
