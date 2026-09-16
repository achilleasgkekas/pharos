// Presentational shell for the user-facing workspace-settings pages ((saas)/account/workspace/*).
// Server-safe container: a header with the workspace name, plan/status/role badges, a
// workspace switcher (only when the account belongs to more than one), and the workspace's own
// sub-nav (Overview/Settings/Members/...). Sign out lives in the global SiteNav's account menu
// now that SiteNav renders on this segment too, so this shell no longer carries its own copy.
// Styled with the existing Pharos design tokens. Only rendered in SAAS_MODE (the whole segment
// 404s otherwise).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pill, TenantStatusBadge, MemberRoleBadge } from './StatusBadge';
import { workspaceQuery } from './chooseWorkspace';
import { WorkspaceTabNav, type WorkspaceTab } from './WorkspaceTabNav';

export type { WorkspaceTab };

/** A workspace the account can switch to, for the header dropdown-less switcher. */
export type SwitchTarget = { slug: string; name: string; active: boolean };

export function WorkspaceShell({
  workspaceName,
  plan,
  status,
  role,
  tabs,
  switchTargets,
  children,
}: {
  /** Omit entirely (not just falsy) for a viewer with no workspace context at all — e.g.
   *  /account/settings for an account that isn't a member of anything. Skips the whole header
   *  row rather than inventing placeholder badges for a workspace that doesn't exist. */
  workspaceName?: string;
  plan?: string;
  status?: string;
  role?: string;
  tabs?: WorkspaceTab[];
  switchTargets?: SwitchTarget[];
  /** Absolute URL of the workspace's own subdomain — accepted for callers that still pass it
   *  (the "open workspace" exit now lives in the global SiteNav's logo/nav, not here) but no
   *  longer rendered as a link of its own. */
  appUrl?: string;
  children: ReactNode;
}) {
  const others = switchTargets ?? [];
  const tabList = tabs ?? [];
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Header. What used to sit here was a row of mono-caps links (← PHAROS / ACCOUNT
            SETTINGS / SIGN OUT) above the title, plus a full-size green "Open workspace" CTA
            boxed on the right — competing exits, on a page that now also carries the global
            SiteNav whose own logo/nav links already lead back into the product (see the root
            layout's productBaseUrl). So this reads like a normal Pharos page header now: a
            plain h1 with its meta pills inline, nothing competing for the exit anymore.
            Omitted entirely when there's no workspace context (see the type comment above). */}
        {workspaceName !== undefined && (
          <header className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {workspaceName || 'Workspace'}
            </h1>
            {plan && <Pill tone="neutral">{plan}</Pill>}
            {status && <TenantStatusBadge status={status} />}
            {role && <MemberRoleBadge role={role} />}
          </header>
        )}

        {others.length > 1 && (
          <nav aria-label="Switch workspace" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
              Workspace
            </span>
            {others.map((w) => (
              <Link
                key={w.slug}
                href={`/account/workspace${workspaceQuery(w.slug, false)}`}
                aria-current={w.active ? 'true' : undefined}
                className={
                  w.active
                    ? 'rounded-full border border-[color:var(--color-accent)] px-3 py-1 text-[color:var(--color-accent)]'
                    : 'rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)]'
                }
              >
                {w.name || w.slug}
              </Link>
            ))}
          </nav>
        )}

        {/* Same nav, same classes, as Settings' own tab strip (app/settings/SettingsClient.tsx)
            — one link list, no separate desktop/mobile markup: a sticky rail on desktop
            (top-20, clearing the global SiteNav), a scrollable pill strip on mobile. This used
            to be two differently-styled blocks (a muted accent-text rail + a solid-fill pill
            strip) that didn't match Settings' look or each other. */}
        <div className="flex flex-col md:flex-row gap-5">
          <WorkspaceTabNav tabs={tabList} />

          <div className="min-w-0 flex-1">
            <main>{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A titled panel wrapper matching the console card style (border + surface + rounded). */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A key→value definition row used inside panels. */
export function DefRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-[color:var(--color-text-dim)]">{label}</span>
      <span className="text-right text-[color:var(--color-text)]">{value}</span>
    </div>
  );
}
