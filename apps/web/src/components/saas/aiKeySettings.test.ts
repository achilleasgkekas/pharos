import { describe, it, expect } from 'vitest';
import {
  AI_KEY_PROVIDERS,
  isAiKeyProvider,
  aiKeyProviderLabel,
  aiKeySaveReady,
  describeAiKeyError,
} from './aiKeySettings';

describe('isAiKeyProvider', () => {
  it('accepts every id in AI_KEY_PROVIDERS', () => {
    for (const p of AI_KEY_PROVIDERS) expect(isAiKeyProvider(p)).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isAiKeyProvider('ollama')).toBe(false);
    expect(isAiKeyProvider('')).toBe(false);
    expect(isAiKeyProvider(undefined)).toBe(false);
    expect(isAiKeyProvider(42)).toBe(false);
  });
});

describe('aiKeyProviderLabel', () => {
  it('returns a human label for a known provider', () => {
    expect(aiKeyProviderLabel('anthropic')).toBe('Anthropic (Claude)');
    expect(aiKeyProviderLabel('custom')).toBe('Custom (OpenAI-compatible)');
  });

  it('falls back to the raw id for an unrecognized provider', () => {
    expect(aiKeyProviderLabel('mystery')).toBe('mystery');
  });
});

describe('aiKeySaveReady', () => {
  it('accepts a known provider with a non-blank key when crypto is ready', () => {
    expect(aiKeySaveReady('anthropic', 'sk-ant-abc123', true)).toBe(true);
  });

  it('rejects when crypto is not ready, regardless of otherwise-valid input', () => {
    expect(aiKeySaveReady('anthropic', 'sk-ant-abc123', false)).toBe(false);
  });

  it('rejects an unsupported provider', () => {
    expect(aiKeySaveReady('ollama', 'abc123', true)).toBe(false);
  });

  it('rejects a blank or whitespace-only key', () => {
    expect(aiKeySaveReady('anthropic', '', true)).toBe(false);
    expect(aiKeySaveReady('anthropic', '   ', true)).toBe(false);
  });
});

describe('describeAiKeyError', () => {
  it('prefers a server-provided error string', () => {
    expect(describeAiKeyError(400, 'provider must be one of anthropic, openai')).toBe(
      'provider must be one of anthropic, openai'
    );
  });

  it('ignores a blank/whitespace server error and falls back by status', () => {
    expect(describeAiKeyError(401, '  ')).toBe('Please sign in again');
    expect(describeAiKeyError(403, null)).toBe('You do not have permission to do that');
    expect(describeAiKeyError(404, undefined)).toBe('That workspace was not found');
    expect(describeAiKeyError(503, undefined)).toBe(
      'This server is not set up to store secrets yet'
    );
    expect(describeAiKeyError(500, undefined)).toBe('Something went wrong. Please try again');
  });

  it('has a generic fallback for an unmapped status', () => {
    expect(describeAiKeyError(418)).toBe(
      'Could not save the key. Please check the details and try again'
    );
  });
});
