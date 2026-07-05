import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { planAiKeyUpdate, planAiKeyClear } from './byoKeyStore';
import { decodeAiKey } from './byoKey';

// planAiKeyUpdate/planAiKeyClear are the PURE flag-consistency + validation core of the BYO-key
// store (the DB wrappers are SaaS-gated node paths, tested by convention via these planners +
// the codec). AUTH_SECRET is read at call time → toggle per test.
const SECRET = 'test-secret-at-least-16-chars-long';
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = saved;
});

describe('planAiKeyUpdate', () => {
  it('builds a $set that stores the encrypted key AND flips aiByoKey on (lockstep)', () => {
    const update = planAiKeyUpdate('anthropic', 'sk-ant-api03-secret-value');
    expect(update).not.toBeNull();
    expect(update!.$set.aiByoKey).toBe(true);
    expect(update!.$set.aiKey.provider).toBe('anthropic');
    // keyEnc is a ciphertext envelope, never the plaintext.
    expect(update!.$set.aiKey.keyEnc).not.toContain('sk-ant-api03-secret-value');
  });

  it('round-trips: the stored envelope decrypts back to the original key + provider', () => {
    const update = planAiKeyUpdate('openai', '  sk-openai-raw-key  ');
    const decoded = decodeAiKey(update!.$set.aiKey);
    expect(decoded).toEqual({ provider: 'openai', key: 'sk-openai-raw-key' }); // trimmed
  });

  it('supports every BYO provider', () => {
    for (const p of ['anthropic', 'openai', 'gemini', 'openrouter', 'custom'] as const) {
      expect(planAiKeyUpdate(p, 'some-key-value')).not.toBeNull();
    }
  });

  it('returns null on an unsupported provider', () => {
    expect(planAiKeyUpdate('mistral', 'key')).toBeNull();
    expect(planAiKeyUpdate('', 'key')).toBeNull();
    expect(planAiKeyUpdate(null, 'key')).toBeNull();
  });

  it('returns null on an empty / non-string / whitespace-only key', () => {
    expect(planAiKeyUpdate('anthropic', '')).toBeNull();
    expect(planAiKeyUpdate('anthropic', '   ')).toBeNull();
    expect(planAiKeyUpdate('anthropic', null)).toBeNull();
    expect(planAiKeyUpdate('anthropic', 42)).toBeNull();
  });

  it('returns null when crypto is unavailable (AUTH_SECRET unset/short)', () => {
    delete process.env.AUTH_SECRET;
    expect(planAiKeyUpdate('anthropic', 'key')).toBeNull();
    process.env.AUTH_SECRET = 'short';
    expect(planAiKeyUpdate('anthropic', 'key')).toBeNull();
  });
});

describe('planAiKeyClear', () => {
  it('builds a $set that nulls the key AND flips aiByoKey off (lockstep)', () => {
    expect(planAiKeyClear()).toEqual({ $set: { aiKey: null, aiByoKey: false } });
  });
});
