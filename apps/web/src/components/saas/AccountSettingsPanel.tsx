'use client';

// Client interactivity for the user-facing account "Settings" page ((saas)/account/settings).
// Consumes three already-built control-plane routes that had zero UI until now:
//   PATCH /api/saas/account           — update display name / email (own account)
//   POST  /api/saas/account/password  — change password (re-verifies the current one)
//   GET   /api/saas/account/export    — download a JSON copy of the account's own data
// The page server-renders the initial profile; the profile/password mutations here
// router.refresh() afterwards so the server re-reads the source of truth, same idiom as
// WorkspaceSettingsPanel/MembersPanel. The export is a plain authenticated `<a>` link — the
// browser sends the session cookie itself, no client JS needed to trigger the download.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  profileSaveReady,
  passwordSaveReady,
  describeAccountSettingsError,
} from './accountSettings';

type Props = {
  email: string;
  name: string;
  emailVerified: boolean;
};

async function callJson(
  url: string,
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error. Check your connection and try again.' } };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body (shouldn't happen for these routes) — keep an empty object.
  }
  return { ok: res.ok, status: res.status, data };
}

export function AccountSettingsPanel({ email, name, emailVerified }: Props) {
  const router = useRouter();

  const [current, setCurrent] = useState({ name, email });
  const [nameInput, setNameInput] = useState(name);
  const [emailInput, setEmailInput] = useState(email);
  const [verified, setVerified] = useState(emailVerified);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const canSaveProfile =
    !profileBusy && profileSaveReady({ name: nameInput, email: emailInput }, current);
  const canSavePassword =
    !passwordBusy && passwordSaveReady(currentPassword, newPassword, confirmPassword);

  async function saveProfile() {
    if (!canSaveProfile) return;
    setProfileBusy(true);
    setProfileError(null);
    setProfileNotice(null);
    const emailChanged = emailInput.trim().toLowerCase() !== current.email.trim().toLowerCase();
    const { ok, status, data } = await callJson('/api/saas/account', 'PATCH', {
      name: nameInput,
      email: emailInput,
    });
    setProfileBusy(false);
    if (!ok) {
      setProfileError(describeAccountSettingsError(status, data.error));
      return;
    }
    const account = data.account as { name?: string; email?: string } | undefined;
    const nextName = account?.name ?? nameInput.trim();
    const nextEmail = account?.email ?? emailInput.trim();
    setCurrent({ name: nextName, email: nextEmail });
    setNameInput(nextName);
    setEmailInput(nextEmail);
    if (emailChanged) setVerified(false);
    setProfileNotice(
      emailChanged ? 'Profile updated. Your new email needs to be verified.' : 'Profile updated.'
    );
    router.refresh();
  }

  async function savePassword() {
    if (!canSavePassword) return;
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNotice(null);
    const { ok, status, data } = await callJson('/api/saas/account/password', 'POST', {
      currentPassword,
      newPassword,
    });
    setPasswordBusy(false);
    if (!ok) {
      setPasswordError(describeAccountSettingsError(status, data.error));
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordNotice('Password changed.');
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Profile
        </h2>
        <div className="mt-3 space-y-3">
          {profileError && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
            >
              {profileError}
            </div>
          )}
          {profileNotice && !profileError && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
            >
              {profileNotice}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-[color:var(--color-text-dim)]">Name</span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={120}
              disabled={profileBusy}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="flex items-center gap-2 text-[color:var(--color-text-dim)]">
              Email
              {verified ? (
                <span className="rounded-full border border-[color:var(--color-accent)]/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-accent)]">
                  verified
                </span>
              ) : (
                <a
                  href="/account/verify"
                  className="rounded-full border border-[color:var(--color-gold)]/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-gold)] hover:underline"
                >
                  unverified · verify
                </a>
              )}
            </span>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              disabled={profileBusy}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            onClick={saveProfile}
            disabled={!canSaveProfile}
            className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
          >
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Password
        </h2>
        <div className="mt-3 space-y-3">
          {passwordError && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
            >
              {passwordError}
            </div>
          )}
          {passwordNotice && !passwordError && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
            >
              {passwordNotice}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-[color:var(--color-text-dim)]">Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={passwordBusy}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[color:var(--color-text-dim)]">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={passwordBusy}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[color:var(--color-text-dim)]">Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={passwordBusy}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            onClick={savePassword}
            disabled={!canSavePassword}
            className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
          >
            {passwordBusy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Your data
        </h2>
        <div className="mt-3 space-y-2">
          <p className="text-sm text-[color:var(--color-text-dim)]">
            Download a JSON copy of your account profile and workspace memberships.
          </p>
          <a
            href="/api/saas/account/export"
            className="inline-block rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)]"
          >
            Download my data
          </a>
        </div>
      </section>
    </div>
  );
}
