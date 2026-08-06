// Client-safe half of the fail2ban bridge contract: the constants and shapes, with none of
// the fs access. Same split as lib/notifiers.shared.ts / lib/deliveryLog.shared.ts, and it
// exists for the same reason: `components/saas/firewallView.ts` needs the jail list as a
// VALUE, and importing it from lib/saas/f2b.ts (which opens `node:fs`) dragged node builtins
// into the client bundle and broke the production webpack build outright ("Reading from
// node:fs is not handled by plugins"). Types alone are erased; a value import is not.
//
// lib/saas/f2b.ts re-exports everything here, so every existing importer keeps working and
// there is still exactly ONE definition of each.

/** Jails the app is allowed to name. Mirrors ALLOWED_JAILS in deploy/f2b-bridge.sh — the script
 *  enforces its own copy, so a drift here can only make this side stricter, never looser. */
export const F2B_JAILS = ['sshd'] as const;
export type F2bJail = (typeof F2B_JAILS)[number];

/** How old the bridge's state file may be before the UI must stop presenting it as current.
 *  Cron writes it every minute; 5 minutes means "several runs have been missed". */
export const F2B_STALE_AFTER_MS = 5 * 60 * 1000;

export type BanRow = {
  jail: string;
  ip: string;
  /** Host-local timestamps as fail2ban prints them ('YYYY-MM-DD HH:MM:SS'), or null when the
   *  bridge could not parse them. Deliberately kept as strings: they are not ISO/UTC, and
   *  re-interpreting them as UTC would silently shift an incident window. */
  bannedAt: string | null;
  until: string | null;
};

export type BanState =
  | {
      known: true;
      generatedAt: Date;
      ageMs: number;
      /** True when the file is older than F2B_STALE_AFTER_MS: the list below is the last thing
       *  the bridge managed to write, not the state of the firewall now. */
      stale: boolean;
      bans: BanRow[];
    }
  | {
      known: false;
      /** missing = no bridge deployed here (or never ran); unreadable = permissions/IO;
       *  malformed = the file exists but is not the shape we expect. */
      reason: 'missing' | 'unreadable' | 'malformed';
      detail: string;
    };
