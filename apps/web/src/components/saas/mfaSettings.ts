// PURE + client-safe helpers for the "Two-factor authentication" section of
// AccountSettingsPanel.tsx (increment 82, following 80a's API routes). Same idiom as
// accountSettings.ts: gate functions the panel uses for instant feedback, plus an error-message
// mapper — no DOM, no server bindings, safe to unit test and to import from a client component.

/** A submitted TOTP code is worth sending to the server once it is exactly 6 digits (trimmed) —
 * mirrors lib/tenancy/totp.ts's verifyTotpCode digit-count check so "enabled" and "will be
 * accepted" never disagree on shape. The server still does the real cryptographic check. */
export function mfaCodeReady(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/** The password field guarding disable / restart-enrollment-while-already-enabled is
 * submittable once non-empty — only the server can confirm it is actually correct. */
export function mfaPasswordReady(password: string): boolean {
  return password.trim().length > 0;
}

/** The login-time second-factor field (increment 83) accepts EITHER a 6-digit TOTP code or an
 * 8-character recovery code (with or without its "XXXX-XXXX" dash) — unlike `mfaCodeReady`,
 * which only ever sees a TOTP code from the enrollment flow. Just a length floor for the submit
 * button; `verifyMfaLogin` on the server is the real check either way. */
export function mfaLoginCodeReady(code: string): boolean {
  return code.trim().replace(/[\s-]/g, '').length >= 6;
}

/**
 * Map an MFA API failure (begin/confirm/disable) to a human message. Prefers the server's
 * `error` string, and gives a few known reason codes (the result-type enums returned by
 * lib/tenancy/mfaStore.ts) friendlier text than the raw value would read as. Falls back to a
 * status-derived line, same idiom as accountSettings.describeAccountSettingsError.
 */
export function describeMfaError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) {
    const raw = serverError.trim();
    const known: Record<string, string> = {
      invalid_code: 'That code did not match. Check the time on your device and try again.',
      no_pending: 'That enrollment expired — start again.',
      crypto_unavailable: 'Two-factor authentication is not available on this server right now.',
      not_found: 'Account not found.',
      'Invalid credentials': 'Incorrect password.',
      'password is required': 'Enter your password to continue.',
      // Login step-2 (increment 83) reason codes — verifyMfaLogin / the pending-cookie check.
      no_pending_login: 'Your sign-in session expired. Please log in again.',
      not_enabled: 'Two-factor authentication is no longer required on this account — please log in again.',
      'code is required': 'Enter the code from your authenticator app or a recovery code.',
    };
    return known[raw] ?? raw;
  }
  if (status === 401) return 'Please sign in again';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not save. Please try again';
}
