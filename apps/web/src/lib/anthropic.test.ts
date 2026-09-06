import { describe, it, expect } from 'vitest';
import { mediaTypeOf, stripFences, redactKey, acceptsTemperature } from './anthropic';

// anthropic.ts is the minimal Claude client over fetch. Its network functions
// (anthropicJSON/anthropicRaw/anthropicTest) need a live API, but three pure
// helpers underpin them and are worth locking without any I/O:
//   - mediaTypeOf: sniffs the image media_type from base64 magic bytes. A wrong
//     type breaks vision parsing (the API rejects a mismatched media_type), so
//     the jpeg/png/webp/gif prefixes and the jpeg fallback must stay exact.
//   - stripFences: pulls the JSON out of a model reply that may be wrapped in
//     ```json … ``` fences before JSON.parse — every cloud parse depends on it.
//   - redactKey: security defense-in-depth — scrubs the API key and any sk-ant-…
//     token out of error strings before they reach a UI message or log.

describe('mediaTypeOf', () => {
  it('detects JPEG from the /9j/ base64 prefix', () => {
    expect(mediaTypeOf('/9j/4AAQSkZJRg')).toBe('image/jpeg');
  });

  it('detects PNG from the iVBOR base64 prefix', () => {
    expect(mediaTypeOf('iVBORw0KGgoAAAANS')).toBe('image/png');
  });

  it('detects WebP from the UklGR base64 prefix', () => {
    expect(mediaTypeOf('UklGRiQAAABXRUJQ')).toBe('image/webp');
  });

  it('detects GIF from the R0lGOD base64 prefix', () => {
    expect(mediaTypeOf('R0lGODlhAQABAIAAAA')).toBe('image/gif');
  });

  it('falls back to JPEG for an unrecognised prefix', () => {
    expect(mediaTypeOf('ZZZsomethingelse')).toBe('image/jpeg');
    expect(mediaTypeOf('')).toBe('image/jpeg');
  });

  it('is prefix-sensitive: the marker must be at the start', () => {
    // iVBOR appearing later in the string does not count as PNG
    expect(mediaTypeOf('xxiVBORw0KGgo')).toBe('image/jpeg');
  });
});

describe('stripFences', () => {
  it('removes a ```json …``` wrapper and trims', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('removes a trailing bare ``` fence (Claude is asked for no fences, so this is the common shape)', () => {
    expect(stripFences('{"b":2}\n```')).toBe('{"b":2}');
  });

  it('quirk: a LEADING bare ``` (no json tag) is NOT stripped — only ```json leads or ``` trails match', () => {
    // Documents actual behavior: the alternation is /```json\s*|```\s*$/, so a
    // leading bare fence with content after it matches neither branch. In practice
    // the system prompt forbids fences, so Claude rarely emits a bare leading one.
    expect(stripFences('```\n{"b":2}\n```')).toBe('```\n{"b":2}');
  });

  it('is case-insensitive on the json tag', () => {
    expect(stripFences('```JSON\n{"c":3}\n```')).toBe('{"c":3}');
  });

  it('leaves already-clean JSON untouched (aside from trim)', () => {
    expect(stripFences('{"d":4}')).toBe('{"d":4}');
    expect(stripFences('  {"e":5}  ')).toBe('{"e":5}');
  });

  it('handles a leading fence with no trailing fence', () => {
    expect(stripFences('```json {"f":6}')).toBe('{"f":6}');
  });

  it('preserves internal fenced content is not a concern: only outer fences go', () => {
    // A string value that merely contains the word json is not stripped away
    expect(stripFences('{"note":"see json below"}')).toBe('{"note":"see json below"}');
  });
});

describe('redactKey', () => {
  const key = 'sk-ant-api03-SECRETKEY-abcdef123456';

  it('replaces every occurrence of the API key with [redacted]', () => {
    const s = `error using ${key} while calling with ${key}`;
    const out = redactKey(s, key);
    expect(out).not.toContain('SECRETKEY');
    expect(out).not.toContain(key);
    expect(out).toBe('error using [redacted] while calling with [redacted]');
  });

  it('redacts any sk-ant-… token even when it is not the passed key', () => {
    const other = 'sk-ant-api03-OTHER_token-99';
    const out = redactKey(`leaked ${other} here`, key);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('OTHER_token');
  });

  it('does not string-replace a short/empty key (length <= 8), only the regex applies', () => {
    // A short key must not be split-replaced (would over-redact); but a real
    // sk-ant token in the text is still caught by the regex.
    const out = redactKey('token sk-ant-xyz_123 and word abc', 'short');
    expect(out).toBe('token [redacted] and word abc');
    // an unrelated 8-char string is left intact
    expect(redactKey('hello world', 'shortkey')).toBe('hello world');
  });

  it('returns the string unchanged when there is nothing to redact', () => {
    expect(redactKey('HTTP 500: internal error', key)).toBe('HTTP 500: internal error');
  });

  it('leaves the empty string as empty', () => {
    expect(redactKey('', key)).toBe('');
  });

  it('catches an sk-ant token when the passed key is empty', () => {
    const out = redactKey('boom sk-ant-abc123 boom', '');
    expect(out).toBe('boom [redacted] boom');
  });
});

describe('acceptsTemperature', () => {
  // Newer models 400 on `temperature`; anthropicJSON must omit it for them. Guard the exact
  // model families so a wrong classification does not silently break every cloud parse.
  it('returns FALSE for the models that reject sampling params', () => {
    for (const m of [
      'claude-sonnet-5',
      'claude-opus-5',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-fable-5',
      'claude-fable-5-1',
      'claude-mythos-5-1',
    ]) {
      expect(acceptsTemperature(m), m).toBe(false);
    }
  });

  it('returns TRUE for the older families that still accept temperature', () => {
    for (const m of [
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-haiku-4-5',
      'claude-3-5-haiku-latest',
    ]) {
      expect(acceptsTemperature(m), m).toBe(true);
    }
  });

  it('does not confuse opus-4-5 / sonnet-4-5 with the rejecting opus-5 / sonnet-5', () => {
    expect(acceptsTemperature('claude-opus-4-5')).toBe(true);
    expect(acceptsTemperature('claude-sonnet-4-5')).toBe(true);
  });
});
