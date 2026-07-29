// Tests for the subdomain transliteration step.
//
// Why this matters more than it looks: `transliterate` runs BEFORE the a-z0-9 filter in
// `slugify`, and the resulting slug becomes the tenant's permanent subdomain AND its database
// name (`tenant_<slug>`). A change here silently re-routes new signups, so every mapping below
// is pinned on purpose — a future edit must be a deliberate decision, not a side effect.
import { describe, it, expect } from 'vitest';
import { transliterate, GREEK_MAP } from './translit';

describe('transliterate — Greek', () => {
  it('maps a lowercase Greek word to Latin', () => {
    expect(transliterate('καλημερα')).toBe('kalimera');
    expect(transliterate('πλαισιο')).toBe('plaisio');
  });

  it('lowercases uppercase Greek before mapping', () => {
    // Capitals are what people actually type for a company name ('ΠΛΑΙΣΙΟ ΑΕ').
    expect(transliterate('ΠΛΑΙΣΙΟ')).toBe('plaisio');
    expect(transliterate('Κωτσόβολος')).toBe('kotsovolos');
    expect(transliterate('ΑΕ')).toBe('ae');
  });

  it('strips Greek accents rather than leaving a stray mark', () => {
    // 'ά' → NFKD → 'α' + combining acute → mark dropped → 'a'. If the mark survived, the
    // alnum filter downstream would turn it into a hyphen and split the word.
    expect(transliterate('Θεσσαλονίκη')).toBe('thessaloniki');
    expect(transliterate('Ωμέγα')).toBe('omega');
    expect(transliterate('ΐ')).toBe('i'); // two stacked marks (dialytika + tonos)
  });

  it('maps FINAL sigma the same as medial sigma', () => {
    // 'ς' only ever appears word-final; mapping it to anything else would produce two
    // different slugs for the same name depending on where the word breaks.
    expect(transliterate('σοφός')).toBe('sofos');
    expect(transliterate('ς')).toBe(transliterate('σ'));
  });

  it('expands the multi-letter mappings', () => {
    // θ/χ/ψ produce TWO Latin chars each, so a transliterated slug can be longer than the
    // input. The 40-char cap in slugify runs after this, so length stays bounded.
    expect(transliterate('θ')).toBe('th');
    expect(transliterate('χ')).toBe('ch');
    expect(transliterate('ψ')).toBe('ps');
    expect(transliterate('ΨΥΞΗ')).toBe('psyxi');
  });

  it('covers the whole lowercase alphabet with ASCII-only output', () => {
    const alphabet = 'αβγδεζηθικλμνξοπρστυφχψω';
    const out = transliterate(alphabet);
    expect(out).toMatch(/^[a-z]+$/);
    expect(out.length).toBeGreaterThan(alphabet.length); // th/ch/ps expansions
  });

  it('keeps the table free of anything that is not plain ASCII lowercase', () => {
    // A stray uppercase or accented value here would survive into a subdomain label and
    // break DNS validity in a way that is very hard to trace back to this file.
    for (const [greek, latin] of Object.entries(GREEK_MAP)) {
      expect(latin, `mapping for ${greek}`).toMatch(/^[a-z]+$/);
    }
  });
});

describe('transliterate — Latin', () => {
  it('folds a mid-word accent away instead of leaving a combining mark', () => {
    expect(transliterate('Müller')).toBe('muller');
    expect(transliterate('Renée')).toBe('renee');
    expect(transliterate('Café')).toBe('cafe');
  });

  it('leaves an already-ASCII name byte-for-byte identical apart from case', () => {
    // The overwhelmingly common path: it must not perturb 'acme-corp' in any way.
    expect(transliterate('acme-corp')).toBe('acme-corp');
    expect(transliterate('ACME Corp 42')).toBe('acme corp 42');
  });

  it('does NOT strip punctuation or whitespace (that is slugify’s job)', () => {
    // Separation of concerns: this function only changes the ALPHABET. If it also collapsed
    // separators, slugify's hyphen rules would be applied to a partly-processed string.
    expect(transliterate('a  b.c/d')).toBe('a  b.c/d');
  });
});

describe('transliterate — untouched scripts and edge cases', () => {
  it('passes through scripts with no mapping table', () => {
    // Cyrillic and CJK survive here and are dropped later by the a-z0-9 filter, which is
    // what keeps those names on the random-label fallback.
    expect(transliterate('日本語')).toBe('日本語');
    expect(transliterate('Привет')).toBe('привет'); // lowercased, not transliterated
  });

  it('handles mixed Greek + Latin + digits in one name', () => {
    expect(transliterate('Πλαίσιο Store 42')).toBe('plaisio store 42');
  });

  it('tolerates empty and nullish input without throwing', () => {
    expect(transliterate('')).toBe('');
    expect(transliterate(undefined as unknown as string)).toBe('');
    expect(transliterate(null as unknown as string)).toBe('');
  });

  it('is idempotent on its own output', () => {
    // Guards against a future mapping whose Latin output is itself re-mapped.
    const once = transliterate('Πλαίσιο ΑΕ Müller');
    expect(transliterate(once)).toBe(once);
  });
});
