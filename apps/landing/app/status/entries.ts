// What the /status page shows. Data only, no JSX, so updating it is a one-line append and never
// a layout question.
//
// APPEND HERE WHEN SOMETHING SHIPS. The rule that keeps this page worth reading: an entry moves to
// `shipped` only when it is LIVE on ph-aros.com, not when it is merged. A status page that lists
// merged work as done is a changelog with a misleading title, and the first time a reader notices
// the gap they stop trusting the whole page.
//
// Dates are ISO and UTC. Newest first within each list.

export type Entry = {
  /** ISO date. For `shipped` this is the day it went live, not the day it was written. */
  date: string;
  title: string;
  /** One sentence, in plain language. What changed for the reader, not which file moved. */
  detail: string;
  kind: 'feature' | 'fix' | 'security';
};

export type Planned = {
  title: string;
  detail: string;
  /** `next` = actively being built. `later` = agreed, not started. Nothing here is a promise. */
  when: 'next' | 'later';
};

export const SHIPPED: Entry[] = [
  {
    date: '2026-08-05',
    title: 'Abuse limits on plan activation',
    detail:
      'Redeeming an activation code is now rate limited, per address and per account, like sign-in and password reset already were.',
    kind: 'security',
  },
  {
    date: '2026-08-04',
    title: 'Per-workspace settings',
    detail:
      'Settings (currency, budgets, alert rules, stores, cards) are now stored per workspace instead of in one shared place.',
    kind: 'security',
  },
  {
    date: '2026-08-04',
    title: 'Password reset emails',
    detail: 'Reset emails are sent and the link in them opens the right page.',
    kind: 'fix',
  },
  {
    date: '2026-08-04',
    title: 'Sign-in for hosted workspaces',
    detail:
      'Signing in to a hosted workspace no longer shows the self-hosted first-run setup screen, and the navigation bar is back.',
    kind: 'fix',
  },
  {
    date: '2026-08-04',
    title: 'Abuse limits on sign-up and password reset',
    detail:
      'Sign-up, password-reset request and reset-confirm are rate limited per address, so nobody can use them to flood a stranger with mail.',
    kind: 'security',
  },
  {
    date: '2026-08-04',
    title: 'Hosted Pharos is live',
    detail:
      'ph-aros.com serves the hosted service: sign up, get a workspace on your own subdomain, with a wildcard certificate and nightly off-site backups.',
    kind: 'feature',
  },
];

export const PLANNED: Planned[] = [
  {
    title: 'Paid plans',
    detail:
      'Billing is built but inert: there is no way to pay yet, so every workspace is on a free trial. Nothing is charged and no card is asked for.',
    when: 'next',
  },
  {
    title: 'Mail from our own domain',
    detail:
      'Transactional mail currently leaves from a personal Gmail address, which some providers file as spam. Moving to a verified sending domain with SPF and DKIM.',
    when: 'next',
  },
  {
    title: 'Custom domains',
    detail: 'Point your own domain at your workspace instead of using a ph-aros.com subdomain.',
    when: 'later',
  },
];

// Stated plainly rather than buried, because a status page that only lists good news is
// advertising. Anything here is true today and known.
export const LIMITATIONS: string[] = [
  'The hosted service is new. Treat it as an early release and keep your own copies of anything critical.',
  'Emails are sent from a personal Gmail address for now, so they can land in spam.',
  'There is no paid plan yet, so there is no billing, no invoices and no way to pay.',
];
