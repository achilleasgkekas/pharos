import { describe, it, expect } from 'vitest';
import { mergeActivity, type ActivityEvent } from './activity';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
  kind: 'added',
  type: 'item',
  id: 'a',
  title: 'Router',
  userId: 'u1',
  at: '2026-09-20T10:00:00.000Z',
  href: '/items?open=a',
  ...over,
});

describe('mergeActivity', () => {
  it('merges several collections into one list, newest first', () => {
    const out = mergeActivity([
      [ev({ id: 'i1', at: '2026-09-20T10:00:00Z' }), ev({ id: 'i2', at: '2026-09-22T10:00:00Z' })],
      [ev({ type: 'expense', id: 'e1', at: '2026-09-21T10:00:00Z' })],
    ]);
    expect(out.map((e) => e.id)).toEqual(['i2', 'e1', 'i1']);
  });

  it('caps the feed', () => {
    const many = Array.from({ length: 150 }, (_, n) => ev({ id: `i${n}`, at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString() }));
    const out = mergeActivity([many]);
    expect(out).toHaveLength(100);
    expect(out[0].id).toBe('i149');
  });

  it('keeps an add and a delete of the same record as two lines', () => {
    const out = mergeActivity([[ev({ at: '2026-09-20T10:00:00Z' })], [ev({ kind: 'deleted', at: '2026-09-21T10:00:00Z', href: null })]]);
    expect(out.map((e) => e.kind)).toEqual(['deleted', 'added']);
  });

  it('drops duplicate events for the same record and kind, keeping the latest', () => {
    const out = mergeActivity([[ev({ kind: 'deleted', at: '2026-09-20T10:00:00Z' }), ev({ kind: 'deleted', at: '2026-09-25T10:00:00Z' })]]);
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe('2026-09-25T10:00:00Z');
  });

  it('ignores events with no user or an unreadable time', () => {
    expect(mergeActivity([[ev({ userId: '' }), ev({ id: 'b', at: 'not a date' })]])).toEqual([]);
  });
});
