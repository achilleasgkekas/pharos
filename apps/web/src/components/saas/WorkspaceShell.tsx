// Presentational shell for the user-facing workspace-settings pages ((saas)/account/workspace/*).
// Server-safe (no client hooks): a header with the workspace name, plan/status/role badges, a
// workspace switcher (only when the account belongs to more than one), and account-level links
// (sign out, open app). Styled ONLY with the existing Pharos design tokens — never touches
// shared chrome (SiteNav/globals). Only rendered in SAAS_MODE (the whole segment 404s otherwise).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pill, TenantStatusBadge, MemberRoleBadge } from './StatusBadge';
import { workspaceQuery } from './chooseWorkspace';
import { SignOutButton } from './SignOutButton';

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
  children,
}: {
  workspaceName: string;
  plan: string;
  status: string;
  role: string;
  tabs?: WorkspaceTab[];
  switchTargets?: SwitchTarget[];
  children: ReactNode;
}) {
  const others = switchTargets ?? [];
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-[color:var(--color-border)] pb-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"
            >
              ← Pharos
            </Link>
            <SignOutButton />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{workspaceName || 'Workspace'}</h1>
            <Pill tone="neutral">{plan}</Pill>
            <TenantStatusBadge status={status} />
            <MemberRoleBadge role={role} />
          </div>

          {others.length > 1 && (
            <nav
              aria-label="Switch workspace"
              className="flex flex-wrap items-center gap-2 text-xs"
            >
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

          {tabs && tabs.length > 0 && (
            <nav aria-label="Workspace settings" className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={t.active ? 'page' : undefined}
                  className={
                    t.active
                      ? 'rounded-lg bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-text)]'
                      : 'rounded-lg px-3 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-text)]'
                  }
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
        </header>

        <main className="pt-6">{children}</main>
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
