import { describe, it, expect } from 'vitest';
import { stripFences } from './ollama';

// stripFences runs on every Ollama JSON response (runVisionJSON/runTextJSON) right
// before JSON.parse. Its regex is /```json\s*|```\s*$/g and behaves DIFFERENTLY from
// the anthropic/aiProviders variants: it strips a `json`-tagged opener ANYWHERE in the
// string plus a trailing fence, but leaves a BARE leading ``` (no json tag) in place.
// These tests lock that exact contract so a future "cleanup" cannot silently change it.
describe('stripFences (ollama)', () => {
  it('strips a ```json … ``` wrapper down to the JSON', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a trailing bare ``` even without a json opener', () => {
    expect(stripFences('{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves clean JSON untouched (aside from trimming)', () => {
    expect(stripFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('does NOT strip a bare leading ``` (only the json-tagged opener)', () => {
    // The leading ``` is not json-tagged and not at end-of-string, so it survives.
    expect(stripFences('```\n{"a":1}')).toBe('```\n{"a":1}');
  });

  it('strips a ```json opener even when it appears mid-string (global, unanchored)', () => {
    // Quirk: the opener is not anchored to the start, so any ```json is removed.
    expect(stripFences('prefix ```json {"a":1}')).toBe('prefix {"a":1}');
  });

  it('removes the ```json whitespace run after the fence', () => {
    expect(stripFences('```json   \n\t{"a":1}\n```')).toBe('{"a":1}');
  });

  it('is case-sensitive: ```JSON opener is not stripped as a json fence', () => {
    // Only lowercase `json` matches; an uppercase tag is left as-is (bare-fence rule
    // also does not apply since it is not at end-of-string).
    expect(stripFences('```JSON\n{"a":1}')).toBe('```JSON\n{"a":1}');
  });

  it('does not touch the word "json" outside a fence', () => {
    expect(stripFences('{"kind":"json"}')).toBe('{"kind":"json"}');
  });

  it('returns empty string for empty input', () => {
    expect(stripFences('')).toBe('');
  });

  it('collapses a fenced-only payload to empty after trim', () => {
    // ```json opener stripped + trailing ``` stripped → only whitespace left → ''.
    expect(stripFences('```json\n```')).toBe('');
  });
});
