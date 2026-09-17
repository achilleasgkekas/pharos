import { describe, it, expect } from 'vitest';
import { aliasToLearn } from './storeLearning';
import { matchIn, type StoreLite } from './storeService';

// P60 (#13): a verified store correction teaches the old text as an alias of the chosen store —
// but only when that cannot hijack a different real store.
const stores: StoreLite[] = [
  { name: 'Κωτσόβολος', aliases: ['kotsovolos', 'κωτσοβολος'] },
  { name: 'TechLamb', aliases: ['techlamb'] },
  { name: 'ΤΕΧΝΟΛΑΜΠ ΜΟΝΟΠΡΟΣΩΠΗ Α.Ε.', aliases: ['τεχνολαμπ μονοπροσωπη α.ε.'], auto: true },
];

describe('aliasToLearn', () => {
  it('learns the raw text of an auto-created store as an alias of the store the user picked', () => {
    expect(aliasToLearn('ΤΕΧΝΟΛΑΜΠ ΜΟΝΟΠΡΟΣΩΠΗ Α.Ε.', 'TechLamb', stores)).toEqual({
      target: 'TechLamb',
      alias: 'τεχνολαμπ μονοπροσωπη α.ε.',
    });
  });

  it('learns text that is on no store at all', () => {
    expect(aliasToLearn('TL Computers Athens', 'techlamb', stores)).toEqual({ target: 'TechLamb', alias: 'tl computers athens' });
  });

  it('NEVER teaches a real store’s name to another store (the Κωτσόβολος → TechLamb case)', () => {
    expect(aliasToLearn('Κωτσόβολος', 'TechLamb', stores)).toBeNull();
    expect(aliasToLearn('Kotsovolos Syntagma', 'TechLamb', stores)).toBeNull(); // substring of a curated alias
  });

  it('skips non-corrections, placeholders, unknown targets, known aliases and tiny strings', () => {
    expect(aliasToLearn('TechLamb', 'techlamb', stores)).toBeNull();
    expect(aliasToLearn('Unknown store', 'TechLamb', stores)).toBeNull();
    expect(aliasToLearn('Something', 'Not A Managed Store', stores)).toBeNull();
    expect(aliasToLearn('techlamb', 'TechLamb', stores)).toBeNull();
    expect(aliasToLearn('TL', 'TechLamb', stores)).toBeNull();
    expect(aliasToLearn('', 'TechLamb', stores)).toBeNull();
  });
});

describe('matchIn prefers curated stores over auto-created ones (#13)', () => {
  it('once learned, the raw text resolves to the real store even though the auto store still exists', () => {
    const learned: StoreLite[] = [
      { name: 'A-auto', aliases: ['acme hardware sa'], auto: true }, // sorts first
      { name: 'Acme', aliases: ['acme hardware sa'] },
    ];
    expect(matchIn('ACME HARDWARE SA', learned)).toBe('Acme');
  });
});
