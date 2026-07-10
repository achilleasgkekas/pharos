// Presentational (server-safe, no client hooks) Activity list for the workspace-settings
// Activity panel ((saas)/account/workspace/activity). Renders the display rows produced by
// activityView.toActivityRows() — the read-only audit trail for one workspace. Styled with the
// existing Pharos design tokens (no shared CSS touched). Only ever mounted inside the
// SAAS_MODE-gated (saas) segment.
import { Pill } from './StatusBadge';
import { formatWhen } from './format';
import type { ActivityRow } from './activityView';

/** Empty-trail placeholder — a fresh workspace has recorded nothing yet. */
function EmptyState() {
  return (
    <p className="py-8 text-center text-sm text-[color:var(--color-text-faint)]">
      No activity recorded yet. Membership, invite, plan, and workspace changes will appear here.
    </p>
  );
}

function ActivityItem({ row }: { row: ActivityRow }) {
  return (
    <li className="flex flex-col gap-1 border-b border-[color:var(--color-border)] py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={row.tone}>{row.label}</Pill>
          <span className="truncate text-sm text-[color:var(--color-text)]">{row.actor}</span>
        </div>
        {row.target && (
          <p className="truncate text-xs text-[color:var(--color-text-dim)]">
            Target: <span className="font-mono">{row.target}</span>
          </p>
        )}
        {row.meta && (
          <p className="truncate text-xs text-[color:var(--color-text-faint)]">{row.meta}</p>
        )}
      </div>
      <time className="shrink-0 font-mono text-xs text-[color:var(--color-text-faint)]">
        {formatWhen(row.createdAt)}
      </time>
    </li>
  );
}

/**
 * The Activity trail list. `rows` are already display-mapped + ordered newest-first by the
 * page. When empty, shows the placeholder.
 */
export function ActivityPanel({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <ul className="-my-1">
      {rows.map((row) => (
        <ActivityItem key={row.id} row={row} />
      ))}
    </ul>
  );
}
