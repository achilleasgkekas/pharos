import { describe, expect, it } from 'vitest';
import {
  priceForModel,
  looksVisionModel,
  PROVIDER_RECOMMEND,
  SCRAPER_RECOMMEND,
} from './aiModels';

// aiModels.ts is client-safe, dependency-free data + two pure helpers: no DB, no
// clock, no fs. `priceForModel` looks up an approximate USD/1M-token price from a
// static table by substring, with the LONGEST matching key winning (so
// "gpt-4o-mini" beats "gpt-4o"). `looksVisionModel` is a loose can-read-images
// heuristic. These tests lock the exact match + tie-break + heuristic semantics.

describe('priceForModel — longest-substring-match wins', () => {
  it('prefers the more specific key when two keys both match', () => {
    // "gpt-4o-mini" (11 chars) beats "gpt-4o" (6 chars) for an id containing both.
    expect(priceForModel('gpt-4o-mini')).toEqual({ in: 0.15, out: 0.6 });
    // Plain gpt-4o (no "-mini") falls to the shorter key.
    expect(priceForModel('gpt-4o')).toEqual({ in: 2.5, out: 10 });
    expect(priceForModel('gpt-4o-2024-08-06')).toEqual({ in: 2.5, out: 10 });
  });

  it('prefers claude-3-5-haiku over claude-3-haiku', () => {
    expect(priceForModel('claude-3-5-haiku-latest')).toEqual({ in: 0.8, out: 4 });
    expect(priceForModel('claude-3-haiku-20240307')).toEqual({ in: 0.25, out: 1.25 });
  });

  it('prefers gpt-4.1-mini / gpt-4.1-nano over bare gpt-4.1', () => {
    expect(priceForModel('gpt-4.1-mini')).toEqual({ in: 0.4, out: 1.6 });
    expect(priceForModel('gpt-4.1-nano')).toEqual({ in: 0.1, out: 0.4 });
    expect(priceForModel('gpt-4.1')).toEqual({ in: 2, out: 8 });
  });
});

describe('priceForModel — case-insensitive', () => {
  it('matches regardless of case', () => {
    expect(priceForModel('GPT-4O-MINI')).toEqual({ in: 0.15, out: 0.6 });
    expect(priceForModel('Claude-Sonnet-4-5-20250929')).toEqual({ in: 3, out: 15 });
  });
});

describe('priceForModel — provider families', () => {
  it('prices Anthropic ids', () => {
    expect(priceForModel('claude-opus-4-20250514')).toEqual({ in: 15, out: 75 });
    expect(priceForModel('claude-sonnet-4-5-20250929')).toEqual({ in: 3, out: 15 });
    expect(priceForModel('claude-3-7-sonnet-latest')).toEqual({ in: 3, out: 15 });
    expect(priceForModel('claude-3-5-sonnet-20241022')).toEqual({ in: 3, out: 15 });
    expect(priceForModel('claude-haiku-4-5')).toEqual({ in: 1, out: 5 });
    expect(priceForModel('claude-3-opus-20240229')).toEqual({ in: 15, out: 75 });
  });

  it('prices OpenAI reasoning ids', () => {
    expect(priceForModel('o4-mini')).toEqual({ in: 1.1, out: 4.4 });
    expect(priceForModel('o3-mini')).toEqual({ in: 1.1, out: 4.4 });
  });

  it('prices Gemini ids', () => {
    expect(priceForModel('gemini-2.5-pro')).toEqual({ in: 1.25, out: 10 });
    expect(priceForModel('gemini-2.5-flash')).toEqual({ in: 0.3, out: 2.5 });
    expect(priceForModel('gemini-2.0-flash')).toEqual({ in: 0.1, out: 0.4 });
    expect(priceForModel('gemini-1.5-pro-latest')).toEqual({ in: 1.25, out: 5 });
    expect(priceForModel('gemini-1.5-flash')).toEqual({ in: 0.075, out: 0.3 });
  });
});

