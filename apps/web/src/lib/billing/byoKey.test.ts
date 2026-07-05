import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encodeAiKey,
  decodeAiKey,
  maskAiKey,
  byoKeyReady,
  isByoProvider,
  BYO_PROVIDERS,
} from './byoKey';

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

describe('isByoProvider / BYO_PROVIDERS', () => {
  it('accepts supported providers, rejects the rest', () => {
    expect(BYO_PROVIDERS).toContain('anthropic');
    expect(isByoProvider('openai')).toBe(true);
    expect(isByoProvider('custom')).toBe(true);
    expect(isByoProvider('ollama')).toBe(false);
    expect(isByoProvider(null)).toBe(false);
    expect(isByoProvider(123)).toBe(false);
  });
});

describe('byoKeyReady', () => {
  it('follows AUTH_SECRET availability', () => {
    expect(byoKeyReady()).toBe(true);
    delete process.env.AUTH_SECRET;
    expect(byoKeyReady()).toBe(false);
  });
});

describe('encode → decode round-trip', () => {
  it('encrypts on encode and recovers plaintext on decode', () => {
    const stored = encodeAiKey('anthropic', '  sk-ant-secret-123  ');
    expect(stored).not.toBeNull();
    expect(stored!.provider).toBe('anthropic');
    expect(stored!.keyEnc.startsWith('gcm1$')).toBe(true);
    // Plaintext is never stored verbatim.
    expect(stored!.keyEnc).not.toContain('sk-ant-secret-123');
    const decoded = decodeAiKey(stored);
    // Trimmed on the way in.
    expect(decoded).toEqual({ provider: 'anthropic', key: 'sk-ant-secret-123' });
  });

  it('round-trips every supported provider', () => {
    for (const provider of BYO_PROVIDERS) {
      const stored = encodeAiKey(provider, `key-for-${provider}`);
      expect(decodeAiKey(stored)).toEqual({ provider, key: `key-for-${provider}` });
    }
  });
});

describe('encodeAiKey rejects bad input', () => {
  it('returns null for unsupported provider / empty key / non-string', () => {
    expect(encodeAiKey('ollama', 'k')).toBeNull();
    expect(encodeAiKey('anthropic', '   ')).toBeNull();
    expect(encodeAiKey('anthropic', '')).toBeNull();
    expect(encodeAiKey('anthropic', 42 as unknown as string)).toBeNull();
  });

  it('returns null when AUTH_SECRET is unavailable', () => {
    delete process.env.AUTH_SECRET;
    expect(encodeAiKey('anthropic', 'k')).toBeNull();
  });
});

describe('decodeAiKey rejects bad records', () => {
  it('returns null on malformed / tampered / non-object records', () => {
    expect(decodeAiKey(null)).toBeNull();
    expect(decodeAiKey('string')).toBeNull();
    expect(decodeAiKey({ provider: 'ollama', keyEnc: 'gcm1$a$b$c' })).toBeNull();
    expect(decodeAiKey({ provider: 'anthropic', keyEnc: 'not-encrypted' })).toBeNull();
    const good = encodeAiKey('anthropic', 'a-long-enough-secret-key-value')!;
    const p = good.keyEnc.split('$');
    const ct = p[3];
    const tampered = [p[0], p[1], p[2], (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)].join('$');
    expect(decodeAiKey({ provider: 'anthropic', keyEnc: tampered })).toBeNull();
  });

  it('returns null when the AUTH_SECRET has rotated away', () => {
    const stored = encodeAiKey('openai', 'my-key');
    process.env.AUTH_SECRET = 'a-completely-different-secret-16+';
    expect(decodeAiKey(stored)).toBeNull();
  });
});

describe('maskAiKey', () => {
  it('shows provider + last 4 only, never the plaintext', () => {
    const stored = encodeAiKey('openai', 'sk-openai-abcd1234');
    const masked = maskAiKey(stored);
    expect(masked).toEqual({ provider: 'openai', masked: '••••1234' });
  });
  it('returns null for undecodable records', () => {
    expect(maskAiKey(null)).toBeNull();
    expect(maskAiKey({ provider: 'anthropic', keyEnc: 'bad' })).toBeNull();
  });
});
