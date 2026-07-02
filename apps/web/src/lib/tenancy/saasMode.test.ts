import { describe, it, expect, afterEach } from 'vitest';
import { saasMode } from './saasMode';

// Pure env-flag reader, μηδέν DB/δίκτυο/clock. Κλειδώνει το dual-shape gate:
// self-hosted (unset/off) === σημερινό single-user behaviour, managed SaaS === on.
// Το SAAS_MODE είναι process-global, οπότε το save/restore-άρουμε ανά case.
describe('saasMode', () => {
  const original = process.env.SAAS_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.SAAS_MODE;
    else process.env.SAAS_MODE = original;
  });

  function set(v: string | undefined) {
    if (v === undefined) delete process.env.SAAS_MODE;
    else process.env.SAAS_MODE = v;
  }

  it('defaults to OFF when unset (self-hosted single-user shape)', () => {
    set(undefined);
    expect(saasMode()).toBe(false);
  });

  it('is OFF for empty / whitespace-only values', () => {
    for (const v of ['', '   ', '\t', '\n']) {
      set(v);
      expect(saasMode()).toBe(false);
    }
  });

  it('is ON for each accepted truthy token', () => {
    for (const v of ['on', '1', 'true', 'yes']) {
      set(v);
      expect(saasMode()).toBe(true);
    }
  });

  it('is case-insensitive for truthy tokens', () => {
    for (const v of ['ON', 'On', 'TRUE', 'True', 'Yes', 'YES']) {
      set(v);
      expect(saasMode()).toBe(true);
    }
  });

  it('trims surrounding whitespace before matching', () => {
    for (const v of ['  on  ', '\ttrue\n', ' 1 ', '  yes']) {
      set(v);
      expect(saasMode()).toBe(true);
    }
  });

  it('is OFF for explicit falsy / non-matching tokens', () => {
    for (const v of ['off', '0', 'false', 'no', 'enabled', 'disable', 'yeah', '2', 'onn', 'ony']) {
      set(v);
      expect(saasMode()).toBe(false);
    }
  });

  it('does not treat truthy substrings inside larger strings as ON', () => {
    // guard κατά partial match: μόνο ολόκληρο το token μετρά
    for (const v of ['on off', 'turn on', 'is-true', 'yes please', '10']) {
      set(v);
      expect(saasMode()).toBe(false);
    }
  });
});
