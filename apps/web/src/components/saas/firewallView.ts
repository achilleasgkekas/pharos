// PURE, client-safe view model for the /admin/firewall page. No fs, no DB, no next/*, no React —
// the page reads the bridge state server-side (lib/saas/f2b) and hands the result here, so every
// judgement about what the operator is allowed to conclude from that state is unit-testable.
//
// The rule this file exists to enforce: an empty ban list and "I could not read the bridge" must
// never render the same way. A quiet firewall is reassuring; not knowing is not. Twice on
// 2026-08-05 the host reported "no bans" while the actual nftables set told a different story, and
// a screen that renders both as an empty table teaches an operator to trust it wrongly.
import type { BanRow, BanState, F2bJail } from '@/lib/saas/f2b';
import { F2B_JAILS } from '@/lib/saas/f2b';

export type FirewallHealth = 'live' | 'stale' | 'unknown';

export type FirewallView = {
  health: FirewallHealth;
  /** One line, always shown, that says how much the screen actually knows. */
  headline: string;
  /** Longer explanation for the non-live cases (what to check), else null. */
  detail: string | null;
  /** Only ever populated when health is 'live' or 'stale' — never a placeholder list. */
  bans: BanRow[];
  /** True when the operator may act on the rows (the list is current enough to be worth a click). */
  actionable: boolean;
  generatedAtIso: string | null;
};

/** Compact "3 minutes ago" style age. Whole units, no library. */
export function relativeAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** True when this app is allowed to QUEUE an unban for a jail. The bridge may report jails the
 *  app cannot act on (its export list and its request allowlist are separate settings); such rows
 *  are shown, because hiding a live ban is the same lie as an empty list, but their button is
 *  disabled rather than offering an action the host would reject. */
export function canRequestUnban(jail: string): jail is F2bJail {
  return (F2B_JAILS as readonly string[]).includes(jail);
}

/** Build the whole screen's view model from the bridge state. */
export function firewallView(state: BanState): FirewallView {
  if (!state.known) {
    return {
      health: 'unknown',
      headline: 'The firewall state is unknown.',
      detail:
        state.reason === 'missing'
          ? `${state.detail}. This screen shows nothing rather than an empty list, because "no bans" and "no data" are different answers.`
          : state.detail,
      bans: [],
      actionable: false,
      generatedAtIso: null,
    };
  }

  const age = relativeAge(state.ageMs);
  const iso = state.generatedAt.toISOString();
  if (state.stale) {
    return {
      health: 'stale',
      headline: `Last update ${age} — the host bridge is not running.`,
      detail:
        'The bridge writes this file every minute from cron. What is listed below is the last thing it managed to report and may no longer match the firewall. Check the f2b-bridge cron job on the host.',
      bans: state.bans,
      // Deliberately still actionable: an operator chasing a lockout needs the button more, not
      // less, when the bridge is limping. The request just sits in the queue until cron returns.
      actionable: true,
      generatedAtIso: iso,
    };
  }

  return {
    health: 'live',
    headline: state.bans.length
      ? `${state.bans.length} address${state.bans.length === 1 ? '' : 'es'} banned · updated ${age}`
      : `No addresses banned · updated ${age}`,
    detail: null,
    bans: state.bans,
    actionable: true,
    generatedAtIso: iso,
  };
}
