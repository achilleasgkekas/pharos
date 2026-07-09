// SaaS superadmin console shell (/admin/*). SELF-GATING: requireSuperadminPage() throws
// notFound() for the self-hosted app (SAAS_MODE off), when the operator allowlist is empty,
// or for any viewer who is not a configured superadmin — so this segment does not exist for
// anyone but a platform operator, and the OSS build is byte-for-byte unchanged.
//
// The segment carries its OWN chrome (this shell) rather than the app's SiteNav, so nothing
// in the shared layout/components is touched. force-dynamic + a fresh gate on every request
// (no caching of the authz decision).
import type { ReactNode } from 'react';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { AdminNav } from '@/components/saas/AdminNav';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pharos · Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const account = await requireSuperadminPage();
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold uppercase tracking-widest">
              Pharos
            </span>
            <span className="rounded-full border border-[color:var(--color-purple)]/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-purple)]">
              Admin
            </span>
            <AdminNav />
          </div>
          <span
            className="max-w-[40vw] truncate text-xs text-[color:var(--color-text-faint)]"
            title={account.email}
          >
            {account.email}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
