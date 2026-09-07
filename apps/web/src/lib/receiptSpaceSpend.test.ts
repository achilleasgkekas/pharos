import { describe, it, expect } from 'vitest';
import { receiptSpaceSpend } from './receiptSpaceSpend';

// P68 φάση 1. Ο λόγος που αυτό το αρχείο υπάρχει: το card «δαπάνες ανά χώρο» των Reports
// αθροίζει πλέον Expenses ΚΑΙ αποδείξεις, οπότε ένα λάθος εδώ δεν χαλάει ένα chart, αλλά
// λέει ψέματα για το πόσο κοστίζει ένα σπίτι.
describe('receiptSpaceSpend', () => {
  it('αθροίζει τα σύνολα ανά χώρο', () => {
    const out = receiptSpaceSpend([
      { total: 40, space: 'Kalamos' },
      { total: 12.5, space: 'Kalamos' },
      { total: 30, space: 'Athens' },
    ]);
    expect(out.get('Kalamos')).toBeCloseTo(52.5);
    expect(out.get('Athens')).toBe(30);
  });

  it('αγνοεί τις αποδείξεις χωρίς tag — η προ-P68 συμπεριφορά μένει άθικτη', () => {
    const out = receiptSpaceSpend([
      { total: 99, space: '' },
      { total: 99 },
      { total: 99, space: null },
      { total: 99, space: '   ' },
    ]);
    expect(out.size).toBe(0);
  });

  it('κόβει τα κενά γύρω από το tag ώστε «Kalamos » και «Kalamos» να είναι ένας χώρος', () => {
    const out = receiptSpaceSpend([
      { total: 10, space: ' Kalamos ' },
      { total: 5, space: 'Kalamos' },
    ]);
    expect([...out.keys()]).toEqual(['Kalamos']);
    expect(out.get('Kalamos')).toBe(15);
  });

  it('αγνοεί μη θετικά ή άκυρα ποσά αντί να τα μετρήσει ως μηδέν στο chart', () => {
    const out = receiptSpaceSpend([
      { total: 0, space: 'Kalamos' },
      { total: -20, space: 'Kalamos' },
      { total: Number.NaN, space: 'Kalamos' },
      { total: 7, space: 'Kalamos' },
    ]);
    expect(out.get('Kalamos')).toBe(7);
  });

  it('δέχεται κενή/απούσα λίστα', () => {
    expect(receiptSpaceSpend([]).size).toBe(0);
    expect(receiptSpaceSpend(null).size).toBe(0);
    expect(receiptSpaceSpend(undefined).size).toBe(0);
  });
});
