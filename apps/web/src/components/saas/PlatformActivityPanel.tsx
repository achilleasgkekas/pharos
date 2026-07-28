// Presentational (server-safe, no client hooks) PLATFORM activity feed for the superadmin console
// (/admin/audit). Renders the display rows produced by platformActivity.toPlatformActivityRows() —
// the cross-tenant audit trail. Unlike the workspace-scoped ActivityPanel this is a table with a
// Workspace column, because in a cross-tenant feed "which workspace" is the primary way an
// operator scans the list. Styled with the existing Pharos design tokens (no shared CSS touched).
// Only ever mounted inside the superadmin-gated /admin segment.
import Link from 'next/link';
import { Pill } from './StatusBadge';
import { formatWhen } from './format';
import type { PlatformActivityRow } from './platformActivity';

/** Empty-feed placeholder. Copy differs by cause so an operator is not left guessing whether a
 *  filter is hiding rows or nothing has happened. */
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <p className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
      {filtered
        ? 'No activity matches this filter.'
        : 'No activity recorded yet. Membership, invite, billing, and workspace events across every workspace appear here.'}
    </p>
  );
}

function WorkspaceCell({ row }: { row: PlatformActivityRow }) {
  // A purged tenant has no detail page to link to — render the placeholder as plain dim text so a
  // dead link is impossible.
  if (!row.workspaceSlug) {
    return (
      <span className="text-[color:var(--color-text-faint)] italic">{row.workspaceLabel}</span>
    );
  }
  return (
    <Link
      href={`/admin/tenants/${encodeURIComponent(row.workspaceSlug)}`}
      className="font-medium text-[color:var(--color-text)] hover:text-[color:var(--color-accent)]"
    >
      {row.workspaceLabel}
      <span className="block font-mono text-[11px] font-normal text-[color:var(--color-text-faint)]">
        {row.workspaceSlug}
      </span>
    </Link>
  );
}

/**
 * The platform activity table. `rows` are already display-mapped and ordered newest-first by the
 * page. `filtered` only selects the empty-state copy.
 */
export function PlatformActivityPanel({
  rows,
  filtered = false,
}: {
  rows: PlatformActivityRow[];
  filtered?: boolean;
}) {
  if (rows.length === 0) return <EmptyState filtered={filtered} />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            <th className="px-4 py-2 font-normal">When</th>
            <th className="px-4 py-2 font-normal">Workspace</th>
            <th className="px-4 py-2 font-normal">Action</th>
            <th className="px-4 py-2 font-normal">Actor</th>
            <th className="px-4 py-2 font-normal">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[color:var(--color-border)] last:border-0 align-top hover:bg-[color:var(--color-surface)]/60"
            >
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[color:var(--color-text-faint)]">
                {formatWhen(row.createdAt)}
              </td>
              <td className="px-4 py-2.5">
                <WorkspaceCell row={row} />
              </td>
              <td className="px-4 py-2.5">
                <Pill tone={row.tone}>{row.label}</Pill>
              </td>
              <td className="max-w-[220px] truncate px-4 py-2.5 text-[color:var(--color-text-dim)]">
                {row.actor}
              </td>
              <td className="max-w-[280px] px-4 py-2.5">
                {row.target ? (
                  <span className="block truncate font-mono text-xs text-[color:var(--color-text-dim)]">
                    {row.target}
                  </span>
                ) : (
                  <span className="text-[color:var(--color-text-faint)]">—</span>
                )}
                {row.meta && (
                  <span className="block truncate text-xs text-[color:var(--color-text-faint)]">
                    {row.meta}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
