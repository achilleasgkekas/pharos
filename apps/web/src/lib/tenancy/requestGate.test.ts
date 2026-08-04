import { describe, it, expect } from 'vitest';
import { tenantGateOutcome, loginRedirect, safeReturnPath, needsAuthState } from './requestGate';

// Every branch here replaces what used to be an unhandled throw rendering the 500 boundary, so
// the assertions are about two things: nobody gets a crash page for a non-crash, and the two
// codes that MUST look identical from outside actually do.

describe('safeReturnPath — open-redirect guard on the post-login return', () => {
  it.each([
    ['/receipts', '/receipts'],
    ['/items?open=abc', '/items?open=abc'],
    ['/', '/'],
    ['  /tasks  ', '/tasks'],
  ])('keeps the same-origin path %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    ['//evil.example.com', 'protocol-relative — the browser would leave the site'],
    ['/\\evil.example.com', 'backslash is normalised to a slash by browsers'],
    ['https://evil.example.com', 'absolute URL'],
    ['receipts', 'relative — would resolve against whatever page we are on'],
    ['', 'empty'],
    [null, 'absent'],
    [undefined, 'undefined'],
    ['/receipts\nLocation: https://evil.com', 'control characters (header smuggling shape)'],
  ])('drops %s (%s)', (input: string | null | undefined, _why: string) => {
    expect(safeReturnPath(input)).toBeNull();
  });
});

describe('loginRedirect', () => {
  it('carries a sanitised next', () => {
    expect(loginRedirect('/receipts?open=1')).toBe('/account/login?next=%2Freceipts%3Fopen%3D1');
  });

  it('omits next entirely when there is nothing safe to carry', () => {
    expect(loginRedirect('//evil.example.com')).toBe('/account/login');
    expect(loginRedirect(null)).toBe('/account/login');
  });
});

describe('tenantGateOutcome', () => {
  it('sends a logged-out visitor to login, returning to where they were', () => {
    expect(tenantGateOutcome('not_authenticated', { path: '/receipts', authenticated: false })).toEqual({
      kind: 'redirect',
      to: '/account/login?next=%2Freceipts',
    });
  });

  it('no_tenant + signed in → the workspace list (they landed on the apex)', () => {
    expect(tenantGateOutcome('no_tenant', { path: '/items', authenticated: true })).toEqual({
      kind: 'redirect',
      to: '/account',
    });
  });

  it('no_tenant + logged out → login, not the workspace list they cannot see', () => {
    expect(tenantGateOutcome('no_tenant', { path: '/items', authenticated: false })).toEqual({
      kind: 'redirect',
      to: '/account/login?next=%2Fitems',
    });
  });

  it('an unknown workspace slug is a 404, never a 500', () => {
    expect(tenantGateOutcome('unknown_workspace', { path: '/receipts', authenticated: true })).toEqual({
      kind: 'not_found',
    });
  });

  it('not_a_member is BYTE-IDENTICAL to unknown_workspace, so the subdomain space is not a membership oracle', () => {
    const stranger = tenantGateOutcome('not_a_member', { path: '/receipts', authenticated: true });
    const nonexistent = tenantGateOutcome('unknown_workspace', { path: '/receipts', authenticated: true });
    expect(stranger).toEqual(nonexistent);
    expect(stranger).toEqual({ kind: 'not_found' });
  });

  it('the not_a_member answer does not change with the auth state either', () => {
    // Otherwise "404 when logged out, something else when logged in" would leak the same fact.
    expect(tenantGateOutcome('not_a_member', { path: '/x', authenticated: false })).toEqual(
      tenantGateOutcome('not_a_member', { path: '/x', authenticated: true }),
    );
  });

  describe('workspace_inactive', () => {
    it.each(['suspended', 'canceled', 'pending'])(
      'sends a %s workspace to its own page, flagged, so the reason can be explained',
      (status) => {
        expect(tenantGateOutcome('workspace_inactive', { path: '/receipts', authenticated: true, status })).toEqual(
          { kind: 'redirect', to: `/account/workspace?blocked=${status}` },
        );
      },
    );

    it('normalises the status case before reflecting it', () => {
      expect(
        tenantGateOutcome('workspace_inactive', { path: '/x', authenticated: true, status: '  SUSPENDED ' }),
      ).toEqual({ kind: 'redirect', to: '/account/workspace?blocked=suspended' });
    });

    it('refuses to reflect an unrecognised status into the URL', () => {
      // The status reaches a query string the customer sees; an unknown value is dropped rather
      // than echoed.
      expect(
        tenantGateOutcome('workspace_inactive', { path: '/x', authenticated: true, status: '<script>' }),
      ).toEqual({ kind: 'redirect', to: '/account/workspace' });
      expect(
        tenantGateOutcome('workspace_inactive', { path: '/x', authenticated: true, status: undefined }),
      ).toEqual({ kind: 'redirect', to: '/account/workspace' });
    });

    it('falls back to login if the session vanished, instead of bouncing off /account/workspace', () => {
      expect(
        tenantGateOutcome('workspace_inactive', { path: '/x', authenticated: false, status: 'suspended' }),
      ).toEqual({ kind: 'redirect', to: '/account/login?next=%2Fx' });
    });
  });

  it('an unrecognised code still never produces a crash — the whole point of the module', () => {
    const outcome = tenantGateOutcome('something_new' as never, { path: '/x', authenticated: true });
    expect(outcome).toEqual({ kind: 'redirect', to: '/account' });
  });
});

describe('needsAuthState — which codes are allowed to read the session at all', () => {
  it.each(['no_tenant', 'workspace_inactive'] as const)('%s branches on it', (code) => {
    expect(needsAuthState(code)).toBe(true);
  });

  it.each(['unknown_workspace', 'not_a_member', 'not_authenticated'] as const)(
    '%s does not, so the gate can skip the lookup entirely',
    (code) => {
      expect(needsAuthState(code)).toBe(false);
    },
  );

  it('every code that ignores the auth state really does return the same outcome either way', () => {
    // Guards the pair above against drifting apart: if a future branch starts consulting
    // `authenticated`, this fails instead of quietly leaking membership through the response.
    for (const code of ['unknown_workspace', 'not_a_member', 'not_authenticated'] as const) {
      expect(tenantGateOutcome(code, { path: '/x', authenticated: false })).toEqual(
        tenantGateOutcome(code, { path: '/x', authenticated: true }),
      );
    }
  });
});
