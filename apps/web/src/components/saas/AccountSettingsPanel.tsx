'use client';

// Client interactivity for the user-facing account "Settings" page ((saas)/account/settings).
// Consumes control-plane routes that had zero UI until now:
//   PATCH  /api/saas/account            — update display name / email (own account)
//   POST   /api/saas/account/password   — change password (re-verifies the current one)
//   GET    /api/saas/account/export     — download a JSON copy of the account's own data
//   GET/POST/DELETE /api/saas/account/mfa + POST .../mfa/confirm — TOTP enrollment (increment
//     82, following 80a's routes + 81's re-auth fix). NOT wired into login yet (80c) — enabling
//     this here does not yet change what a sign-in requires.
// The page server-renders the initial profile/MFA status; the mutations here router.refresh()
// afterwards so the server re-reads the source of truth, same idiom as
// WorkspaceSettingsPanel/MembersPanel. The export is a plain authenticated `<a>` link — the
// browser sends the session cookie itself, no client JS needed to trigger the download.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  profileSaveReady,
  passwordSaveReady,
  describeAccountSettingsError,
} from './accountSettings';
import { mfaCodeReady, mfaPasswordReady, describeMfaError } from './mfaSettings';
import { QrCode } from '@/components/QrCode';

type Props = {
  email: string;
  name: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaCryptoReady: boolean;
};

/** Which sub-form the "Two-factor authentication" section is currently showing. */
type MfaStage =
  | 'idle'
  | 'need-password-to-start' // restart enrollment while already enabled (mfaEnrollRequiresReauth)
  | 'enrolling' // secret/uri shown, waiting for the first code
  | 'need-password-to-disable'
  | 'recovery-codes'; // one-time display right after a successful confirm

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

