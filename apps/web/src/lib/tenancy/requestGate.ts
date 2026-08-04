// PURE decision layer for "this feature request cannot be attributed to a tenant" — what should
// the visitor actually SEE. No imports at all (not even next/navigation), so it is unit-testable
// without a request context; `request.ts` performs the resulting redirect()/notFound().
//
// WHY THIS EXISTS: every failure mode of resolveRequestTenant used to escape as an unhandled
// throw, which Next renders as the 500 error boundary. That is wrong for all of them and
// actively misleading for two: a logged-out visitor on a workspace subdomain is not a server
// fault (they need the login page), and a typo'd workspace host is a 404, not a crash. A 500
// also tells an attacker that something exists behind the wall.
//
// SELF-HOSTED PARITY: none of this runs when SAAS_MODE is off — resolveRequestTenant returns the
// default tenant before any of these codes can be produced.

/** Why a feature request could not be attributed to a usable tenant. */
export type TenantGateCode =
  | 'no_tenant' // the host names no workspace at all (apex, reserved label, unknown custom domain)
  | 'unknown_workspace' // the host names a workspace slug that does not exist
  | 'not_authenticated' // no account session
  | 'not_a_member' // signed in, but not a member of this workspace
  | 'workspace_inactive'; // member, but the workspace is pending/suspended/canceled

export type TenantGateOutcome =
  | { kind: 'redirect'; to: string }
  | { kind: 'not_found' };

/**
 * Whether the outcome for this code depends on the visitor being signed in.
 *
 * Only two codes branch on it. The 404 pair deliberately does NOT: not reading the session on
 * that path is what makes "this workspace does not exist" and "you are not in it" identical from
 * the outside, and it also avoids a session read on a request that is already going nowhere.
 */
export function needsAuthState(code: TenantGateCode): boolean {
  return code === 'no_tenant' || code === 'workspace_inactive';
}

/** Workspace statuses we are willing to reflect back into a URL (see `blocked` below). */
const REFLECTABLE_STATUSES = new Set(['pending', 'suspended', 'canceled', 'trialing', 'active']);

/**
 * Sanitise a path for use as a post-login `next=` target. Only same-origin absolute paths are
 * accepted: anything else is dropped rather than corrected, because a redirect target is exactly
 * the kind of value an open-redirect is built from.
 *
 * Rejects: empty, relative paths, `//evil.com` (protocol-relative), `/\evil.com` (browsers
 * normalise the backslash to a slash), and anything with a scheme or control characters.
 */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.trim();
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//') || p.startsWith('/\\')) return null;
  if (/[\x00-\x1f\x7f]/.test(p)) return null;
  return p;
}

/** `/account/login`, carrying a sanitised return path when there is one worth carrying. */
export function loginRedirect(path: string | null | undefined): string {
  const next = safeReturnPath(path);
  return next ? `/account/login?next=${encodeURIComponent(next)}` : '/account/login';
}

/**
 * Decide what a failed tenant resolution should turn into.
 *
 *   not_authenticated   → the login page, returning here afterwards.
 *   no_tenant           → this host is not a workspace. A signed-in visitor gets their workspace
 *                         list (they most likely landed on the apex); a logged-out one gets login.
 *   unknown_workspace   → 404. The slug does not exist; nothing to sign into.
 *   not_a_member        → 404 as well, deliberately IDENTICAL to unknown_workspace: telling a
 *                         signed-in stranger "this workspace exists, you just can't see it" turns
 *                         the subdomain space into a membership oracle. They lose nothing — a
 *                         workspace they cannot enter is, to them, one that does not exist.
 *   workspace_inactive  → their own workspace page, flagged, so a suspended/expired customer
 *                         lands somewhere that can explain it and take money, not on a dead end.
 */
export function tenantGateOutcome(
  code: TenantGateCode,
  opts: { path?: string | null; authenticated: boolean; status?: string | null },
): TenantGateOutcome {
  const { path, authenticated, status } = opts;

  switch (code) {
    case 'unknown_workspace':
    case 'not_a_member':
      return { kind: 'not_found' };

    case 'not_authenticated':
      return { kind: 'redirect', to: loginRedirect(path) };

    case 'no_tenant':
      return authenticated
        ? { kind: 'redirect', to: '/account' }
        : { kind: 'redirect', to: loginRedirect(path) };

    case 'workspace_inactive': {
      // Defensive: this code implies an authenticated member, but if the session is gone by the
      // time we get here, login first — /account/workspace would only bounce them there anyway.
      if (!authenticated) return { kind: 'redirect', to: loginRedirect(path) };
      const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
      const flag = REFLECTABLE_STATUSES.has(s) ? `?blocked=${s}` : '';
      return { kind: 'redirect', to: `/account/workspace${flag}` };
    }

    default: {
      // Unreachable while the union is exhaustive; an unrecognised code must still not become a
      // 500. Send them somewhere they can act instead of showing a crash page.
      const _exhaustive: never = code;
      void _exhaustive;
      return { kind: 'redirect', to: '/account' };
    }
  }
}
