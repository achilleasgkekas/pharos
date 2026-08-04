import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { listParams, withSince, listEnvelope, iso, type ListParams } from './apiList';

// apiList holds the shared list/pagination contract for EVERY /api/v1 read endpoint
// (receipts, tasks, expenses, subscriptions, statements, …) that API clients poll
// for incremental sync. A regression here silently corrupts every list fetch:
// wrong page windows, a dropped updatedSince cursor (→ full re-download or missed
// deletes), or a changed envelope shape the client can't parse. These tests pin the
// ACTUAL clamp/parse behavior so the sync contract can't drift unnoticed.

// listParams only ever reads `req.url`, so a minimal stand-in is enough (same pattern
// as apiBody.test.ts's fakeReq). Building it from a full URL exercises the real
// `new URL(...).searchParams` path the helper uses.
function reqFor(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}
const BASE = 'https://pharos.local/api/v1/receipts';
const parse = (query = '') => listParams(reqFor(query ? `${BASE}?${query}` : BASE));

describe('listParams — defaults', () => {
  it('with no query params returns limit 50, offset 0, no cursor', () => {
    const p = parse();
    expect(p.limit).toBe(50);
    expect(p.offset).toBe(0);
    expect(p.updatedSince).toBeNull();
  });

  it('exposes a URLSearchParams for endpoint-specific filters', () => {
    const p = parse('kind=income&status=open');
    expect(p.sp).toBeInstanceOf(URLSearchParams);
    expect(p.sp.get('kind')).toBe('income');
    expect(p.sp.get('status')).toBe('open');
  });
});

describe('listParams — limit clamping (1..200, default 50)', () => {
  it('accepts an in-range value', () => {
    expect(parse('limit=25').limit).toBe(25);
  });

  it('clamps above the 200 ceiling', () => {
    expect(parse('limit=500').limit).toBe(200);
    expect(parse('limit=201').limit).toBe(200);
  });

  it('keeps exactly 200', () => {
    expect(parse('limit=200').limit).toBe(200);
  });

  it('clamps a negative value up to the floor of 1', () => {
    expect(parse('limit=-5').limit).toBe(1);
  });

  it('treats limit=0 as the default 50 (0 is falsy → ||50)', () => {
    expect(parse('limit=0').limit).toBe(50);
  });

  it('falls back to 50 for a non-numeric value', () => {
    expect(parse('limit=abc').limit).toBe(50);
  });

  it('falls back to 50 for an empty value', () => {
    expect(parse('limit=').limit).toBe(50);
  });

  it('truncates a fractional value via parseInt', () => {
    expect(parse('limit=25.9').limit).toBe(25);
  });
});

describe('listParams — offset clamping (>=0, default 0)', () => {
  it('accepts an in-range value', () => {
    expect(parse('offset=100').offset).toBe(100);
  });

  it('clamps a negative value up to 0', () => {
    expect(parse('offset=-3').offset).toBe(0);
  });

  it('treats offset=0 as 0', () => {
    expect(parse('offset=0').offset).toBe(0);
  });

  it('falls back to 0 for a non-numeric value', () => {
    expect(parse('offset=xyz').offset).toBe(0);
  });

  it('falls back to 0 for an empty value', () => {
    expect(parse('offset=').offset).toBe(0);
  });

  it('truncates a fractional value via parseInt', () => {
    expect(parse('offset=10.7').offset).toBe(10);
  });
});

describe('listParams — updatedSince cursor', () => {
  it('parses a valid ISO datetime into a Date', () => {
    const p = parse('updatedSince=2026-06-04T10:00:00.000Z');
    expect(p.updatedSince).toBeInstanceOf(Date);
    expect(p.updatedSince?.toISOString()).toBe('2026-06-04T10:00:00.000Z');
  });

  it('parses a date-only value', () => {
    const p = parse('updatedSince=2026-06-04');
    expect(p.updatedSince?.toISOString()).toBe('2026-06-04T00:00:00.000Z');
  });

  it('returns null for an unparseable date string', () => {
    expect(parse('updatedSince=not-a-date').updatedSince).toBeNull();
  });

  it('returns null when the param is absent', () => {
    expect(parse('limit=10').updatedSince).toBeNull();
  });

  it('returns null for an empty value', () => {
    expect(parse('updatedSince=').updatedSince).toBeNull();
  });
});

describe('listParams — combined', () => {
  it('parses all fields together', () => {
    const p = parse('limit=30&offset=60&updatedSince=2026-01-01T00:00:00.000Z');
    expect(p.limit).toBe(30);
    expect(p.offset).toBe(60);
    expect(p.updatedSince?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

// A minimal ListParams factory for the pure filter/envelope helpers (which never touch
// the request — only .limit/.offset/.updatedSince).
const params = (over: Partial<ListParams> = {}): ListParams => ({
  limit: 50,
  offset: 0,
  updatedSince: null,
  sp: new URLSearchParams(),
  ...over,
});

describe('withSince', () => {
  it('returns the base filter unchanged when there is no cursor', () => {
    const base = { kind: 'income' };
    expect(withSince(base, params())).toEqual({ kind: 'income' });
  });

  it('merges an updatedAt $gte cursor when set', () => {
    const d = new Date('2026-06-04T00:00:00.000Z');
    expect(withSince({ kind: 'income' }, params({ updatedSince: d }))).toEqual({
      kind: 'income',
      updatedAt: { $gte: d },
    });
  });

  it('does not mutate the base filter object', () => {
    const base = { status: 'open' };
    withSince(base, params({ updatedSince: new Date('2026-06-04') }));
    expect(base).toEqual({ status: 'open' });
  });

  it('applies to an empty base filter', () => {
    const d = new Date('2026-06-04T00:00:00.000Z');
    expect(withSince({}, params({ updatedSince: d }))).toEqual({ updatedAt: { $gte: d } });
  });

  it('the cursor overrides an existing updatedAt in the base', () => {
    const d = new Date('2026-06-04T00:00:00.000Z');
    const out = withSince({ updatedAt: { $lt: new Date(0) } }, params({ updatedSince: d }));
    expect(out.updatedAt).toEqual({ $gte: d });
  });
});

describe('listEnvelope', () => {
  it('wraps data with total and the page window from params', () => {
    const data = [{ id: 'a' }, { id: 'b' }];
    expect(listEnvelope(data, 7, params({ limit: 20, offset: 40 }))).toEqual({
      data,
      total: 7,
      limit: 20,
      offset: 40,
    });
  });

  it('passes the data array through by reference', () => {
    const data = [1, 2, 3];
    expect(listEnvelope(data, 3, params()).data).toBe(data);
  });

  it('handles an empty page', () => {
    expect(listEnvelope([], 0, params())).toEqual({ data: [], total: 0, limit: 50, offset: 0 });
  });
});

describe('iso', () => {
  it('serializes a Date to an ISO string', () => {
    expect(iso(new Date('2026-06-04T10:00:00.000Z'))).toBe('2026-06-04T10:00:00.000Z');
  });

  it('normalizes a date string to full ISO', () => {
    expect(iso('2026-06-04')).toBe('2026-06-04T00:00:00.000Z');
  });

  it('returns null for null, undefined and empty string', () => {
    expect(iso(null)).toBeNull();
    expect(iso(undefined)).toBeNull();
    expect(iso('')).toBeNull();
  });
});
