// PURE + client-safe helpers for the workspace-invite acceptance form ((saas)/signup?invite=…,
// InviteAcceptForm) and its tests. No imports beyond the sibling authValidation policy
// constants, no DOM, no server bindings — mirrors the recoveryValidation.ts idiom.
//
// FIRST-PASS UX guard only: api/saas/invites/accept re-validates authoritatively (a
// hand-crafted request bypassing the form still hits the same checks server-side).
import { MIN_PASSWORD } from './authValidation';

export { MIN_PASSWORD };

/**
 * Submit-enabled guard for the accept form. Unlike signup, a password is OPTIONAL here — an
 * invitee who already has a Pharos account for the invited email needs none (the route only
 * requires one when it has to create the account). The client can't know in advance which case
 * applies, so an empty password is always allowed; a non-empty one must meet the same policy as
 * signup. If the server turns out to need one (`password_required`), it reports that in the
 * error response for the form to surface.
 */
export function inviteAcceptReady(password: string): boolean {
  const p = password || '';
  return p.length === 0 || p.length >= MIN_PASSWORD;
}

/**
 * Build the same-origin link an invite token resolves to (mirrors the server's
 * lib/tenancy/mailer.ts `inviteLinkUrl`, minus the origin — for in-app dev-mode echoes such as
 * MembersPanel's "no mailer configured" notice). Relative path only, never an absolute URL, so
 * it cannot become an open redirect.
 */
export function inviteAcceptHref(token: string): string {
  return `/signup?invite=${encodeURIComponent((token || '').trim())}`;
}
