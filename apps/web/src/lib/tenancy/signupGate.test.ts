import { describe, it, expect } from 'vitest';
import { normalizeSignupCode, signupCodes, signupGated, signupAllowed } from './signupGate';

// The private-beta door. Two ways to get this wrong: leave it open when it should be shut,
// or shut it on people who were legitimately invited. Both are pinned.

const env = (v?: string) => ({ SAAS_SIGNUP_CODES: v }) as { SAAS_SIGNUP_CODES?: string };

describe('normalizeSignupCode / signupCodes', () => {
  it('is forgiving about how a code was typed', () => {
    expect(normalizeSignupCode('  alpha-1 ')).toBe('ALPHA-1');
    expect(signupCodes(env(' alpha-1 , ALPHA-2 '))).toEqual(['ALPHA-1', 'ALPHA-2']);
  });

  it('drops blank entries rather than creating a code that matches an empty string', () => {
    expect(signupCodes(env('A,,B,   ,'))).toEqual(['A', 'B']);
  });
});

describe('signupGated', () => {
  it('is OFF when unset — upgrading without the variable must not break signup', () => {
    expect(signupGated(env())).toBe(false);
    expect(signupGated(env('  '))).toBe(false);
    expect(signupGated(env(',,'))).toBe(false);
  });

  it('is ON as soon as one usable code exists', () => {
    expect(signupGated(env('ALPHA-1'))).toBe(true);
  });
});

describe('signupAllowed', () => {
  const e = env('ALPHA-1,ALPHA-2');

  it('lets anyone in when the beta is not gated', () => {
    expect(signupAllowed('', false, env())).toBe(true);
    expect(signupAllowed(undefined, false, env())).toBe(true);
  });

  it('accepts a configured code, however it was typed', () => {
    expect(signupAllowed('alpha-1', false, e)).toBe(true);
    expect(signupAllowed('  ALPHA-2  ', false, e)).toBe(true);
  });

  it('refuses a wrong or missing code', () => {
    expect(signupAllowed('GUESS', false, e)).toBe(false);
    expect(signupAllowed('', false, e)).toBe(false);
    expect(signupAllowed(null, false, e)).toBe(false);
    expect(signupAllowed(undefined, false, e)).toBe(false);
  });

  it('ALWAYS lets an invited person through, code or not', () => {
    // An invitation is already an authorisation, issued by someone inside the workspace.
    // Requiring a beta code on top would let an owner invite a colleague who then cannot get
    // in — the invite would look broken while behaving exactly as configured.
    expect(signupAllowed('', true, e)).toBe(true);
    expect(signupAllowed('GUESS', true, e)).toBe(true);
  });
});
