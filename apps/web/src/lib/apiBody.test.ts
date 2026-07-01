import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  boolField,
  enumField,
  isObjectId,
  numField,
  readBody,
  strField,
  type Body,
} from './apiBody';

// apiBody.ts centralizes body-coercion for the /api/v1 mutation routes. Every helper
// is pure/deterministic and none of them throw, so no DOM, Mongo, or Next runtime is
// needed. `readBody` only touches `req.json()`, which we fake with a minimal object.

// Minimal NextRequest stand-in exposing just the `.json()` the helper calls. The real
// `NextRequest.json()` always returns a Promise (readBody chains `.catch` on it), so the
// fake returns a Promise too.
function fakeReq(json: () => Promise<unknown>): NextRequest {
  return { json } as unknown as NextRequest;
}

describe('isObjectId', () => {
  it('accepts a 24-char lowercase hex string', () => {
    expect(isObjectId('507f1f77bcf86cd799439011')).toBe(true);
  });

  it('is case-insensitive on hex digits', () => {
    expect(isObjectId('AABBCCDDEEFF001122334455')).toBe(true);
    expect(isObjectId('aAbBcCdDeEfF001122334455')).toBe(true);
  });

  it('rejects wrong length (23 or 25 chars)', () => {
    expect(isObjectId('507f1f77bcf86cd79943901')).toBe(false);
    expect(isObjectId('507f1f77bcf86cd7994390111')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isObjectId('507f1f77bcf86cd79943901g')).toBe(false);
    expect(isObjectId('zzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
  });

  it('rejects empty string and stray whitespace', () => {
    expect(isObjectId('')).toBe(false);
    expect(isObjectId(' 507f1f77bcf86cd799439011')).toBe(false);
    expect(isObjectId('507f1f77bcf86cd799439011 ')).toBe(false);
  });
});

describe('readBody', () => {
  it('returns the parsed JSON object on a valid body', async () => {
    const body = await readBody(fakeReq(async () => ({ name: 'x', amount: 5 })));
    expect(body).toEqual({ name: 'x', amount: 5 });
  });

  it('falls back to {} when json() rejects (bad/empty body)', async () => {
    const body = await readBody(fakeReq(() => Promise.reject(new Error('bad json'))));
    expect(body).toEqual({});
  });

  it('resolves an async json() body', async () => {
    const body = await readBody(fakeReq(async () => ({ ok: true })));
    expect(body).toEqual({ ok: true });
  });
});

describe('strField', () => {
  const b: Body = { name: 'Netflix', blank: '', num: 42, zero: 0, spaced: '  hi  ' };

  it('returns the string value for a present key', () => {
    expect(strField(b, 'name')).toBe('Netflix');
  });

  it('coerces non-string values to string', () => {
    expect(strField(b, 'num')).toBe('42');
  });

  it('uses the fallback for any falsy value (missing/empty/zero)', () => {
    expect(strField(b, 'missing', 'def')).toBe('def');
    expect(strField(b, 'blank', 'def')).toBe('def');
    expect(strField(b, 'zero', 'def')).toBe('def');
  });

  it('defaults the fallback to empty string', () => {
    expect(strField(b, 'missing')).toBe('');
  });

  it('trims only when trim=true', () => {
    expect(strField(b, 'spaced')).toBe('  hi  ');
    expect(strField(b, 'spaced', '', true)).toBe('hi');
  });

  it('trims the fallback too when trim=true', () => {
    expect(strField(b, 'missing', '  pad  ', true)).toBe('pad');
  });
});

describe('numField', () => {
  const b: Body = { n: 3.5, str: '12.5', bad: 'abc', nan: NaN, inf: Infinity, empty: '' };

  it('returns a numeric value as-is', () => {
    expect(numField(b, 'n')).toBe(3.5);
  });

  it('parses a numeric string', () => {
    expect(numField(b, 'str')).toBe(12.5);
  });

  it('returns null for a non-numeric string', () => {
    expect(numField(b, 'bad')).toBeNull();
  });

  it('returns null for a missing key', () => {
    expect(numField(b, 'missing')).toBeNull();
  });

  it('returns null for NaN and Infinity (not finite)', () => {
    expect(numField(b, 'nan')).toBeNull();
    expect(numField(b, 'inf')).toBeNull();
  });

  it('returns null for an empty-string value', () => {
    expect(numField(b, 'empty')).toBeNull();
  });

  it('accepts zero as a finite number', () => {
    expect(numField({ z: 0 }, 'z')).toBe(0);
  });
});

describe('enumField', () => {
  const allowed = ['monthly', 'yearly', 'weekly'] as const;
  const b: Body = { cycle: 'yearly', bogus: 'daily' };

  it('returns the value when it is in the allowed set', () => {
    expect(enumField(b, 'cycle', allowed, 'monthly')).toBe('yearly');
  });

  it('returns the fallback when the value is not allowed', () => {
    expect(enumField(b, 'bogus', allowed, 'monthly')).toBe('monthly');
  });

  it('returns the fallback for a missing key', () => {
    expect(enumField(b, 'missing', allowed, 'weekly')).toBe('weekly');
  });
});

describe('boolField', () => {
  it('returns true for truthy values', () => {
    expect(boolField({ x: true }, 'x')).toBe(true);
    expect(boolField({ x: 1 }, 'x')).toBe(true);
    expect(boolField({ x: 'yes' }, 'x')).toBe(true);
  });

  it('returns false for falsy or missing values', () => {
    expect(boolField({ x: false }, 'x')).toBe(false);
    expect(boolField({ x: 0 }, 'x')).toBe(false);
    expect(boolField({ x: '' }, 'x')).toBe(false);
    expect(boolField({}, 'missing')).toBe(false);
  });
});
