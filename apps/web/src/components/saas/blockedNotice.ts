// Copy for the banner a customer sees after being bounced off the product because their
// workspace is not active (`/account/workspace?blocked=<status>`).
//
// Pure and separate from the page so the wording is testable and lives in one place: this is
// the first thing a suspended or expired customer reads, and it is the moment they decide
// whether to pay or leave. It must say what happened, whether their data is safe, and what to
// do next — in that order.
//
// The status arrives through a URL, so it is untrusted input: anything unrecognised returns
// null and the page renders no banner at all rather than echoing a stranger's text back.

export type BlockedNotice = {
  /** Short headline. */
  title: string;
  /** One sentence: what it means for their data and access. */
  body: string;
  /** What to do about it, or null when there is nothing for them to do. */
  action: string | null;
};

export function blockedNotice(status: string | null | undefined): BlockedNotice | null {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
  switch (s) {
    case 'suspended':
      return {
        title: 'This workspace is suspended',
        body: 'Your data is intact, but the app is locked until the workspace is active again.',
        action: 'Check the Billing tab, or contact the workspace owner.',
      };
    case 'canceled':
      return {
        title: 'This workspace has been canceled',
        body: 'Your data is still here and can be exported. The app stays locked while canceled.',
        action: 'An owner can reactivate it from the Billing tab.',
      };
    case 'pending':
      return {
        title: 'This workspace is still being set up',
        body: 'Provisioning has not finished yet, so the app is not ready to open.',
        action: 'Try again in a moment.',
      };
    // `trialing` / `active` are healthy: reaching the product is not blocked by them, so a
    // banner would be nonsense. They are accepted by the redirect only to keep the URL honest.
    default:
      return null;
  }
}