export function AccountSettingsPanel({ email, name, emailVerified, mfaEnabled, mfaCryptoReady }: Props) {
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

  const [mfaOn, setMfaOn] = useState(mfaEnabled);
  const [mfaStage, setMfaStage] = useState<MfaStage>('idle');
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaUri, setMfaUri] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaReauthPassword, setMfaReauthPassword] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);

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

  function resetMfaFlow() {
    setMfaStage('idle');
    setMfaSecret(null);
    setMfaUri(null);
    setMfaCode('');
    setMfaReauthPassword('');
    setMfaDisablePassword('');
    setMfaError(null);
  }

  /** Click "Enable" (never enrolled) or "Replace authenticator app" (already enabled). The
   * server requires a password re-check only in the latter case (mfaEnrollRequiresReauth) —
   * mirrored here so a first-time enrollment skips straight to the QR/secret step. */
  function clickStartEnrollment() {
    setMfaError(null);
    setMfaNotice(null);
    if (mfaOn) {
      setMfaStage('need-password-to-start');
    } else {
      void beginEnrollment();
    }
  }

  async function beginEnrollment(password?: string) {
    setMfaBusy(true);
    setMfaError(null);
    const { ok, status, data } = await callJson('/api/saas/account/mfa', 'POST', password ? { password } : {});
    setMfaBusy(false);
    if (!ok) {
      setMfaError(describeMfaError(status, data.error));
      return;
    }
    setMfaSecret((data.secret as string) ?? null);
    setMfaUri((data.uri as string) ?? null);
    setMfaReauthPassword('');
    setMfaCode('');
    setMfaStage('enrolling');
  }

  async function confirmEnrollment() {
    if (!mfaCodeReady(mfaCode)) return;
    setMfaBusy(true);
    setMfaError(null);
    const { ok, status, data } = await callJson('/api/saas/account/mfa/confirm', 'POST', {
      code: mfaCode.trim(),
    });
    setMfaBusy(false);
    if (!ok) {
      setMfaError(describeMfaError(status, data.error));
      return;
    }
    setMfaOn(true);
    setMfaRecoveryCodes((data.recoveryCodes as string[]) ?? []);
    setMfaSecret(null);
    setMfaUri(null);
    setMfaCode('');
    setMfaStage('recovery-codes');
    router.refresh();
  }

  function finishRecoveryCodes() {
    setMfaRecoveryCodes(null);
    setMfaNotice('Two-factor authentication is enabled.');
    resetMfaFlow();
  }

  async function confirmDisable() {
    if (!mfaPasswordReady(mfaDisablePassword)) return;
    setMfaBusy(true);
    setMfaError(null);
    const { ok, status, data } = await callJson('/api/saas/account/mfa', 'DELETE', {
      password: mfaDisablePassword,
    });
    setMfaBusy(false);
    if (!ok) {
      setMfaError(describeMfaError(status, data.error));
      return;
    }
    setMfaOn(false);
    setMfaNotice('Two-factor authentication is disabled.');
    resetMfaFlow();
    router.refresh();
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
        <h2 className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Two-factor authentication
          {mfaOn && (
            <span className="rounded-full border border-[color:var(--color-accent)]/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-accent)]">
              enabled
            </span>
          )}
        </h2>
        <div className="mt-3 space-y-3">
          {mfaError && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
            >
              {mfaError}
            </div>
          )}
          {mfaNotice && !mfaError && mfaStage === 'idle' && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
            >
              {mfaNotice}
            </div>
          )}

          {!mfaCryptoReady && (
            <p className="text-sm text-[color:var(--color-text-dim)]">
              Two-factor authentication is not available on this server yet.
            </p>
          )}

          {mfaCryptoReady && mfaStage === 'idle' && (
            <>
              <p className="text-sm text-[color:var(--color-text-dim)]">
                {mfaOn
                  ? 'An authenticator app is required at sign-in in addition to your password.'
                  : 'Require a code from an authenticator app (Google Authenticator, 1Password, …) in addition to your password.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clickStartEnrollment}
                  disabled={mfaBusy}
                  className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
                >
                  {mfaOn ? 'Replace authenticator app' : 'Enable two-factor authentication'}
                </button>
                {mfaOn && (
                  <button
                    type="button"
                    onClick={() => {
                      setMfaError(null);
                      setMfaStage('need-password-to-disable');
                    }}
                    disabled={mfaBusy}
                    className="rounded-lg border border-[color:var(--color-red)]/50 px-4 py-2 text-sm font-medium text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 disabled:opacity-40"
                  >
                    Disable
                  </button>
                )}
              </div>
            </>
          )}

          {mfaStage === 'need-password-to-start' && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--color-text-dim)]">
                Enter your password to replace your current authenticator app.
              </p>
              <input
                type="password"
                value={mfaReauthPassword}
                onChange={(e) => setMfaReauthPassword(e.target.value)}
                autoComplete="current-password"
                disabled={mfaBusy}
                className="w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => beginEnrollment(mfaReauthPassword)}
                  disabled={mfaBusy || !mfaPasswordReady(mfaReauthPassword)}
                  className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
                >
                  {mfaBusy ? 'Continuing…' : 'Continue'}
                </button>
                <button
                  type="button"
                  onClick={resetMfaFlow}
                  disabled={mfaBusy}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mfaStage === 'enrolling' && mfaSecret && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--color-text-dim)]">
                Scan this with your authenticator app, then enter the 6-digit code it shows.
              </p>
              {mfaUri && <QrCode value={mfaUri} label="Scan to add this account to your authenticator app" />}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
                  Can&rsquo;t scan? Enter this key by hand
                </p>
                <p className="mt-1 select-all break-all font-mono text-sm text-[color:var(--color-text)]">
                  {mfaSecret}
                </p>
              </div>
              <label className="block text-sm">
                <span className="text-[color:var(--color-text-dim)]">6-digit code</span>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  disabled={mfaBusy}
                  className="mt-1 w-full max-w-[10rem] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-[color:var(--color-text)] disabled:opacity-60"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmEnrollment}
                  disabled={mfaBusy || !mfaCodeReady(mfaCode)}
                  className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
                >
                  {mfaBusy ? 'Verifying…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={resetMfaFlow}
                  disabled={mfaBusy}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mfaStage === 'need-password-to-disable' && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--color-text-dim)]">
                Enter your password to disable two-factor authentication.
              </p>
              <input
                type="password"
                value={mfaDisablePassword}
                onChange={(e) => setMfaDisablePassword(e.target.value)}
                autoComplete="current-password"
                disabled={mfaBusy}
                className="w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmDisable}
                  disabled={mfaBusy || !mfaPasswordReady(mfaDisablePassword)}
                  className="rounded-lg border border-[color:var(--color-red)]/50 px-4 py-2 text-sm font-medium text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 disabled:opacity-40"
                >
                  {mfaBusy ? 'Disabling…' : 'Disable two-factor authentication'}
                </button>
                <button
                  type="button"
                  onClick={resetMfaFlow}
                  disabled={mfaBusy}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mfaStage === 'recovery-codes' && mfaRecoveryCodes && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[color:var(--color-gold)]/45 bg-[color:var(--color-gold)]/10 px-3 py-2 text-sm text-[color:var(--color-gold)]">
                Save these recovery codes now — each works once, and they will not be shown
                again. Use one if you ever lose access to your authenticator app.
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 font-mono text-sm text-[color:var(--color-text)]">
                {mfaRecoveryCodes.map((c) => (
                  <span key={c} className="select-all">
                    {c}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={finishRecoveryCodes}
                className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10"
              >
                I&rsquo;ve saved these codes
              </button>
            </div>
          )}
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
