import type { NextRequest } from 'next/server';

/** Typed body-coercion helpers for the /api/v1 mutation routes.
 *
 *  ~25 POST/PATCH handlers repeat the same shape:
 *    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
 *    const name = String(b.name || '').trim();
 *    const amount = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount));
 *    const cycle = ['monthly', ...].includes(String(b.cycle)) ? String(b.cycle) : 'monthly';
 *    const recurring = !!b.recurring;
 *  These helpers centralize that with identical semantics (no behaviour change),
 *  so a route reads `strField(b, 'name', '', true)` / `numField(b, 'amount')` etc.
 *  None of them throw. */

export type Body = Record<string, unknown>;

/** Parse a request JSON body to a plain object; never throws (bad/empty JSON → {}). */
export async function readBody(req: NextRequest): Promise<Body> {
  return (await req.json().catch(() => ({}))) as Body;
}

/** String field. Matches `String(b[key] || fallback)` (any falsy → fallback).
 *  Pass `trim` for required reads that then check emptiness (`String(b.x || '').trim()`). */
export function strField(b: Body, key: string, fallback = '', trim = false): string {
  const s = String(b[key] || fallback);
  return trim ? s.trim() : s;
}

/** Finite number field, or null when not parseable. Matches
 *  `typeof b[key] === 'number' ? b[key] : parseFloat(String(b[key]))` + `Number.isFinite`. */
export function numField(b: Body, key: string): number | null {
  const v = b[key];
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Enum field: the value if it is one of `allowed`, otherwise `fallback`.
 *  Matches `allowed.includes(String(b[key])) ? String(b[key]) : fallback`. */
export function enumField<T extends string>(b: Body, key: string, allowed: readonly T[], fallback: T): T {
  const v = String(b[key]);
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Boolean field (truthiness). Matches `!!b[key]`. */
export function boolField(b: Body, key: string): boolean {
  return !!b[key];
}