describe('priceForModel — unknown models', () => {
  it('returns null for ids that match no key', () => {
    expect(priceForModel('llama3.2:latest')).toBeNull();
    expect(priceForModel('qwen2.5vl:7b')).toBeNull();
    expect(priceForModel('mistral-large')).toBeNull();
    expect(priceForModel('')).toBeNull();
  });
});

describe('looksVisionModel — negative-first guard', () => {
  it('rejects text/embed/audio/legacy ids even if they otherwise look vision-y', () => {
    expect(looksVisionModel('gpt-3.5-turbo')).toBe(false);
    expect(looksVisionModel('text-embedding-3-large')).toBe(false);
    expect(looksVisionModel('whisper-1')).toBe(false);
    expect(looksVisionModel('tts-1')).toBe(false);
    expect(looksVisionModel('davinci-002')).toBe(false);
    expect(looksVisionModel('text-moderation-latest')).toBe(false);
    // "instruct" is a negative marker: gpt-4o-instruct is excluded despite gpt-4o.
    expect(looksVisionModel('gpt-4o-instruct')).toBe(false);
  });
});

describe('looksVisionModel — positive matches', () => {
  it('accepts vision-capable cloud ids', () => {
    expect(looksVisionModel('gpt-4o')).toBe(true);
    expect(looksVisionModel('gpt-4o-mini')).toBe(true);
    expect(looksVisionModel('gpt-4.1-mini')).toBe(true);
    expect(looksVisionModel('o4-mini')).toBe(true);
    expect(looksVisionModel('claude-3-5-sonnet-20241022')).toBe(true);
    expect(looksVisionModel('claude-3-7-sonnet-latest')).toBe(true);
    expect(looksVisionModel('claude-sonnet-4-5-20250929')).toBe(true);
    expect(looksVisionModel('claude-opus-4-20250514')).toBe(true);
    expect(looksVisionModel('claude-haiku-4-5')).toBe(true);
    expect(looksVisionModel('gemini-2.0-flash')).toBe(true);
  });

  it('accepts local vision model ids by marker', () => {
    expect(looksVisionModel('qwen2.5vl:7b')).toBe(true);
    expect(looksVisionModel('llava:13b')).toBe(true);
    expect(looksVisionModel('minicpm-v:8b')).toBe(true);
    expect(looksVisionModel('pixtral-12b')).toBe(true);
    expect(looksVisionModel('llama-3.2-11b-vision')).toBe(true);
    expect(looksVisionModel('some-model-vision')).toBe(true);
  });

  it('rejects plain text-only local ids', () => {
    expect(looksVisionModel('qwen2.5:14b')).toBe(false);
    expect(looksVisionModel('mistral:7b')).toBe(false);
    expect(looksVisionModel('')).toBe(false);
  });
});

describe('recommendation tables — shape invariants', () => {
  it('every PROVIDER_RECOMMEND entry has a non-empty model + reason', () => {
    for (const [provider, rec] of Object.entries(PROVIDER_RECOMMEND)) {
      expect(rec, provider).toBeTruthy();
      expect(rec!.model.length, provider).toBeGreaterThan(0);
      expect(rec!.reason.length, provider).toBeGreaterThan(0);
    }
  });

  it('recommended vision models actually pass looksVisionModel', () => {
    for (const [provider, rec] of Object.entries(PROVIDER_RECOMMEND)) {
      // The main picker recommends a vision-capable default per provider.
      expect(looksVisionModel(rec!.model), provider).toBe(true);
    }
  });

  it('scraper recommendation is priced (cheap pick from the static table)', () => {
    const anthropic = SCRAPER_RECOMMEND.anthropic!;
    expect(anthropic.model).toContain('haiku');
    // "claude-3-5-haiku-latest" resolves to the cheapest Claude in the table.
    expect(priceForModel(anthropic.model)).toEqual({ in: 0.8, out: 4 });
  });
});
