import { describe, expect, it } from 'vitest';
import { cardFieldsFromBody } from './cardFields';

// cardFields.ts is a pure, dependency-free validator: it coerces a JSON request
// body into a payment-card `$set` object. No DB, no clock, no fs. `partial=false`
// is the create path (name required), `partial=true` is the update path (every
// field optional, set only when present + valid). These tests lock the exact
// coercion + guard semantics shared by POST and PATCH /api/v1/cards.

describe('cardFieldsFromBody — name (required on create)', () => {
  it('returns null when name is missing on create', () => {
    expect(cardFieldsFromBody({}, false)).toBeNull();
  });

  it('returns null when name is blank/whitespace on create', () => {
    expect(cardFieldsFromBody({ name: '   ' }, false)).toBeNull();
    expect(cardFieldsFromBody({ name: '' }, false)).toBeNull();
  });

  it('returns null when name is a non-string on create', () => {
    expect(cardFieldsFromBody({ name: 123 }, false)).toBeNull();
    expect(cardFieldsFromBody({ name: null }, false)).toBeNull();
  });

  it('trims a valid name on create', () => {
    expect(cardFieldsFromBody({ name: '  Εθνική  ' }, false)).toEqual({ name: 'Εθνική' });
  });

  it('does not require name on update — empty body yields empty $set', () => {
    expect(cardFieldsFromBody({}, true)).toEqual({});
  });

  it('omits (does not null out) a blank name on update rather than returning null', () => {
    expect(cardFieldsFromBody({ name: '   ' }, true)).toEqual({});
  });
});

describe('cardFieldsFromBody — last4', () => {
  it('strips non-digits and caps at 4', () => {
    expect(cardFieldsFromBody({ name: 'C', last4: '1234' }, false)).toMatchObject({ last4: '1234' });
    expect(cardFieldsFromBody({ name: 'C', last4: '**** 7791' }, false)).toMatchObject({ last4: '7791' });
    expect(cardFieldsFromBody({ name: 'C', last4: '123456789' }, false)).toMatchObject({ last4: '1234' });
  });

  it('yields an empty string when there are no digits (still set)', () => {
    const set = cardFieldsFromBody({ name: 'C', last4: 'abcd' }, false);
    expect(set).toMatchObject({ last4: '' });
  });

  it('ignores a non-string last4', () => {
    const set = cardFieldsFromBody({ name: 'C', last4: 1234 }, false)!;
    expect(set).not.toHaveProperty('last4');
  });
});

describe('cardFieldsFromBody — enums (kind, type)', () => {
  it('accepts valid kind values', () => {
    expect(cardFieldsFromBody({ name: 'C', kind: 'credit' }, false)).toMatchObject({ kind: 'credit' });
    expect(cardFieldsFromBody({ name: 'C', kind: 'debit' }, false)).toMatchObject({ kind: 'debit' });
  });

  it('rejects an unknown kind', () => {
    const set = cardFieldsFromBody({ name: 'C', kind: 'prepaid' }, false)!;
    expect(set).not.toHaveProperty('kind');
  });

  it('accepts valid type values', () => {
    for (const t of ['mastercard', 'visa', 'amex', 'maestro', 'other']) {
      expect(cardFieldsFromBody({ name: 'C', type: t }, false)).toMatchObject({ type: t });
    }
  });

  it('rejects an unknown type', () => {
    const set = cardFieldsFromBody({ name: 'C', type: 'discover' }, false)!;
    expect(set).not.toHaveProperty('type');
  });
});

describe('cardFieldsFromBody — bank, color, notes', () => {
  it('trims bank and color', () => {
    expect(cardFieldsFromBody({ name: 'C', bank: '  NBG  ', color: '  #fff  ' }, false)).toMatchObject({
      bank: 'NBG',
      color: '#fff',
    });
  });

  it('ignores a blank color (must be non-empty after trim)', () => {
    const set = cardFieldsFromBody({ name: 'C', color: '   ' }, false)!;
    expect(set).not.toHaveProperty('color');
  });

  it('sets bank even when blank after trim (empty-string is written)', () => {
    // bank has no non-empty guard — unlike color — so a whitespace value trims to ''.
    expect(cardFieldsFromBody({ name: 'C', bank: '   ' }, false)).toMatchObject({ bank: '' });
  });

  it('trims notes, keeping an empty string when blank', () => {
    expect(cardFieldsFromBody({ name: 'C', notes: '  hi  ' }, false)).toMatchObject({ notes: 'hi' });
    expect(cardFieldsFromBody({ name: 'C', notes: '   ' }, false)).toMatchObject({ notes: '' });
  });
});

describe('cardFieldsFromBody — creditLimit', () => {
  it('coerces a numeric string and clamps negatives to 0', () => {
    expect(cardFieldsFromBody({ name: 'C', creditLimit: '5000' }, false)).toMatchObject({ creditLimit: 5000 });
    expect(cardFieldsFromBody({ name: 'C', creditLimit: -50 }, false)).toMatchObject({ creditLimit: 0 });
  });

  it('accepts 0', () => {
    expect(cardFieldsFromBody({ name: 'C', creditLimit: 0 }, false)).toMatchObject({ creditLimit: 0 });
  });

  it('ignores non-finite / unparseable values', () => {
    const a = cardFieldsFromBody({ name: 'C', creditLimit: 'abc' }, false)!;
    expect(a).not.toHaveProperty('creditLimit');
    const b = cardFieldsFromBody({ name: 'C', creditLimit: NaN }, false)!;
    expect(b).not.toHaveProperty('creditLimit');
  });

  it('ignores null/undefined but not 0', () => {
    expect(cardFieldsFromBody({ name: 'C', creditLimit: null }, false)!).not.toHaveProperty('creditLimit');
    expect(cardFieldsFromBody({ name: 'C', creditLimit: undefined }, false)!).not.toHaveProperty('creditLimit');
  });
});

describe('cardFieldsFromBody — active', () => {
  it('sets a boolean active in either direction', () => {
    expect(cardFieldsFromBody({ name: 'C', active: true }, false)).toMatchObject({ active: true });
    expect(cardFieldsFromBody({ name: 'C', active: false }, false)).toMatchObject({ active: false });
  });

  it('ignores a non-boolean active', () => {
    const set = cardFieldsFromBody({ name: 'C', active: 'yes' }, false)!;
    expect(set).not.toHaveProperty('active');
  });
});

describe('cardFieldsFromBody — full body integration', () => {
  it('builds a complete $set from a valid create body', () => {
    const set = cardFieldsFromBody(
      {
        name: '  My Card ',
        last4: 'xx 7791',
        bank: ' NBG ',
        kind: 'credit',
        type: 'mastercard',
        color: '#a55eea',
        creditLimit: '3000',
        notes: ' primary ',
        active: true,
      },
      false,
    );
    expect(set).toEqual({
      name: 'My Card',
      last4: '7791',
      bank: 'NBG',
      kind: 'credit',
      type: 'mastercard',
      color: '#a55eea',
      creditLimit: 3000,
      notes: 'primary',
      active: true,
    });
  });

  it('silently drops invalid fields while keeping valid ones', () => {
    const set = cardFieldsFromBody(
      { name: 'C', kind: 'bogus', type: 'bogus', active: 'nope', last4: 42 },
      false,
    );
    expect(set).toEqual({ name: 'C' });
  });
});
