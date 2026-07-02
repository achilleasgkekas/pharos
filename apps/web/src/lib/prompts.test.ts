import { describe, it, expect } from 'vitest';
import { PROMPT_META, DEFAULT_SCRAPER_PRICE_PROMPT, type PromptKey } from './prompts';

// prompts.ts is the single registry behind the Settings → AI Prompts editor. PROMPT_META
// drives which prompts the UI lets the user override, and getPromptOverride(key) reads those
// overrides at each AI call site. A key in the PromptKey union but missing from PROMPT_META
// would be silently un-editable in Settings; a stray/duplicate key would render a broken row.
// The DB-backed getPromptOverride/getAllPromptOverrides are out of scope (need live Mongo);
// here we lock the pure, static registry + the default scraper prompt text.

// The canonical PromptKey set. MIRROR of the PromptKey union in prompts.ts — adding or
// removing a prompt key must update BOTH the union and this list (and PROMPT_META).
const CANONICAL_KEYS: PromptKey[] = [
  'receipt',
  'statement',
  'product',
  'card',
  'subscription',
  'category',
  'expense',
  'voucher',
  'productPhoto',
  'scraperPrice',
];

describe('PROMPT_META', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PROMPT_META)).toBe(true);
    expect(PROMPT_META.length).toBeGreaterThan(0);
  });

  it('covers exactly the canonical PromptKey set', () => {
    const keys = PROMPT_META.map((p) => p.key).sort();
    expect(keys).toEqual([...CANONICAL_KEYS].sort());
  });

  it('has unique keys (no duplicate editor rows)', () => {
    const keys = PROMPT_META.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every prompt a non-empty label and where hint', () => {
    for (const p of PROMPT_META) {
      expect(typeof p.label).toBe('string');
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(typeof p.where).toBe('string');
      expect(p.where.trim().length).toBeGreaterThan(0);
    }
  });

  it('has a distinct label per prompt (no ambiguous editor rows)', () => {
    const labels = PROMPT_META.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('exposes every canonical key as a lookup', () => {
    for (const key of CANONICAL_KEYS) {
      expect(PROMPT_META.find((p) => p.key === key)).toBeTruthy();
    }
  });
});

describe('DEFAULT_SCRAPER_PRICE_PROMPT', () => {
  it('is a non-empty instruction string', () => {
    expect(typeof DEFAULT_SCRAPER_PRICE_PROMPT).toBe('string');
    expect(DEFAULT_SCRAPER_PRICE_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('asks for JSON-only output with price/currency/inStock keys', () => {
    // The scraper parses the model reply as JSON; the prompt must pin the exact shape.
    expect(DEFAULT_SCRAPER_PRICE_PROMPT).toContain('"price"');
    expect(DEFAULT_SCRAPER_PRICE_PROMPT).toContain('"currency"');
    expect(DEFAULT_SCRAPER_PRICE_PROMPT).toContain('"inStock"');
    expect(DEFAULT_SCRAPER_PRICE_PROMPT).toMatch(/JSON only|Return ONLY JSON/i);
  });

  it('instructs a dot decimal output (EU comma vs US dot normalization)', () => {
    expect(DEFAULT_SCRAPER_PRICE_PROMPT).toMatch(/dot decimal/i);
  });

  it('has the productPhoto/scraperPrice pairing registered in PROMPT_META', () => {
    // The default text is displayed/reset via the 'scraperPrice' editor row; keep that link.
    expect(PROMPT_META.find((p) => p.key === 'scraperPrice')).toBeTruthy();
  });
});
