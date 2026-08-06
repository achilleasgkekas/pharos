// SaaS superadmin FIREWALL page (/admin/firewall) — the host's fail2ban bans, with a queue-an-
// unban action. Requested by Achilleas (ASK `pharos-cloud-guard-20260805-1525`, answered: option
// α, "a queue with an executor on the host").
//
// The architecture in one line: this page READS a file the host writes and WRITES request files
// the host reads. It never touches the fail2ban socket, because that socket accepts action
// definitions — commands the fail2ban server runs as root — and this same app serves anonymous
// POSTs on /login and /signup. Handing it that socket would turn any RCE here into host root.
//
// Self-gates like the rest of /admin (segment layout + the defence-in-depth call below), so the
// self-hosted build is byte-for-byte unchanged.
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { readBanState, F2B_JAILS } from '@/lib/saas/f2b';
import { firewallView } from '@/components/saas/firewallView';
import { FirewallPanel } from '@/components/saas/FirewallPanel';

export const dynamic = 'force-dynamic';

const TONE = {
  live: 'border-[color:var(--color-accent)]/40 text-[color:var(--color-accent)]',
  stale: 'border-[color:var(--color-gold)]/50 text-[color:var(--color-gold)]',
  unknown: 'border-[color:var(--color-red)]/50 text-[color:var(--color-red)]',
} as const;

export default async function AdminFirewallPage() {
  await requireSuperadminPage();
  const view = firewallView(await readBanState());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">Firewall</h1>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          fail2ban · {F2B_JAILS.join(', ')}
        </span>
      </div>

      {/* The status line is never optional and never silent. A blank screen with an empty table
          would read as "all clear" in exactly the case where the honest answer is "I don't know". */}
      <div className={`rounded-2xl border bg-[color:var(--color-surface)] p-4 ${TONE[view.health]}`}>
        <p className="text-sm font-medium">{view.headline}</p>
        {view.detail && (
          <p className="mt-1 text-xs text-[color:var(--color-text-dim)]">{view.detail}</p>
        )}
        {view.generatedAtIso && (
          <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-faint)]">
            {view.generatedAtIso}
          </p>
        )}
      </div>

      <FirewallPanel bans={view.bans} actionable={view.actionable} />

      <p className="text-xs text-[color:var(--color-text-dim)]">
        Unbans are <span className="text-[color:var(--color-text)]">queued</span>, not executed
        here: this console writes a request that the host bridge validates again and carries out
        within a minute. It can only ever ask for an unban, never a ban, and never an arbitrary
        command. Every request is recorded in{' '}
        <span className="text-[color:var(--color-text)]">Activity</span> with who asked.
      </p>
    </div>
  );
}
