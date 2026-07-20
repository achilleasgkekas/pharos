// Pure formatting for the "resend invite" action in MembersPanel. Mirrors the notice text the
// panel already builds inline for a fresh invite send (submitInvite), so a resent link reads
// consistently with a first-time send. The dev-token echo (no mailer configured) used to be
// appended here as raw text; MembersPanel now renders it as a clickable inviteAcceptHref(token)
// link instead (ReactNode notice state), so this helper only ever needs the tokenless sentence.
export function resendNoticeText(email: string): string {
  return `Invitation resent to ${email || 'this address'}.`;
}
