import type { NextRequest } from 'next/server';

/** Shared list/pagination params for the /api/v1 read endpoints.
 *  - limit/offset: page window (limit 1..200, default 50).
 *  - updatedSince: ISO date → only docs with updatedAt >= it. When set, soft-deleted
 *    docs are ALSO returned (flagged `deleted:true`) so a mobile client doing
 *    incremental sync can drop locally-removed records. */
export type ListParams = { limit: number; offset: number; updatedSince: Date | null; sp: URLSearchParams };

export function listParams(req: NextRequest): ListParams {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
  const raw = sp.get('updatedSince');
  const d = raw ? new Date(raw) : null;
  const updatedSince = d && !Number.isNaN(d.getTime()) ? d : null;
  return { limit, offset, updatedSince, sp };
}

/** Build the Mongo filter, merging an updatedSince cursor when present. */
export function withSince(base: Record<string, unknown>, p: ListParams): Record<string, unknown> {
  return p.updatedSince ? { ...base, updatedAt: { $gte: p.updatedSince } } : base;
}

/** Uniform list envelope: { data, total, limit, offset }. */
export function listEnvelope<T>(data: T[], total: number, p: ListParams) {
  return { data, total, limit: p.limit, offset: p.offset };
}

export const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
