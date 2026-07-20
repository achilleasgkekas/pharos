// Pure formatting for the "resend invite" action in MembersPanel. Mirrors the notice text the
// panel already builds inline for a fresh invite send (submitInvite), so a resent link reads
// consistently with a first-time send — including the same dev-token echo idiom used when no
// mailer is configured (see /api/saas/invites/resend's SCAFFOLD note).
export function resendNotice(email: string, devToken?: string | null): string {
  const who = email || 'this address';
  const dev = devToken ? ` (dev token: ${devToken})` : '';
  return `Invitation resent to ${who}.${dev}`;
}
