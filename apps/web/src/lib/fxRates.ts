// P9 phase 2 — the optional free exchange-rate feed.
//
// Everything in P9 so far has the user TYPE the rate (lib/fx.ts refuses to invent one,
// on purpose: a wrong rate silently moves real totals). That stays true here. This module
// only offers to LOOK UP a rate the user can accept or overwrite: nothing calls it on a
// schedule, nothing applies what it returns on its own, and the write path is unchanged
// (the fetched number lands in the same input the user was already typing into).
//
// Source: Frankfurter (https://frankfurter.dev) — the European Central Bank's daily
// reference rates. It is the builder default for the same reasons as the Open*Facts family
// behind P17: free, key-less, no quota to manage, no per-call cost, and self-hostable, so a
// privacy-minded self-host can point FX_RATE_API_URL at their own instance and never talk
// to a third party. The request carries two currency codes and a date, never any record.
//
// LIMITS worth knowing, because they shape the errors below:
//   - ECB publishes ~30 currencies, on TARGET working days only. A weekend/holiday date
//     answers with the previous working day's fixing, and says so in `date` — which is why
//     the caller is told the effective date rather than the date it asked for.
//   - History starts 1999-01-04.
//   - These are reference rates, NOT what a card issuer actually charged (they add a
//     spread). The UI says "market rate" for that reason: it is a good default, not truth.

/** Base units per 1 unit of the foreign currency, plus the day it actually came from. */
export type FxRateHit = { rate: number; date: string; source: string };

export type FxRateLookup = { ok: true; hit: FxRateHit } | { ok: false; error: string };

const DEFAULT_ENDPOINT = 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 6000;
/** ECB reference series start; anything earlier can only ever answer "no data". */
const EARLIEST = '1999-01-04';

/**
 * The endpoint to ask. Configured by the deployment (env), never by a request, so this
 * cannot be steered at runtime; the scheme check is here so a typo fails loudly at the
 * default rather than turning into a `file:`/`gopher:` fetch.
 */
export function rateEndpoint(raw = process.env.FX_RATE_API_URL): string {
  const v = (raw ?? '').trim().replace(/\/+$/, '');
  if (!v) return DEFAULT_ENDPOINT;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return DEFAULT_ENDPOINT;
    return v;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

/** A calendar day the feed can answer for: real ISO date, not before the ECB series, not
 *  in the future. Anything else means "just give me the latest fixing". */
export function normalizeRateDate(date?: string | null, today = new Date()): string | null {
  const v = (date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const asked = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(asked.getTime())) return null;
  // Round-trip guard: '2026-02-31' parses, but not back to itself.
  if (asked.toISOString().slice(0, 10) !== v) return null;
  if (v < EARLIEST) return null;
  if (v >= today.toISOString().slice(0, 10)) return null; // today / future -> latest
  return v;
}

/** `<endpoint>/latest?base=USD&symbols=EUR`, or the same with a date in place of `latest`. */
export function ratesUrl(endpoint: string, from: string, to: string, date?: string | null): string {
  const when = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'latest';
  return `${endpoint}/${when}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
}

/**
 * Pull `to`'s rate out of a Frankfurter payload. Returns null for a well-formed response
 * that simply has no such rate (unsupported currency), so the caller can say "not
 * published" instead of "unreachable" — a distinction the user needs, since only the
 * second one is worth retrying.
 */
export function parseRatesResponse(json: unknown, to: string): { rate: number; date: string } | null {
  const body = json as { date?: unknown; rates?: Record<string, unknown> } | null;
  const rates = body?.rates;
  if (!rates || typeof rates !== 'object') return null;
  const rate = Number(rates[to.toUpperCase()]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  return { rate, date };
}

/** Cached answers, keyed by the exact question. A dated fixing never changes once
 *  published, so it is kept much longer than `latest`, which moves once a day. */
const cache = new Map<string, { hit: FxRateHit; expires: number }>();
const TTL_LATEST_MS = 6 * 60 * 60 * 1000;
const TTL_DATED_MS = 30 * 24 * 60 * 60 * 1000;
/** A bound on the map so a long-lived server cannot grow it without limit. */
const MAX_CACHE = 500;

export function clearFxRateCache(): void {
  cache.clear();
}

/**
 * Look up base-units-per-1-foreign-unit, as of `date` when given (the document's own day,
 * which is the rate that actually applied to it) and the latest fixing otherwise.
 *
 * `from` is the PRINTED currency and `to` the deployment's base currency, matching the
 * direction of `fxRate` everywhere else in P9: amount = origAmount * fxRate.
 */
export async function fetchFxRate(from: string, to: string, date?: string | null): Promise<FxRateLookup> {
  const src = (from ?? '').trim().toUpperCase();
  const dst = (to ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(src) || !/^[A-Z]{3}$/.test(dst)) return { ok: false, error: 'Invalid currency code' };
  if (src === dst) return { ok: false, error: 'Same currency' };

  const day = normalizeRateDate(date);
  const key = `${src}|${dst}|${day ?? 'latest'}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { ok: true, hit: cached.hit };

  const endpoint = rateEndpoint();
  let res: Response;
  try {
    res = await fetch(ratesUrl(endpoint, src, dst, day), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, error: `Rate service unreachable (${(err as Error)?.message || 'network error'})` };
  }
  // A 404 here means the pair or the day is not in the series, which is a real answer
  // ("no rate published") rather than an outage; both other 4xx/5xx are the service.
  if (res.status === 404) return { ok: false, error: `No published rate for ${src} on that date` };
  if (!res.ok) return { ok: false, error: `Rate service responded ${res.status}` };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'Rate service returned an unreadable response' };
  }

  const parsed = parseRatesResponse(body, dst);
  if (!parsed) return { ok: false, error: `No published rate for ${src} -> ${dst}` };

  const hit: FxRateHit = { rate: parsed.rate, date: parsed.date || day || '', source: 'ECB' };
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, { hit, expires: Date.now() + (day ? TTL_DATED_MS : TTL_LATEST_MS) });
  return { ok: true, hit };
}
