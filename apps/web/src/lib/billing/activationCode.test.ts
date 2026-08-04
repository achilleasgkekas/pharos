import { describe, it, expect } from 'vitest';
import {
  normalizeCode,
  parseActivationCodes,
  activationConfigured,
  planForCode,
  resolveActivation,
} from './activationCode';

// Activation codes are the ONLY way to a paid plan while self-serve payment is closed, so
// what matters here is everything this REFUSES. A hole in it is a free subscription.

const env = (v?: string) => ({ SAAS_ACTIVATION_CODES: v }) as { SAAS_ACTIVATION_CODES?: string };

describe('normalizeCode', () => {
  it('is forgiving about how a code was typed, not about what it is', () => {
    expect(normalizeCode('  friends-2026 ')).toBe('FRIENDS-2026');
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(undefined)).toBe('');
    expect(normalizeCode(123)).toBe('123');
  });
});

describe('parseActivationCodes', () => {
  it('reads CODE:plan pairs', () => {
    expect(parseActivationCodes(env('A1:shared,B2:dedicated'))).toEqual([
      { code: 'A1', plan: 'shared' },
      { code: 'B2', plan: 'dedicated' },
    ]);
  });

  it('drops anything malformed instead of guessing', () => {
    // A typo in the env must make that code not work, never grant something unintended.
    expect(parseActivationCodes(env('NOPLAN,B2:dedicated'))).toEqual([{ code: 'B2', plan: 'dedicated' }]);
    expect(parseActivationCodes(env('C3:enterprise'))).toEqual([]);
    expect(parseActivationCodes(env(':shared'))).toEqual([]);
    expect(parseActivationCodes(env('D4:'))).toEqual([]);
  });

  it('refuses to hand out the free plan by code, which would mean nothing anyway', () => {
    expect(parseActivationCodes(env('E5:free'))).toEqual([]);
  });

  it('keeps the first definition when a code is listed twice', () => {
    expect(parseActivationCodes(env('DUP:shared,DUP:dedicated'))).toEqual([{ code: 'DUP', plan: 'shared' }]);
  });

  it('is empty when nothing is configured', () => {
    expect(parseActivationCodes(env())).toEqual([]);
    expect(parseActivationCodes(env('   '))).toEqual([]);
  });
});

describe('activationConfigured', () => {
  it('is false until at least one usable code exists', () => {
    expect(activationConfigured(env())).toBe(false);
    expect(activationConfigured(env('JUNK'))).toBe(false);
    expect(activationConfigured(env('OK:shared'))).toBe(true);
  });
});

describe('planForCode', () => {
  const e = env('FRIENDS-2026:shared,ACME:dedicated');

  it('matches regardless of case and padding', () => {
    expect(planForCode('friends-2026', e)).toBe('shared');
    expect(planForCode('  ACME  ', e)).toBe('dedicated');
  });

  it('rejects an unknown or empty code', () => {
    expect(planForCode('GUESS', e)).toBeNull();
    expect(planForCode('', e)).toBeNull();
    expect(planForCode(null, e)).toBeNull();
  });

  it('rejects everything when nothing is configured', () => {
    expect(planForCode('FRIENDS-2026', env())).toBeNull();
  });
});

describe('resolveActivation', () => {
  const e = env('FRIENDS-2026:shared,ACME:dedicated');

  it('activates the plan the code grants', () => {
    expect(resolveActivation('FRIENDS-2026', 'shared', e)).toEqual({ ok: true, plan: 'shared' });
  });

  it('takes the code\'s own plan when the caller did not name one', () => {
    expect(resolveActivation('ACME', '', e)).toEqual({ ok: true, plan: 'dedicated' });
    expect(resolveActivation('ACME', undefined, e)).toEqual({ ok: true, plan: 'dedicated' });
  });

  it('refuses to upgrade a cheap code into an expensive plan', () => {
    // The whole reason both are checked: the code verifies fine, and without this one
    // changed field in the request body turns a €9 code into the €29 plan.
    expect(resolveActivation('FRIENDS-2026', 'dedicated', e)).toEqual({ ok: false, reason: 'plan-mismatch' });
  });

  it('refuses an invalid code', () => {
    expect(resolveActivation('GUESS', 'shared', e)).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveActivation('', 'shared', e)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses everything when no codes are configured at all', () => {
    expect(resolveActivation('ANYTHING', 'shared', env())).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('never lets a bad code through by asking for the free plan', () => {
    expect(resolveActivation('GUESS', 'free', e).ok).toBe(false);
    expect(resolveActivation('FRIENDS-2026', 'free', e)).toEqual({ ok: false, reason: 'plan-mismatch' });
  });
});
