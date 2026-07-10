import { describe, expect, it } from 'vitest';
import { serializeExpense, vendorKey } from './lib';

// expenses/lib.ts holds the two pure, DB-free helpers kept OUT of the 'use server'
// actions module. vendorKey normalizes a provider name into a stable grouping key so
// the same vendor collapses into one recurring series; serializeExpense flattens a
// Mongo-ish document into the plain SerializedExpense wire shape with safe fallbacks.

describe('vendorKey', () => {
  it('transliterates Greek to latin so the same provider groups', () => {
    // ΔΕΗ (Greek power utility) in any casing collapses to the same key.
    expect(vendorKey('ΔΕΗ')).toBe('dei');
    expect(vendorKey('δεη')).toBe('dei');
    expect(vendorKey('ΔεΗ')).toBe('dei');
  });

  it('strips combining diacritics before mapping', () => {
    // Composed vs decomposed accented input should land on the same latin key.
    expect(vendorKey('Café')).toBe(vendorKey('Cafe'));
  });

  it('strips legal-entity suffixes as whole words', () => {
    expect(vendorKey('Foo AE')).toBe('foo');
    expect(vendorKey('Foo A.E.')).toBe('foo');
    expect(vendorKey('Acme Ltd')).toBe('acme');
    expect(vendorKey('Acme GmbH')).toBe('acme');
    expect(vendorKey('Acme Inc')).toBe('acme');
  });

  it('does not strip a suffix embedded inside another word', () => {
    // "sa" is a legal suffix, but "Visa" must not lose its trailing "sa".
    expect(vendorKey('Visa')).toBe('visa');
  });

  it('drops all non-alphanumeric characters and separators', () => {
    expect(vendorKey('PPC / ΔΕΗ')).toBe('ppcdei');
    expect(vendorKey('Store 24')).toBe('store24');
    expect(vendorKey('a-b_c.d')).toBe('abcd');
  });

  it('trims surrounding whitespace via the non-alnum strip', () => {
    expect(vendorKey('  Spotify  ')).toBe('spotify');
  });

  it('lowercases the result', () => {
    expect(vendorKey('NETFLIX')).toBe('netflix');
    expect(vendorKey('Netflix')).toBe('netflix');
  });

  it('caps the key at 40 characters', () => {
    const long = 'a'.repeat(100);
    expect(vendorKey(long)).toHaveLength(40);
  });

  it('returns empty string for empty, whitespace-only, or falsy input', () => {
    expect(vendorKey('')).toBe('');
    expect(vendorKey('   ')).toBe('');
    // A pure stopword ("the") is entirely stripped.
    expect(vendorKey('the')).toBe('');
    // Defensive: the guard `(vendor || '')` tolerates a nullish value.
    expect(vendorKey(undefined as unknown as string)).toBe('');
    expect(vendorKey(null as unknown as string)).toBe('');
  });
});

describe('serializeExpense', () => {
  it('maps a fully-populated document field-for-field', () => {
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      kind: 'income',
      vendor: 'Acme',
      vendorKey: 'acme',
      category: 'salary',
      space: 'Εξοχικό',
      amount: 1234.56,
      currency: 'USD',
      date: '2026-01-15',
      period: '2026-01',
      recurring: true,
      recurringCycle: 'monthly',
      filePath: 'expenses/2026/01/x.pdf',
      fileType: 'application/pdf',
      thumbPath: 'expenses/2026/01/x.jpg',
      fileSize: 4096,
      paymentMethod: 'card',
      notes: 'a note',
      aiModel: 'claude',
      aiParsedAt: '2026-01-15T10:00:00.000Z',
      verified: true,
      createdAt: '2026-01-15T09:00:00.000Z',
      updatedAt: '2026-01-15T09:30:00.000Z',
    };
    expect(serializeExpense(doc)).toEqual({
      _id: '507f1f77bcf86cd799439011',
      kind: 'income',
      vendor: 'Acme',
      vendorKey: 'acme',
      category: 'salary',
      space: 'Εξοχικό',
      amount: 1234.56,
      currency: 'USD',
      date: '2026-01-15',
      period: '2026-01',
      recurring: true,
      recurringCycle: 'monthly',
      filePath: 'expenses/2026/01/x.pdf',
      fileType: 'application/pdf',
      thumbPath: 'expenses/2026/01/x.jpg',
      fileSize: 4096,
      paymentMethod: 'card',
      notes: 'a note',
      aiModel: 'claude',
      aiParsedAt: '2026-01-15T10:00:00.000Z',
      verified: true,
      createdAt: '2026-01-15T09:00:00.000Z',
      updatedAt: '2026-01-15T09:30:00.000Z',
    });
  });

  it('applies safe fallbacks for a near-empty document', () => {
    const s = serializeExpense({ _id: 'abc' });
    expect(s).toEqual({
      _id: 'abc',
      kind: 'expense',
      vendor: '',
      vendorKey: '',
      category: 'other',
      space: '',
      amount: 0,
      currency: 'EUR',
      date: '',
      period: '',
      recurring: false,
      recurringCycle: '',
      filePath: '',
      fileType: '',
      thumbPath: '',
      fileSize: 0,
      paymentMethod: '',
      notes: '',
      aiModel: '',
      aiParsedAt: null,
      verified: false,
      createdAt: '',
      updatedAt: '',
    });
  });

  it('defaults kind to expense unless it is exactly "income"', () => {
    expect(serializeExpense({ _id: '1', kind: 'expense' }).kind).toBe('expense');
    expect(serializeExpense({ _id: '1', kind: 'income' }).kind).toBe('income');
    expect(serializeExpense({ _id: '1', kind: 'weird' }).kind).toBe('expense');
  });

  it('coerces recurring and verified to real booleans', () => {
    const s = serializeExpense({ _id: '1', recurring: 1, verified: 'yes' });
    expect(s.recurring).toBe(true);
    expect(s.verified).toBe(true);
    const t = serializeExpense({ _id: '1', recurring: 0, verified: '' });
    expect(t.recurring).toBe(false);
    expect(t.verified).toBe(false);
  });

  it('stringifies the _id (JSON round-trip flattens nested/ObjectId-like values)', () => {
    // JSON.parse(JSON.stringify(...)) drops functions and calls toJSON, so an
    // ObjectId-like object with a toJSON becomes its string form before String().
    const idish = { toJSON: () => '507f1f77bcf86cd799439011' };
    expect(serializeExpense({ _id: idish })._id).toBe('507f1f77bcf86cd799439011');
    expect(serializeExpense({ _id: 42 })._id).toBe('42');
  });
});
