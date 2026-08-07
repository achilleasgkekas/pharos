// The tables on /admin/deletions. Presentational and READ-ONLY — deliberately no 'use client' and
// deliberately no buttons: this console can observe a scheduled deletion, it cannot trigger one.
// Cancelling belongs to the workspace owner (the erasure lifecycle is theirs), and dropping is the
// executor's, behind its own flag. A "delete now" button here would be a second destructive path,
// which is exactly how one of two paths gets a bug and takes a customer's data with it.
//
// Only ever mounted inside the SAAS_MODE + superadmin gated /admin segment.
import Link from 'next/link';
import { formatWhen } from './format';
import type { DeletionEntry, SuspensionEntry } from './deletionQueueView';

const TH =
  'px-4 py-2 text-[10px] font-mono font-normal uppercase tracking-wider text-[color:var(--color-text-faint)]';
const TD = 'px-4 py-2 text-[color:var(--color-text-dim)]';

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint: string;
  accent?: 'red' | 'gold';
  children: React.ReactNode;
}) {
  const border =
    accent === 'red'
      ? 'border-[color:var(--color-red)]/40'
      : accent === 'gold'
        ? 'border-[color:var(--color-gold)]/40'
        : 'border-[color:var(--color-border)]';
  return (
    <section className={`rounded-2xl border ${border} bg-[color:var(--color-surface)]`}>
      <header className="border-b border-[color:var(--color-border)] px-4 py-3">
        <h2 className="font-display text-sm font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-[color:var(--color-text-dim)]">{hint}</p>
      </header>
      {children}
    </section>
  );
}

/** Workspace cell: name over slug, linking to the existing per-tenant admin detail page. */
function Workspace({ entry }: { entry: { name: string; slug: string | null } }) {
  return (
    <div className="min-w-0">
      {entry.slug ? (
        <Link
          href={`/admin/tenants/${entry.slug}`}
          className="text-[color:var(--color-text)] hover:text-[color:var(--color-cyan)]"
        >
          {entry.name}
        </Link>
      ) : (
        <span className="text-[color:var(--color-text)]">{entry.name}</span>
      )}
      {entry.slug && (
        <div className="font-mono text-[10px] text-[color:var(--color-text-faint)]">{entry.slug}</div>
      )}
    </div>
  );
}

/** Who asked. A system-initiated erasure names the reason, never a person: nobody requested it. */
function Requester({ entry }: { entry: DeletionEntry }) {
  if (entry.systemInitiated) {
    return (
      <span className="text-[color:var(--color-text-dim)]" title="Enrolled by the suspended-workspace sweep after its 30-day keep-window ran out.">
        suspension expired
      </span>
    );
  }
  if (!entry.requestedBy) return <span className="text-[color:var(--color-text-faint)]">—</span>;
  return <span className="font-mono text-[11px]">{entry.requestedBy}</span>;
}

export function RefusedTable({ entries }: { entries: DeletionEntry[] }) {
  if (!entries.length) return null;
  return (
    <Section
      title={`Stuck · ${entries.length}`}
      accent="red"
      hint="Past the deadline, and the purge refuses them on the database-name safety check. These do not resolve on their own and each one still spends a slot in every run."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left">
              {['Workspace', 'Overdue', 'Why it is refused'].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-[color:var(--color-border)] last:border-0">
                <td className="px-4 py-2">
                  <Workspace entry={e} />
                </td>
                <td className={TD}>{e.daysOverdue === 0 ? 'today' : `${e.daysOverdue}d`}</td>
                <td className="px-4 py-2 text-[color:var(--color-red)]">{e.refusedReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function DueTable({ entries, armed }: { entries: DeletionEntry[]; armed: boolean }) {
  if (!entries.length) return null;
  return (
    <Section
      title={`Past the deadline · ${entries.length}`}
      accent="gold"
      hint={
        armed
          ? 'The grace window has run out. An armed run drops these, newest deadline last, up to the per-run cap.'
          : 'The grace window has run out, but nothing is armed to delete them. They and their data are still here.'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left">
              {['Workspace', 'Plan', 'Overdue', 'Deadline was', 'Requested by'].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-[color:var(--color-border)] last:border-0">
                <td className="px-4 py-2">
                  <Workspace entry={e} />
                </td>
                <td className={TD}>{e.plan ?? '—'}</td>
                <td className="px-4 py-2 text-[color:var(--color-gold)]">
                  {e.daysOverdue === 0 ? 'today' : `${e.daysOverdue}d`}
                </td>
                <td className={TD}>{formatWhen(e.scheduledAt)}</td>
                <td className={TD}>
                  <Requester entry={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function ScheduledTable({ entries }: { entries: DeletionEntry[] }) {
  return (
    <Section
      title={`Scheduled · ${entries.length}`}
      hint="Deletion is pending but the grace window is still running. The owner can cancel any of these and nothing is lost."
    >
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[color:var(--color-text-dim)]">
          No workspace has a deletion pending.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left">
                {['Workspace', 'Plan', 'Status', 'Days left', 'Deletes on', 'Requested by'].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="px-4 py-2">
                    <Workspace entry={e} />
                  </td>
                  <td className={TD}>{e.plan ?? '—'}</td>
                  <td className={TD}>{e.status ?? '—'}</td>
                  <td className="px-4 py-2 text-[color:var(--color-text)]">
                    {e.daysLeft === 0 ? 'due now' : `${e.daysLeft}d`}
                  </td>
                  <td className={TD}>{formatWhen(e.scheduledAt)}</td>
                  <td className={TD}>
                    <Requester entry={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function SuspensionsTable({
  entries,
  graceDays,
}: {
  entries: SuspensionEntry[];
  graceDays: number;
}) {
  return (
    <Section
      title={`Suspended · ${entries.length}`}
      hint={`Not scheduled for deletion yet. A suspended workspace is kept ${graceDays} days, gets one warning email, and is then enrolled above automatically. Reactivating it clears the clock.`}
    >
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[color:var(--color-text-dim)]">
          No workspace is suspended.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left">
                {['Workspace', 'Plan', 'Suspended', 'Enrolled in', 'Warned'].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="px-4 py-2">
                    <Workspace entry={e} />
                  </td>
                  <td className={TD}>{e.plan ?? '—'}</td>
                  <td className={TD}>{formatWhen(e.suspendedAt)}</td>
                  {/* "Clock not started" is its own answer. Rendering it as a blank cell would let
                      an operator read "no deadline yet" as "deadline unknown, maybe tomorrow". */}
                  <td className={TD}>
                    {e.clockUnknown ? (
                      <span
                        className="text-[color:var(--color-text-faint)]"
                        title={`This workspace has no suspension timestamp. The next sweep gives it one, and the ${graceDays} days start from there.`}
                      >
                        clock not started
                      </span>
                    ) : e.daysLeft === 0 ? (
                      <span className="text-[color:var(--color-gold)]">next sweep</span>
                    ) : (
                      `${e.daysLeft}d`
                    )}
                  </td>
                  <td className={TD}>
                    {e.warned ? (
                      <span className="text-[color:var(--color-text)]">yes</span>
                    ) : (
                      <span className="text-[color:var(--color-text-faint)]">not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
