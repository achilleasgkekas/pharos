// Presentational shell for the user-facing workspace-settings pages ((saas)/account/workspace/*).
// Server-safe (no client hooks): a header with the workspace name, plan/status/role badges, a
// workspace switcher (only when the account belongs to more than one), and the workspace's own
// sub-nav (Overview/Settings/Members/...). Sign out lives in the global SiteNav's account menu
// now that SiteNav renders on this segment too, so this shell no longer carries its own copy.
// Styled with the existing Pharos design tokens. Only rendered in SAAS_MODE (the whole segment
// 404s otherwise).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pill, TenantStatusBadge, MemberRoleBadge } from './StatusBadge';
import { workspaceQuery } from './chooseWorkspace';

export type WorkspaceTab = { href: string; label: string; active: boolean };

/** A workspace the account can switch to, for the header dropdown-less switcher. */
export type SwitchTarget = { slug: string; name: string; active: boolean };

export function WorkspaceShell({
  workspaceName,
  plan,
  status,
  role,
  tabs,
  switchTargets,
  appUrl,
  children,
}: {
  workspaceName: string;
  plan: string;
  status: string;
  role: string;
  tabs?: WorkspaceTab[];
  switchTargets?: SwitchTarget[];
  /** Absolute URL of the workspace's own subdomain — the actual app. Omitted ⇒ no button. */
  appUrl?: string;
  children: ReactNode;
}) {
  const others = switchTargets ?? [];
  const tabList = tabs ?? [];
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <div className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6">
        {/* Header. What used to sit here was a row of mono-caps links (← PHAROS / ACCOUNT
            SETTINGS / SIGN OUT) above the title and a full-size green "Open workspace" CTA
            beside it — three ways out of the page competing with the page itself. Account
            settings is a tab now, sign out lives at the foot of the nav with the other
            account-level action, and the way into the product is a normal button rather than
            the loudest thing on screen. */}
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {workspaceName || 'Workspace'}
          </h1>
          <Pill tone="neutral">{plan}</Pill>
          <TenantStatusBadge status={status} />
          <MemberRoleBadge role={role} />
          {appUrl && (
            <a
              href={appUrl}
              className="ml-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
            >
              Open workspace →
            </a>
          )}
        </header>

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

        {/* Same shape as Settings: a sticky rail on desktop, a scrollable pill strip on
            mobile. The old bar wrapped onto two ragged rows on a phone. */}
        <div className="flex gap-6 items-start">
          {tabList.length > 0 && (
            <aside className="hidden md:block w-52 shrink-0 sticky top-4 self-start">
              <nav aria-label="Workspace" className="flex flex-col gap-0.5">
                {tabList.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={t.active ? 'page' : undefined}
                    className={
                      t.active
                        ? 'rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--color-accent)]'
                        : 'rounded-lg px-3 py-2 text-sm text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-text)]'
                    }
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {tabList.length > 0 && (
              <nav
                aria-label="Workspace"
                className="md:hidden -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1"
              >
                {tabList.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={t.active ? 'page' : undefined}
                    className={
                      t.active
                        ? 'shrink-0 rounded-lg bg-[color:var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-black'
                        : 'shrink-0 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm text-[color:var(--color-text-dim)]'
                    }
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            )}
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
