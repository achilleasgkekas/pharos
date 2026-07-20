import { describe, it, expect } from 'vitest';
import {
  encodeActivityCursor,
  decodeActivityCursor,
  cursorAfterRow,
  cursorFilter,
  splitPage,
} from './activityCursor';

const ID_A = '507f1f77bcf86cd799439011';
const ISO = '2026-07-20T10:00:00.000Z';

describe('encodeActivityCursor / decodeActivityCursor', () => {
  it('round-trips a cursor through encode then decode', () => {
    const cursor = { createdAt: ISO, id: ID_A };
    expect(decodeActivityCursor(encodeActivityCursor(cursor))).toEqual(cursor);
  });

  it('rejects non-string input', () => {
    expect(decodeActivityCursor(undefined)).toBeNull();
    expect(decodeActivityCursor(null)).toBeNull();
    expect(decodeActivityCursor(123)).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(decodeActivityCursor('')).toBeNull();
  });

  it('rejects a string with no separator', () => {
    expect(decodeActivityCursor('no-separator-here')).toBeNull();
  });

  it('rejects a non-ObjectId id half', () => {
    expect(decodeActivityCursor(`${ISO}~not-an-object-id`)).toBeNull();
    expect(decodeActivityCursor(`${ISO}~${ID_A}extra`)).toBeNull();
  });

  it('rejects an unparseable date half', () => {
    expect(decodeActivityCursor(`not-a-date~${ID_A}`)).toBeNull();
  });

  it('is case-insensitive on the ObjectId hex', () => {
    expect(decodeActivityCursor(`${ISO}~${ID_A.toUpperCase()}`)).toEqual({
      createdAt: ISO,
      id: ID_A.toUpperCase(),
    });
  });
});

describe('cursorAfterRow', () => {
  it('builds a cursor from a row with an id and createdAt', () => {
    expect(cursorAfterRow({ id: ID_A, createdAt: ISO })).toEqual({ createdAt: ISO, id: ID_A });
  });

  it('returns null when createdAt is null', () => {
    expect(cursorAfterRow({ id: ID_A, createdAt: null })).toBeNull();
  });
});

describe('cursorFilter', () => {
  it('builds a keyset $or fragment: strictly-earlier createdAt, or same-instant tie broken by _id', () => {
    const filter = cursorFilter({ createdAt: ISO, id: ID_A });
    expect(filter).toEqual({
      $or: [{ createdAt: { $lt: new Date(ISO) } }, { createdAt: new Date(ISO), _id: { $lt: ID_A } }],
    });
  });
});

describe('splitPage', () => {
  it('reports no more when items fit within the limit', () => {
    expect(splitPage([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], hasMore: false });
  });

  it('reports no more for fewer items than the limit', () => {
    expect(splitPage([1, 2], 5)).toEqual({ items: [1, 2], hasMore: false });
  });

  it('trims to the limit and reports more when the fetch over-fetched by one', () => {
    expect(splitPage([1, 2, 3, 4], 3)).toEqual({ items: [1, 2, 3], hasMore: true });
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4];
    splitPage(input, 2);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('handles an empty array', () => {
    expect(splitPage([], 5)).toEqual({ items: [], hasMore: false });
  });
});
