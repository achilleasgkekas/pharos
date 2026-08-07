// SaaS superadmin DELETIONS page (/admin/deletions) — every workspace heading for permanent
// deletion, and what the next automatic run would actually do about it.
//
// Why this page exists, and why it exists BEFORE the flag is armed: `SAAS_PURGE_EXECUTE` is off in
// production on purpose, so today a workspace can pass its deadline and sit there with nothing
// deleting it, visible only in a cron response nobody reads. Arming a switch that drops customer
// databases without a screen that says what it is pointed at is the wrong order. So the sequence
// is: this screen, then a month of watching it, then the flag.
//
// READ-ONLY by design. No cancel button (the erasure lifecycle belongs to the workspace owner) and
// no delete button (that belongs to the executor, behind its own flag). A second destructive path
// is how one of two paths gets a bug and takes a customer's data with it.
//
// Self-gates like the rest of /admin (segment layout + requireSuperadminPage), so the self-hosted
// build is byte-for-byte unchanged.
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { loadDeletionQueue, DELETION_QUEUE_LIMIT } from '@/lib/tenancy/deletionQueue';
import { purgeExecuteEnabled, purgeMaxPerRun } from '@/lib/tenancy/purgeExecute';
import { SUSPENDED_GRACE_DAYS } from '@/lib/tenancy/suspendedSweep';
import { ERASURE_GRACE_DAYS } from '@/lib/tenancy/erasure';
import { deletionQueueView } from '@/components/saas/deletionQueueView';
import {
  DueTable,
  RefusedTable,
  ScheduledTable,
  SuspensionsTable,
} from '@/components/saas/DeletionQueuePanel';

export const dynamic = 'force-dynamic';

const TONE = {
  idle: 'border-[color:var(--color-border)] text-[color:var(--color-text)]',
  armed: 'border-[color:var(--color-cyan)]/40 text-[color:var(--color-cyan)]',
  waiting: 'border-[color:var(--color-gold)]/50 text-[color:var(--color-gold)]',
  alarm: 'border-[color:var(--color-red)]/50 text-[color:var(--color-red)]',
} as const;

export default async function AdminDeletionsPage() {
  await requireSuperadminPage();

  const { candidates, suspensions, truncated } = await loadDeletionQueue();
  const view = deletionQueueView(candidates, suspensions, {
    armed: purgeExecuteEnabled(),
    maxPerRun: purgeMaxPerRun(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">Deletions</h1>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          {ERASURE_GRACE_DAYS}-day erasure grace · {SUSPENDED_GRACE_DAYS}-day suspension keep
        </span>
      </div>

      {/* Never optional and never silent: an empty table cannot distinguish "nothing is due" from
          "deletion is switched off", and those are different answers with different consequences. */}
      <div className={`rounded-2xl border bg-[color:var(--color-surface)] p-4 ${TONE[view.tone]}`}>
        <p className="text-sm font-medium">{view.headline}</p>
        {view.detail && (
          <p className="mt-1 text-xs text-[color:var(--color-text-dim)]">{view.detail}</p>
        )}
        {view.starvationWarning && (
          <p className="mt-2 text-xs text-[color:var(--color-red)]">{view.starvationWarning}</p>
        )}
      </div>

      {truncated && (
        <p className="text-xs text-[color:var(--color-gold)]">
          More than {DELETION_QUEUE_LIMIT} workspaces are in one of these queues. This page shows the
          first {DELETION_QUEUE_LIMIT} by deadline; a queue this long is itself worth looking into.
        </p>
      )}

      <RefusedTable entries={view.refused} />
      <DueTable entries={view.due} armed={view.armed} />
      <ScheduledTable entries={view.scheduled} />
      <SuspensionsTable entries={view.suspensions} graceDays={SUSPENDED_GRACE_DAYS} />

      <p className="text-xs text-[color:var(--color-text-dim)]">
        This screen only <span className="text-[color:var(--color-text)]">watches</span>. Cancelling
        a deletion is the workspace owner&apos;s to do, from their own settings, any time before the
        deadline. The drop itself is carried out by the scheduled run and only when{' '}
        <span className="font-mono text-[color:var(--color-text)]">SAAS_PURGE_EXECUTE</span> is
        armed. Both are recorded in <span className="text-[color:var(--color-text)]">Activity</span>.
      </p>
    </div>
  );
}
