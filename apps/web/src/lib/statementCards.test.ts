import { describe, expect, it } from 'vitest';
import { statementsWithCurrentCards } from './statementCards';

const snapshot = { cardId: 'c1', card: 'Wrong bank 1111', last4: '1111', totalAmount: 125,
  transactions: [{ description: 'Original charge', amount: 125 }] };

describe('statement card display after editing a managed card', () => {
  it('updates already imported statements on the next render without rewriting their data', () => {
    const cards = [{ _id: 'c1', name: 'Wrong bank', last4: '1111' }];
    expect(statementsWithCurrentCards([snapshot], cards)[0].card).toBe('Wrong bank 1111');
    cards[0] = { _id: 'c1', name: 'Correct bank Visa', last4: '4321' };
    const [shown] = statementsWithCurrentCards([snapshot], cards);
    expect(shown).toMatchObject({ card: 'Correct bank Visa 4321', last4: '4321', totalAmount: 125 });
    expect(shown.transactions).toBe(snapshot.transactions);
    expect(snapshot.card).toBe('Wrong bank 1111');
    expect(snapshot.last4).toBe('1111');
  });

  it('updates every linked statement while leaving other cards and legacy snapshots intact', () => {
    const other = { ...snapshot, cardId: 'c2' };
    const legacy = { ...snapshot, cardId: null };
    const result = statementsWithCurrentCards([snapshot, { ...snapshot }, other, legacy],
      [{ _id: 'c1', name: 'Visa 4321', last4: '4321' }]);
    expect(result.slice(0, 2).map((s) => s.card)).toEqual(['Visa 4321', 'Visa 4321']);
    expect(result[2]).toBe(other);
    expect(result[3]).toBe(legacy);
  });

  it('does not guess another workspace/card by matching the old last four digits', () => {
    expect(statementsWithCurrentCards([snapshot], [{ _id: 'other', name: 'Unrelated', last4: '1111' }])[0]).toBe(snapshot);
    expect(statementsWithCurrentCards([snapshot], [])[0]).toBe(snapshot);
  });

  it('reflects cleared digits instead of falling back to the incorrect imported digits', () => {
    expect(statementsWithCurrentCards([snapshot], [{ _id: 'c1', name: 'Visa', last4: '' }])[0])
      .toMatchObject({ card: 'Visa', last4: '' });
  });
});
