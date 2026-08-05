// SaaS superadmin console shell (/admin/*). SELF-GATING: requireSuperadminPage() throws
// notFound() for the self-hosted app (SAAS_MODE off), when the operator allowlist is empty,
// or for any viewer who is not a configured superadmin — so this segment does not exist for
// anyone but a platform operator, and the OSS build is byte-for-byte unchanged.
//
// The global SiteNav (root layout) now renders here too — brand, account menu (which already
// shows the signed-in email + a Sign out action), theme/language. This shell used to grow its
// own parallel logo+account-email bar to compensate for SiteNav being excluded from /admin;
// that duplication is gone. What's left is genuinely admin-local: the section badge and the
// Overview/Workspaces/Activity sub-nav, the same relationship Settings' own tab strip has to
// the page around it. force-dynamic + a fresh gate on every request (no caching of the authz
// decision).
import type { ReactNode } from 'react';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { AdminNav } from '@/components/saas/AdminNav';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pharos · Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperadminPage();
  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="mb-4 flex items-center gap-3 border-b border-[color:var(--color-border)] pb-3">
          <span className="rounded-full border border-[color:var(--color-purple)]/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-purple)]">
            Admin
          </span>
          <AdminNav />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 pb-6">{children}</main>
    </div>
  );
}
