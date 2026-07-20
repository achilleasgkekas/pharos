// PURE + client-safe helpers for the user-facing account "Settings" panel
// ((saas)/account/settings + AccountSettingsPanel.tsx). Mirrors the server's own
// validation/error shapes for profile updates (PATCH /api/saas/account) and password change
// (POST /api/saas/account/password) so the panel gives instant feedback, same idiom as
// workspaceSettings.ts for the workspace-level Settings tab.
//
// No DOM, no server bindings — every import here is itself a pure, DB/env-free module
// (lib/tenancy/accountProfile.ts, lib/tenancy/members.ts), so this is safe to unit test and
// to import from a client component.
import { sanitizeName, passwordChangeError } from '@/lib/tenancy/accountProfile';
import { normalizeEmail, looksLikeEmail } from '@/lib/tenancy/members';

export { sanitizeName, passwordChangeError };

/** A proposed display-name edit is "changed" when it differs from the current value (both
 * run through the same sanitizer the server applies, so trailing whitespace/over-cap input
 * that would normalize to the same thing does not spuriously enable Save). Empty is allowed
 * (clearing the display name is a legitimate edit). */
export function profileNameChanged(name: string, currentName: string): boolean {
  return sanitizeName(name) !== sanitizeName(currentName);
}

/** A proposed email edit is submittable when it is syntactically valid AND differs from the
 * current address (case/whitespace-insensitive, matching the server's normalizeEmail). */
export function profileEmailChanged(email: string, currentEmail: string): boolean {
  return normalizeEmail(email) !== normalizeEmail(currentEmail);
}

/** Save button gate for the profile section: at least one field actually changed, and if the
 * email changed it must be a syntactically valid address (mirrors the PATCH route's guard so
 * an obviously-broken address never round-trips just to get rejected). */
export function profileSaveReady(
  input: { name: string; email: string },
  current: { name: string; email: string }
): boolean {
  const emailChanged = profileEmailChanged(input.email, current.email);
  if (emailChanged && !looksLikeEmail(normalizeEmail(input.email))) return false;
  return profileNameChanged(input.name, current.name) || emailChanged;
}

/** Password-form submit gate: reuses the server's own policy function so "enabled" and
 * "will be accepted" never disagree (short of the current-password re-check, which only the
 * server can perform). */
export function passwordSaveReady(current: string, next: string, confirm: string): boolean {
  if (!current) return false;
  if (next !== confirm) return false;
  return passwordChangeError(current, next) === null;
}

/**
 * Map an account-settings API failure (profile update or password change) to a human message.
 * Prefers the server-provided `error` string (already user-facing: "A valid email is required",
 * "Invalid credentials", "An account with this email already exists", …) and falls back to a
 * status-derived line, same idiom as workspaceSettings.describeWorkspaceSettingsError.
 */
export function describeAccountSettingsError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Please sign in again';
  if (status === 404) return 'Account not found';
  if (status === 409) return 'That email is already in use';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not save. Please try again';
}
