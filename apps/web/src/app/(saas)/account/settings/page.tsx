// User-facing ACCOUNT SETTINGS page (SaaS control plane, /account/settings) — the gap flagged
// by the /api/saas/account* routes themselves: profile update (PATCH /api/saas/account),
// password change (POST /api/saas/account/password) and the GDPR data export
// (GET /api/saas/account/export) were all fully built with zero UI to drive them. This page is
// the client.
//
// Wrapped in WorkspaceShell like its six siblings (Overview/Settings/Members/Usage/Activity/
// Billing) — workspaceTabs.ts already lists "Account" as one of the seven tabs and highlights
// it correctly when reached from elsewhere; this page used to build its own bespoke header
// ("← Back to workspace / Sign out") instead of actually using the shell the nav promised,
// which is exactly the "doesn't match the rest" gap flagged live 2026-08-05. Account-level, not
// workspace-scoped — a viewer may have zero/one/many workspaces here, so `chosen` can be null;
// WorkspaceShell's workspace props are optional precisely for this case (skips the name/badge
// row, keeps the tab nav + content). Sign out lives in the global SiteNav's account menu now,
// so this page no longer carries its own copy either.
//
// Increment 82 additive extension: also seeds the panel's "Two-factor authentication" section
// (POST/DELETE /api/saas/account/mfa + POST .../mfa/confirm, built increment 80a) with the
// account's current mfaEnabled flag + whether the server can even do the crypto
// (secretCryptoReady — AUTH_SECRET configured). Still NOT wired into the login flow (80c).
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Additive + SaaS-only — the self-hosted
// app never mounts this route, so it stays byte-for-byte unchanged.
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { Account } from '@/models/Account';
import { secretCryptoReady } from '@/lib/tenancy/secretCrypto';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { WorkspaceShell } from '@/components/saas/WorkspaceShell';
import { AccountSettingsPanel } from '@/components/saas/AccountSettingsPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account settings · Pharos',
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  const viewer = await getSaasViewer();
  if (!viewer) {
    redirect(`/account/login?next=${encodeURIComponent('/account/settings')}`);
  }

  await connectDB();
  const [account, tenants] = await Promise.all([
    Account.findById(viewer.sub)
      .select('_id email name emailVerified mfaEnabled')
      .lean<{ _id: unknown; email?: string; name?: string; emailVerified?: boolean; mfaEnabled?: boolean } | null>(),
    accountTenants(viewer.sub),
  ]);
  if (!account) {
    redirect(`/account/login?next=${encodeURIComponent('/account/settings')}`);
  }

  // No `?w=` given ⇒ first membership (or null when the account has none at all) — same default
  // every other workspace page uses.
  const chosen = pickWorkspace(tenants, w);

  return (
    <WorkspaceShell
      workspaceName={chosen?.name}
      plan={chosen?.plan}
      status={chosen?.status}
      role={chosen?.role}
      tabs={chosen ? workspaceTabs('account', w) : undefined}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen?.slug,
      }))}
    >
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Account settings</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">
          Update your profile, change your password, or download your data.
        </p>
      </header>

      <AccountSettingsPanel
        email={account.email || ''}
        name={account.name || ''}
        emailVerified={!!account.emailVerified}
        mfaEnabled={!!account.mfaEnabled}
        mfaCryptoReady={secretCryptoReady()}
      />
    </WorkspaceShell>
  );
}
