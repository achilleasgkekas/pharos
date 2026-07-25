import { describe, it, expect } from 'vitest';
import {
  gtinCheckDigit,
  isValidGtin,
  normalizeBarcode,
  barcodeCandidates,
  humanizeCategoryTag,
  pickCategory,
  mapOpenFactsProduct,
} from './barcode';

// P17 (server half) — the pure barcode helpers behind GET /api/v1/lookup/barcode.
// These decide whether we spend a network round-trip at all and what the client
// gets to prefill, so drift here shows up as either "valid barcode rejected" or
// an empty-titled suggestion the user cannot tell apart from a real hit.

// Real/valid GTINs (check digits verified): Nutella EAN-13, an EAN-8, a UPC-A
// and a zero-padded GTIN-14 of the same UPC-A.
const EAN13 = '3017620422003';
const EAN8 = '96385074';
const UPCA = '049000006346';
const GTIN14 = '00012345600012';

describe('gtinCheckDigit', () => {
  it('computes the mod-10 digit for each supported length', () => {
    expect(gtinCheckDigit(EAN13.slice(0, -1))).toBe(3);
    expect(gtinCheckDigit(EAN8.slice(0, -1))).toBe(4);
    expect(gtinCheckDigit(UPCA.slice(0, -1))).toBe(6);
    expect(gtinCheckDigit(GTIN14.slice(0, -1))).toBe(2);
  });
});

describe('isValidGtin', () => {
  it('accepts EAN-8 / UPC-A / EAN-13 / GTIN-14', () => {
    for (const c of [EAN8, UPCA, EAN13, GTIN14]) expect(isValidGtin(c)).toBe(true);
  });

  it('rejects a wrong check digit (the usual mis-scan)', () => {
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('049000006344')).toBe(false);
  });

  it('rejects wrong lengths and non-digits', () => {
    expect(isValidGtin('301762042200')).toBe(false); // 12 chars but not a valid UPC-A
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('301762042200X')).toBe(false);
    expect(isValidGtin('')).toBe(false);
  });
});

describe('normalizeBarcode', () => {
  it('strips the separators people type and scanner whitespace', () => {
    expect(normalizeBarcode('  3017620422003 ')).toBe(EAN13);
    expect(normalizeBarcode('301-762-042-2003')).toBe(EAN13);
    expect(normalizeBarcode('0 49000 00634 6')).toBe(UPCA);
  });

  it('returns null for anything that is not a valid GTIN', () => {
    expect(normalizeBarcode('3017620422004')).toBeNull();
    expect(normalizeBarcode('not-a-barcode')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode(undefined)).toBeNull();
  });
});

describe('barcodeCandidates', () => {
  it('tries the zero-padded EAN-13 form of a UPC-A', () => {
    expect(barcodeCandidates(UPCA)).toEqual([UPCA, '0' + UPCA]);
  });

  it('tries the unpadded 12-digit form of a zero-padded EAN-13', () => {
    expect(barcodeCandidates('0049000006346')).toEqual(['0049000006346', '049000006346']);
  });

  it('unpads a GTIN-14 down through its shorter forms', () => {
    expect(barcodeCandidates(GTIN14, 3)).toEqual([GTIN14, '0012345600012', '012345600012']);
  });

  it('caps the list so a miss cannot fan out into many requests', () => {
    expect(barcodeCandidates(GTIN14)).toHaveLength(2);
    expect(barcodeCandidates(GTIN14, 1)).toEqual([GTIN14]);
  });

  it('leaves a plain EAN-13 alone and never repeats a form', () => {
    expect(barcodeCandidates(EAN13)).toEqual([EAN13]);
    expect(new Set(barcodeCandidates(UPCA)).size).toBe(barcodeCandidates(UPCA).length);
  });
});

describe('humanizeCategoryTag / pickCategory', () => {
  it('drops the locale prefix and un-hyphenates', () => {
    expect(humanizeCategoryTag('en:breakfast-cereals')).toBe('Breakfast cereals');
    expect(humanizeCategoryTag('fr:pates-a-tartiner')).toBe('Pates a tartiner');
    expect(humanizeCategoryTag('')).toBe('');
  });

  it('picks the LAST (most specific) English tag, not the generic first one', () => {
    expect(pickCategory(['en:plant-based-foods', 'en:spreads', 'en:hazelnut-spreads'])).toBe('Hazelnut spreads');
  });

  it('falls back to non-English tags when no English one exists', () => {
    expect(pickCategory(['fr:snacks-sucres'])).toBe('Snacks sucres');
  });

  // Verified against the live Open Food Facts record for 3017620422003: the
  // untaxonomized tail entries keep their French text but still carry the
  // "en:" prefix, so naively taking the last en: tag hands back French.
  it('skips untaxonomized foreign-language tags that still carry an en: prefix', () => {
    expect(
      pickCategory([
        'en:breakfasts',
        'en:spreads',
        'en:sweet-spreads',
        'en:confectionary-based-spreads',
        'en:Petit-déjeuners',
        'en:Produits à tartiner',
        'en:Pâtes à tartiner',
      ])
    ).toBe('Confectionary based spreads');
  });

  it('still returns something when nothing is canonical', () => {
    expect(pickCategory(['en:Produits à tartiner'])).toBe('Produits à tartiner');
  });

  it('is safe on missing/blank tag lists', () => {
    expect(pickCategory(undefined)).toBe('');
    expect(pickCategory([])).toBe('');
    expect(pickCategory('en:snacks')).toBe('');
  });
});

describe('mapOpenFactsProduct', () => {
  const raw = {
    product_name: 'Nutella',
    brands: 'Ferrero, Nutella',
    categories_tags: ['en:spreads', 'en:hazelnut-spreads'],
    quantity: '400 g',
    image_front_small_url: 'https://images.example/front.jpg',
  };

  it('maps a full record onto the scan-product shape', () => {
    expect(mapOpenFactsProduct(EAN13, raw, 'openfoodfacts')).toEqual({
      name: 'Nutella',
      brand: 'Ferrero', // only the first of the comma-joined brands
      category: 'Hazelnut spreads',
      quantity: '400 g',
      notes: '',
      code: EAN13,
      image: 'https://images.example/front.jpg',
      source: 'openfoodfacts',
    });
  });

  it('falls back through the alternative name fields', () => {
    expect(mapOpenFactsProduct(EAN13, { generic_name: 'Hazelnut spread' }, 'x')?.name).toBe('Hazelnut spread');
    expect(mapOpenFactsProduct(EAN13, { product_name: '  ', product_name_en: 'Spread' }, 'x')?.name).toBe('Spread');
  });

  it('returns null for a nameless record — a blank prefill would look like a hit', () => {
    expect(mapOpenFactsProduct(EAN13, { brands: 'Ferrero' }, 'x')).toBeNull();
    expect(mapOpenFactsProduct(EAN13, {}, 'x')).toBeNull();
    expect(mapOpenFactsProduct(EAN13, null, 'x')).toBeNull();
    expect(mapOpenFactsProduct(EAN13, 'nope', 'x')).toBeNull();
  });

  it('leaves missing optional fields blank rather than undefined', () => {
    const p = mapOpenFactsProduct(EAN13, { product_name: 'Thing' }, 'openproductsfacts');
    expect(p).toMatchObject({ name: 'Thing', brand: '', category: '', quantity: '', image: '', notes: '' });
  });
});
