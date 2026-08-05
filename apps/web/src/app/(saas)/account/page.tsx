// User-facing ACCOUNT HOME (/account) — the post-login landing for a signed-in SaaS Account.
// An account can belong to zero, one, or several workspaces; this page routes accordingly:
//   - logged out       → /account/login?next=/account
//   - zero workspaces  → informational empty state
//   - exactly one      → straight into /account/workspace (skip the chooser)
//   - two or more       → a workspace chooser: one card per membership, linking into its settings
// SSR consumes the already-built `accountTenants` reader directly (idiomatic; the page is gated).
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing,
// so the self-hosted app never mounts this route and stays byte-for-byte unchanged.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { accountLanding } from '@/components/saas/accountLanding';
import { workspaceQuery } from '@/components/saas/chooseWorkspace';
import { workspaceUrl } from '@/components/saas/workspaceUrl';
import { TenantStatusBadge, MemberRoleBadge, Pill } from '@/components/saas/StatusBadge';
import { SignOutButton } from '@/components/saas/SignOutButton';
import { CreateWorkspaceForm } from '@/components/saas/CreateWorkspaceForm';
import { LeaveWorkspaceButton } from '@/components/saas/LeaveWorkspaceButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your workspaces · Pharos',
  robots: { index: false, follow: false },
};

// Account-level top bar (Pharos link + sign out) shared by every state of this landing, so a
// signed-in account is never stranded here without a way to leave or sign out. Matches the
// WorkspaceShell header idiom exactly (same tokens, same placement).
function AccountTopBar() {
  return (
    <div className="mb-8 flex items-center justify-between gap-3">
      <Link
        href="/"
        className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"
      >
        ← Pharos
      </Link>
      <div className="flex items-center gap-4">
        <Link
          href="/account/settings"
          className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"
        >
          Account settings
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

export default async function AccountHomePage() {
  // Gate (throws notFound when SaaS off) + current viewer claims.
  const viewer = await getSaasViewer();
  if (!viewer) {
    redirect(`/account/login?next=${encodeURIComponent('/account')}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);
  const decision = accountLanding(tenants);

  // Exactly one workspace: no reason to make the user pick — go straight INTO the product on
  // its own subdomain, not to /account/workspace (that's the workspace's *settings* overview,
  // not the app itself — landing there after login read as "I signed in and got a settings
  // page", reported live 2026-08-05). workspaceUrl falls back to a root-relative '/' when no
  // public URL is configured, same safety net WorkspaceShell's "open workspace" link already
  // relied on.
  if (decision.kind === 'single') {
    redirect(workspaceUrl(decision.slug, process.env.SAAS_PUBLIC_URL));
  }

  if (decision.kind === 'empty') {
    return (
      <div className="min-h-screen bg-[color:var(--color-bg)] px-4 py-16 text-[color:var(--color-text)]">
        <div className="mx-auto max-w-md">
          <AccountTopBar />
          <div className="text-center">
            <h1 className="text-xl font-semibold">No workspace yet</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">
              Your account is not a member of any workspace. Ask an owner to invite you by email
              and it will show up here once you accept, or start your own below.
            </p>
          </div>
          <div className="mt-6">
            <CreateWorkspaceForm autoOpen />
          </div>
        </div>
      </div>
    );
  }

  const workspaces = decision.workspaces;

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] px-4 py-12 text-[color:var(--color-text)]">
      <div className="mx-auto max-w-3xl">
        <AccountTopBar />
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
              {viewer.email || 'Signed in'}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold">Your workspaces</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">
              Pick a workspace to open its settings and usage.
            </p>
          </div>
          <CreateWorkspaceForm />
        </header>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {workspaces.map((ws, i) => (
            <li key={ws.slug || i}>
              <div className="group flex h-full flex-col gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 transition-colors hover:border-[color:var(--color-accent)]">
                <Link href={`/account/workspace${workspaceQuery(ws.slug, i === 0)}`} className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-base font-semibold">
                        {ws.name || ws.slug || 'Untitled workspace'}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-[color:var(--color-text-faint)]">
                        {ws.slug || '—'}
                      </div>
                    </div>
                    <TenantStatusBadge status={ws.status} />
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Pill tone="cyan">{ws.plan || 'free'}</Pill>
                      <MemberRoleBadge role={ws.role} />
                    </div>
                    <span
                      aria-hidden
                      className="text-[color:var(--color-text-faint)] transition-colors group-hover:text-[color:var(--color-accent)]"
                    >
                      →
                    </span>
                  </div>
                </Link>
                {/* Outside the Link (invalid to nest a button in an anchor) — a member may
                    always walk away from their own membership, no owner/admin needed. */}
                <div className="flex items-center justify-end border-t border-[color:var(--color-border)] pt-2">
                  <LeaveWorkspaceButton slug={ws.slug} name={ws.name || ws.slug} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
