'use client';

// The banned-IP table on /admin/firewall, with the one action this console offers: queue an
// unban. Client-only for the button state; the list itself is server-rendered data passed in.
//
// The button says QUEUE, and the notice says "queued", because that is the literal truth: the
// container writes a request file and the host acts on it within a minute (lib/saas/f2b). A
// button labelled "Unban" that returns instantly would teach the operator to expect an immediate
// effect and then read the still-present row as a bug.
//
// Only ever mounted inside the SAAS_MODE + superadmin gated /admin segment.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BanRow } from '@/lib/saas/f2b';
import { canRequestUnban } from './firewallView';

type Props = {
  bans: BanRow[];
  /** False when the screen does not actually know the firewall state; the table is then not
   *  rendered at all and this component shows nothing. */
  actionable: boolean;
};

async function queueUnban(ip: string, jail: string): Promise<{ ok: boolean; error: string | null }> {
  let res: Response;
  try {
    res = await fetch('/api/saas/admin/firewall/unban', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ip, jail }),
    });
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body — fall through to a generic message.
  }
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : 'Request failed.' };
  }
  return { ok: true, error: null };
}

export function FirewallPanel({ bans, actionable }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string[]>([]);

  async function onUnban(row: BanRow) {
    if (busy) return;
    if (!window.confirm(`Queue an unban for ${row.ip} (${row.jail})?`)) return;
    setBusy(row.ip);
    setError(null);
    const { ok, error: err } = await queueUnban(row.ip, row.jail);
    setBusy(null);
    if (!ok) return setError(err);
    setQueued((q) => [...q, row.ip]);
    // Refresh so the row disappears on the next bridge write. It will NOT disappear immediately,
    // which is why the row keeps its own "queued" marker below.
    router.refresh();
  }

  if (bans.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
      {error && (
        <p className="border-b border-[color:var(--color-red)]/40 px-4 py-2 text-sm text-[color:var(--color-red)]">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left">
            {['Address', 'Jail', 'Banned', 'Until', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-[10px] font-mono font-normal uppercase tracking-wider text-[color:var(--color-text-faint)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bans.map((row) => {
            const isQueued = queued.includes(row.ip);
            const allowed = canRequestUnban(row.jail);
            return (
              <tr
                key={`${row.jail}:${row.ip}`}
                className="border-b border-[color:var(--color-border)] last:border-0"
              >
                <td className="px-4 py-2 font-mono text-[color:var(--color-text)]">{row.ip}</td>
                <td className="px-4 py-2 text-[color:var(--color-text-dim)]">{row.jail}</td>
                {/* Host-local times, printed as the host printed them. Not converted: they are
                    not UTC, and a silent conversion would misplace an incident by hours. */}
                <td className="px-4 py-2 text-[color:var(--color-text-dim)]">{row.bannedAt ?? '—'}</td>
                <td className="px-4 py-2 text-[color:var(--color-text-dim)]">{row.until ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {isQueued ? (
                    <span className="text-xs text-[color:var(--color-gold)]">
                      queued · clears within a minute
                    </span>
                  ) : !allowed ? (
                    <span
                      className="text-xs text-[color:var(--color-text-faint)]"
                      title="The host bridge only accepts unban requests for the sshd jail. Unban this one from the host."
                    >
                      not requestable
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUnban(row)}
                      disabled={busy !== null || !actionable}
                      className="rounded-lg border border-[color:var(--color-border-light)] px-3 py-1 text-xs text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-cyan)] hover:text-[color:var(--color-cyan)] disabled:opacity-40"
                    >
                      {busy === row.ip ? 'queueing…' : 'Queue unban'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
