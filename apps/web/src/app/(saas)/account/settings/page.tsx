// User-facing ACCOUNT SETTINGS page (SaaS control plane, /account/settings) — the gap flagged
// by the /api/saas/account* routes themselves: profile update (PATCH /api/saas/account),
// password change (POST /api/saas/account/password) and the GDPR data export
// (GET /api/saas/account/export) were all fully built with zero UI to drive them. This page is
// the client. Account-level (not workspace-scoped) — mirrors AccountHomePage's top bar rather
// than WorkspaceShell, since a viewer may have zero/one/many workspaces here.
//
// Increment 82 additive extension: also seeds the panel's "Two-factor authentication" section
// (POST/DELETE /api/saas/account/mfa + POST .../mfa/confirm, built increment 80a) with the
// account's current mfaEnabled flag + whether the server can even do the crypto
// (secretCryptoReady — AUTH_SECRET configured). Still NOT wired into the login flow (80c).
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Additive + SaaS-only — the self-hosted
// app never mounts this route, so it stays byte-for-byte unchanged.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { Account } from '@/models/Account';
import { secretCryptoReady } from '@/lib/tenancy/secretCrypto';
import { SignOutButton } from '@/components/saas/SignOutButton';
import { AccountSettingsPanel } from '@/components/saas/AccountSettingsPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account settings · Pharos',
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const viewer = await getSaasViewer();
  if (!viewer) {
    redirect(`/account/login?next=${encodeURIComponent('/account/settings')}`);
  }

  await connectDB();
  const account = await Account.findById(viewer.sub)
    .select('_id email name emailVerified mfaEnabled')
    .lean<{ _id: unknown; email?: string; name?: string; emailVerified?: boolean; mfaEnabled?: boolean } | null>();
  if (!account) {
    redirect(`/account/login?next=${encodeURIComponent('/account/settings')}`);
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] px-4 py-12 text-[color:var(--color-text)]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            href="/account"
            className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"
          >
            ← Your workspaces
          </Link>
          <SignOutButton />
        </div>

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
      </div>
    </div>
  );
}
