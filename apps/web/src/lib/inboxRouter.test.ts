import { describe, it, expect } from 'vitest';
import { normalizeGuess, allowedFor, INBOX_DESTINATIONS, INBOX_HREF } from './inboxRouter';

describe('normalizeGuess', () => {
  it('keeps a clear answer and its alternatives', () => {
    const g = normalizeGuess({ destination: 'receipt', alternatives: ['expense'], title: 'AB', amount: '12.40', date: '2026-09-30', why: 'Till receipt' }, false);
    expect(g).toMatchObject({ destination: 'receipt', title: 'AB', amount: 12.4, date: '2026-09-30' });
    expect(g.alternatives[0]).toBe('expense');
    expect(g.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(g.alternatives).not.toContain('receipt');
  });

  it('fills alternatives, drops duplicates and unknown places', () => {
    const g = normalizeGuess({ destination: 'bill', alternatives: ['bill', 'pizza', 'Expense', 'expense'] }, true);
    expect(g.destination).toBe('bill');
    expect(g.alternatives).toEqual(['expense', 'document']);
  });

  it('never sends a photo to statements', () => {
    expect(allowedFor('statement', false)).toBe(false);
    const g = normalizeGuess({ destination: 'statement', alternatives: ['statement', 'expense'] }, false);
    expect(g.destination).toBe('expense');
    expect(g.alternatives).not.toContain('statement');
    expect(normalizeGuess({ destination: 'statement' }, true).destination).toBe('statement');
  });

  it('falls back to expense on nonsense and does not invent numbers', () => {
    const g = normalizeGuess({ destination: 'nope', amount: 'abc', date: 'yesterday' }, false);
    expect(g.destination).toBe('expense');
    expect(g.amount).toBeNull();
    expect(g.date).toBeNull();
    expect(normalizeGuess(null, false).destination).toBe('expense');
  });

  it('has a page for every place', () => {
    for (const d of INBOX_DESTINATIONS) expect(INBOX_HREF[d]).toMatch(/^\//);
  });
});
