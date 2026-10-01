'use client';
import { useState, useTransition, useEffect } from 'react';
import {
  UserRound,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Bell,
  BellRing,
  Check,
  X,
  Loader2,
  LogOut,
  Mail,
  Sun,
  Moon,
  DollarSign,
  ShoppingBag,
  Package,
  HardDrive,
  Copy,
  CheckCheck,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { controlClass } from '@/components/ui/Input';
import { useT, useLocale } from '@/components/LocaleProvider';
import { useTheme } from '@/components/ThemeProvider';
import { LOCALES } from '@/lib/i18n/config';
import { setLocale } from '@/app/i18nActions';
import { QrCode } from '@/components/QrCode';
import { ALERT_TYPES, type AlertType, type NotifyTypes } from '@/lib/alertTypes';
import { WebPushToggle } from '@/app/settings/WebPushToggle';
import type { TKey } from '@/lib/i18n';
import type { MfaStatus } from '@/lib/userMfaStore';
import { mfaCodeReady, mfaPasswordReady, describeMfaError } from '@/lib/mfaSettings';
import {
  updateProfile,
  updateAlertSubscriptions,
  type AccountData,
} from './actions';
import {
  changeOwnPassword,
  logoutOtherSessions,
  getSelfMfaStatus,
  beginSelfMfaEnrollment,
  confirmSelfMfaEnrollment,
  disableSelfMfa,
} from '@/app/settings/users.actions';

const saveBtn =
  'inline-flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer';
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50 text-[color:var(--color-text)] cursor-pointer';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer',
        checked ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-4'
        )}
      />
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-[color:var(--color-text)]">
            {icon && <span className="text-[color:var(--color-accent)]">{icon}</span>}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[color:var(--color-text-dim)]">{subtitle}</p>}
        </div>
        {headerAction}
      </div>
      {children}
    </div>
  );
}

export function AccountManager({
  initialData,
  embedded: _embedded = false,
}: {
  initialData: AccountData;
  embedded?: boolean;
}) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications'>('profile');
  const [account, setAccount] = useState<AccountData>(initialData);

  return (
    <div className="space-y-6">
      {/* Hero Profile Header */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 md:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] flex items-center justify-center text-lg font-bold text-[color:var(--color-accent)] shrink-0 shadow-inner">
              {(account.user.name || account.user.username || 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-[color:var(--color-text)] tracking-tight">
                  {account.user.name || account.user.username}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold uppercase tracking-wider bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] border border-[color:var(--color-accent)]/30">
                  {account.user.role}
                </span>
              </div>
              <p className="text-xs text-[color:var(--color-text-dim)] flex items-center gap-2">
                <span className="font-mono">@{account.user.username}</span>
                {account.user.email && (
                  <>
                    <span>•</span>
                    <span className="truncate">{account.user.email}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Sub-navigation tabs */}
          <div className="flex items-center gap-1 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] p-1 rounded-xl self-start sm:self-center">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer',
                activeTab === 'profile'
                  ? 'bg-[color:var(--color-surface)] text-[color:var(--color-accent)] shadow-sm font-semibold'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              <UserRound size={14} />
              {t('account.tabProfile')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer',
                activeTab === 'notifications'
                  ? 'bg-[color:var(--color-surface)] text-[color:var(--color-accent)] shadow-sm font-semibold'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Bell size={14} />
              {t('account.tabNotifications')}
              {account.hasCustomSubscriptions && (
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-accent)]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'profile' ? (
        <div className="space-y-5">
          <ProfileDetailsSection account={account} onUpdate={(updated) => setAccount(updated)} />
          <PasswordSection />
          <MfaSection />
          <UiPreferencesSection />
        </div>
      ) : (
        <div className="space-y-5">
          <NotificationChannelsSection account={account} />
          <AlertTopicsSection account={account} onUpdate={(updated) => setAccount(updated)} />
        </div>
      )}
    </div>
  );
}

// ─── 1. Profile Details Section ────────────────────────────────────────────────

function ProfileDetailsSection({
  account,
  onUpdate,
}: {
  account: AccountData;
  onUpdate: (data: AccountData) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.user.name);
  const [email, setEmail] = useState(account.user.email);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateProfile({ name, email });
      if (r.ok) {
        setMsg({ ok: true, text: t('common.savedOk') });
        setEditing(false);
        onUpdate({
          ...account,
          user: { ...account.user, name: name.trim(), email: email.trim().toLowerCase() },
        });
      } else {
        setMsg({ ok: false, text: r.error || t('common.failed') });
      }
    });
  }

  return (
    <SectionCard
      title={t('account.details')}
      subtitle={t('account.detailsDesc')}
      icon={<UserRound size={16} />}
      headerAction={
        !editing && (
          <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>
            {t('common.edit')}
          </button>
        )
      }
    >
      {editing ? (
        <div className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[color:var(--color-text-dim)] font-medium">
                {t('account.displayName')}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(controlClass, 'mt-1')}
                placeholder={t('account.displayNamePlaceholder')}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[color:var(--color-text-dim)] font-medium">
                {t('account.email')}
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={cn(controlClass, 'mt-1')}
                placeholder={t('account.emailPlaceholder')}
              />
            </label>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button type="button" onClick={save} disabled={pending} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(account.user.name);
                setEmail(account.user.email);
                setMsg(null);
              }}
              className={ghostBtn}
            >
              <X size={13} /> {t('common.cancel')}
            </button>
            {msg && (
              <span
                className={cn(
                  'text-xs font-mono',
                  msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'
                )}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 pt-1">
          <div className="rounded-lg bg-[color:var(--color-surface-2)]/60 border border-[color:var(--color-border)] p-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)] block uppercase tracking-wider font-mono">
              {t('account.displayName')}
            </span>
            <span className="text-sm font-medium text-[color:var(--color-text)] mt-0.5 block truncate">
              {account.user.name || <span className="text-[color:var(--color-text-faint)] italic">—</span>}
            </span>
          </div>
          <div className="rounded-lg bg-[color:var(--color-surface-2)]/60 border border-[color:var(--color-border)] p-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)] block uppercase tracking-wider font-mono">
              {t('account.username')}
            </span>
            <span className="text-sm font-medium text-[color:var(--color-text)] mt-0.5 block font-mono truncate">
              {account.user.username}
            </span>
          </div>
          <div className="rounded-lg bg-[color:var(--color-surface-2)]/60 border border-[color:var(--color-border)] p-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)] block uppercase tracking-wider font-mono">
              {t('account.email')}
            </span>
            <span className="text-sm font-medium text-[color:var(--color-text)] mt-0.5 block truncate">
              {account.user.email || <span className="text-[color:var(--color-text-faint)] italic">—</span>}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── 2. Password & Sessions Section ──────────────────────────────────────────

function PasswordSection() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await changeOwnPassword(oldPwd, newPwd);
      if (r.ok) {
        setMsg({ ok: true, text: t('set.passwordChanged') });
        setOldPwd('');
        setNewPwd('');
        setOpen(false);
      } else {
        setMsg({ ok: false, text: r.error || t('common.failed') });
      }
    });
  }

  function signOutOthers() {
    setMsg(null);
    startTransition(async () => {
      const r = await logoutOtherSessions();
      setMsg(r.ok ? { ok: true, text: t('set.signedOutOthers') } : { ok: false, text: t('common.failed') });
    });
  }

  return (
    <SectionCard
      title={t('set.yourPassword')}
      subtitle={t('set.changePasswordDesc')}
      icon={<KeyRound size={16} />}
      headerAction={
        !open && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={signOutOthers}
              disabled={pending}
              className={ghostBtn}
              title={t('set.signOutOthersDesc')}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              {t('set.signOutOthers')}
            </button>
            <button type="button" onClick={() => setOpen(true)} className={ghostBtn}>
              <KeyRound size={13} /> {t('set.changePassword')}
            </button>
          </div>
        )
      }
    >
      {open && (
        <div className="space-y-3 pt-1 max-w-md">
          <input
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            type="password"
            placeholder={t('set.currentPwdPlaceholder')}
            className={controlClass}
          />
          <input
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            type="password"
            placeholder={t('set.newPwdPlaceholder')}
            className={controlClass}
          />
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={submit} disabled={pending} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('set.update')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMsg(null);
                setOldPwd('');
                setNewPwd('');
              }}
              className={ghostBtn}
            >
              <X size={13} /> {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p
          className={cn(
            'text-xs font-mono mt-2',
            msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'
          )}
        >
          {msg.text}
        </p>
      )}
    </SectionCard>
  );
}

// ─── 3. MFA Section ──────────────────────────────────────────────────────────

type MfaStage = 'idle' | 'need-password-to-start' | 'enrolling' | 'need-password-to-disable' | 'recovery-codes';

function MfaSection() {
  const t = useT();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [stage, setStage] = useState<MfaStage>('idle');
  const [reauthPassword, setReauthPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getSelfMfaStatus().then(setStatus).catch(() => {});
  }, []);

  function resetFlow() {
    setStage('idle');
    setReauthPassword('');
    setDisablePassword('');
    setCode('');
    setSecret('');
    setUri('');
    setError('');
  }

  function startEnrollment() {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await beginSelfMfaEnrollment(reauthPassword);
      if (!res.ok) {
        setError(describeMfaError(400, res.error));
        return;
      }
      setSecret(res.secret || '');
      setUri(res.uri || '');
      setStage('enrolling');
    });
  }

  function verifyEnrollment() {
    setError('');
    startTransition(async () => {
      const res = await confirmSelfMfaEnrollment(code);
      if (!res.ok) {
        setError(describeMfaError(400, res.error));
        return;
      }
      setRecoveryCodes(res.recoveryCodes ?? []);
      setStage('recovery-codes');
      setStatus((prev) => (prev ? { ...prev, enabled: true, pending: false } : null));
    });
  }

  function handleDisable() {
    setError('');
    startTransition(async () => {
      const res = await disableSelfMfa(disablePassword);
      if (!res.ok) {
        setError(describeMfaError(400, res.error));
        return;
      }
      setStatus((prev) => (prev ? { ...prev, enabled: false, pending: false } : null));
      setNotice(t('set.twoFactorDisabledNotice'));
      resetFlow();
    });
  }

  function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  return (
    <SectionCard
      title={t('set.twoFactor')}
      subtitle={status?.enabled ? t('set.twoFactorDescOn') : t('set.twoFactorDescOff')}
      icon={status?.enabled ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
      headerAction={
        status && (
          <span
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold uppercase tracking-wider',
              status.enabled
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)] border border-[color:var(--color-border)]'
            )}
          >
            {status.enabled ? t('set.twoFactorEnabled') : t('common.none')}
          </span>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {status?.enabled ? (
          <div className="space-y-3">
            <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorDescOn')}</p>
            {stage === 'need-password-to-disable' ? (
              <div className="space-y-2.5 max-w-sm pt-2">
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder={t('set.twoFactorPasswordToDisable')}
                  className={controlClass}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDisable}
                    disabled={pending || !mfaPasswordReady(disablePassword)}
                    className={saveBtn}
                  >
                    {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {t('set.twoFactorDisable')}
                  </button>
                  <button type="button" onClick={resetFlow} className={ghostBtn}>
                    <X size={13} /> {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStage('need-password-to-disable')}
                  className={ghostBtn}
                >
                  <ShieldAlert size={13} /> {t('set.twoFactorDisable')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorDescOff')}</p>
            {stage === 'idle' && (
              <button
                type="button"
                onClick={startEnrollment}
                disabled={pending || !status?.cryptoReady}
                className={saveBtn}
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {t('set.twoFactorEnable')}
              </button>
            )}

            {stage === 'enrolling' && (
              <div className="space-y-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
                <p className="text-xs text-[color:var(--color-text-dim)] font-medium">
                  {t('set.twoFactorEnrollHint')}
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {uri && <QrCode value={uri} size={140} />}
                  <div className="space-y-2 min-w-0 flex-1">
                    <span className="text-[11px] text-[color:var(--color-text-faint)] font-mono uppercase">
                      {t('set.twoFactorManualKey')}
                    </span>
                    <p className="font-mono text-xs bg-[color:var(--color-surface)] p-2 rounded-lg border border-[color:var(--color-border)] select-all break-all">
                      {secret}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-w-xs pt-2">
                  <span className="text-xs text-[color:var(--color-text-dim)] font-medium">
                    {t('set.twoFactorCode')}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className={cn(controlClass, 'font-mono text-center tracking-widest text-base')}
                    />
                    <button
                      type="button"
                      onClick={verifyEnrollment}
                      disabled={pending || !mfaCodeReady(code)}
                      className={saveBtn}
                    >
                      {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {t('set.twoFactorConfirm')}
                    </button>
                    <button type="button" onClick={resetFlow} className={ghostBtn}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stage === 'recovery-codes' && recoveryCodes && (
              <div className="space-y-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[color:var(--color-text)]">
                    {t('set.twoFactorRecoveryWarning')}
                  </h3>
                  <button type="button" onClick={copyRecoveryCodes} className={ghostBtn}>
                    {copiedCodes ? <CheckCheck size={13} /> : <Copy size={13} />}
                    {copiedCodes ? t('cal.copied') : 'Copy'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs bg-[color:var(--color-surface)] p-3 rounded-lg border border-[color:var(--color-border)]">
                  {recoveryCodes.map((rc, idx) => (
                    <span key={idx} className="select-all text-[color:var(--color-text)]">
                      {rc}
                    </span>
                  ))}
                </div>
                <button type="button" onClick={resetFlow} className={saveBtn}>
                  {t('set.twoFactorRecoverySaved')}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs font-mono text-[color:var(--color-red)]">{error}</p>}
        {notice && <p className="text-xs font-mono text-[color:var(--color-accent)]">{notice}</p>}
      </div>
    </SectionCard>
  );
}

// ─── 4. UI Preferences Section ───────────────────────────────────────────────

function UiPreferencesSection() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [langPending, startLangTransition] = useTransition();

  function selectLanguage(code: string) {
    if (code === locale) return;
    startLangTransition(async () => {
      await setLocale(code);
      window.location.reload();
    });
  }

  return (
    <SectionCard
      title={t('account.preferences')}
      subtitle={t('account.preferencesDesc')}
      icon={<Sun size={16} />}
    >
      <div className="grid gap-5 sm:grid-cols-2 pt-1">
        {/* Theme Picker */}
        <div className="space-y-2">
          <span className="text-xs text-[color:var(--color-text-dim)] font-medium block">
            {t('set.theme')}
          </span>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer',
                theme === 'light'
                  ? 'bg-[color:var(--color-surface)] text-[color:var(--color-accent)] shadow-sm font-semibold'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Sun size={14} /> {t('set.light')}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer',
                theme === 'dark'
                  ? 'bg-[color:var(--color-surface)] text-[color:var(--color-accent)] shadow-sm font-semibold'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Moon size={14} /> {t('set.dark')}
            </button>
          </div>
        </div>

        {/* Language Picker */}
        <div className="space-y-2">
          <span className="text-xs text-[color:var(--color-text-dim)] font-medium block">
            {t('lang.language')}
          </span>
          <div className="relative">
            <select
              value={locale}
              disabled={langPending}
              onChange={(e) => selectLanguage(e.target.value)}
              className={cn(controlClass, 'cursor-pointer pr-8')}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── 5. Notification Channels Section ────────────────────────────────────────

function NotificationChannelsSection({
  account,
}: {
  account: AccountData;
}) {
  const t = useT();

  return (
    <SectionCard
      title={t('account.channels')}
      subtitle={t('account.channelsDesc')}
      icon={<Mail size={16} />}
    >
      <div className="space-y-4 pt-1">
        {/* Personal Email Channel */}
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-[color:var(--color-accent)]" />
              <h3 className="text-xs font-semibold text-[color:var(--color-text)]">
                {t('account.email')}
              </h3>
              <span
                className={cn(
                  'text-[10px] px-2 py-0.2 rounded-full font-mono uppercase',
                  account.user.email
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                    : 'bg-[color:var(--color-surface)] text-[color:var(--color-text-faint)] border border-[color:var(--color-border)]'
                )}
              >
                {account.user.email ? account.user.email : t('common.none')}
              </span>
            </div>
            <p className="text-xs text-[color:var(--color-text-dim)]">
              {t('account.emailDesc')}
            </p>
          </div>
        </div>

        {/* Native Web Push Channel */}
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BellRing size={15} className="text-[color:var(--color-accent)]" />
            <h3 className="text-xs font-semibold text-[color:var(--color-text)]">
              {t('account.webPush')}
            </h3>
          </div>
          <WebPushToggle />
        </div>
      </div>
    </SectionCard>
  );
}

// ─── 6. Alert Topics Section ─────────────────────────────────────────────────

const CATEGORY_GROUPS: {
  id: string;
  titleKey: TKey;
  icon: React.ReactNode;
  keys: AlertType[];
}[] = [
  {
    id: 'financial',
    titleKey: 'account.catFinancial' as TKey,
    icon: <DollarSign size={15} />,
    keys: ['bills', 'installments', 'budgets', 'priceHikes', 'subscriptionReviews', 'trials'],
  },
  {
    id: 'shopping',
    titleKey: 'account.catShopping' as TKey,
    icon: <ShoppingBag size={15} />,
    keys: ['deals', 'returns'],
  },
  {
    id: 'assets',
    titleKey: 'account.catAssets' as TKey,
    icon: <Package size={15} />,
    keys: ['warranty', 'warrantyClaims', 'documents', 'vehicles', 'maintenance', 'lending', 'specialDates'],
  },
  {
    id: 'system',
    titleKey: 'account.catSystem' as TKey,
    icon: <HardDrive size={15} />,
    keys: ['syncStale'],
  },
];

function AlertTopicsSection({
  account,
  onUpdate,
}: {
  account: AccountData;
  onUpdate: (data: AccountData) => void;
}) {
  const t = useT();
  const [types, setTypes] = useState<NotifyTypes>({ ...account.personalNotifyTypes });
  const [isCustom, setIsCustom] = useState(account.hasCustomSubscriptions);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleType(key: AlertType) {
    setIsCustom(true);
    setTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAll(val: boolean) {
    setIsCustom(true);
    const updated = { ...types };
    for (const at of ALERT_TYPES) {
      updated[at.key] = val;
    }
    setTypes(updated);
  }

  function resetToDefaults() {
    setIsCustom(false);
    setTypes({ ...account.workspaceNotifyTypes });
    save(null);
  }

  function save(customTypes: NotifyTypes | null = types) {
    setMsg(null);
    startTransition(async () => {
      const r = await updateAlertSubscriptions(customTypes ? customTypes : null);
      if (r.ok) {
        setMsg({ ok: true, text: t('common.savedOk') });
        onUpdate({
          ...account,
          personalNotifyTypes: customTypes ? { ...customTypes } : { ...account.workspaceNotifyTypes },
          hasCustomSubscriptions: customTypes !== null,
        });
      } else {
        setMsg({ ok: false, text: r.error || t('common.failed') });
      }
    });
  }

  return (
    <SectionCard
      title={t('account.alertSubscriptions')}
      subtitle={t('account.alertSubscriptionsDesc')}
      icon={<Bell size={16} />}
      headerAction={
        <div className="flex items-center gap-2 flex-wrap">
          {isCustom && (
            <button
              type="button"
              onClick={resetToDefaults}
              disabled={pending}
              className={ghostBtn}
              title={t('account.resetToDefaults')}
            >
              <RotateCcw size={13} /> {t('account.resetToDefaults')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAll(true)}
            className={ghostBtn}
          >
            {t('account.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className={ghostBtn}
          >
            {t('account.deselectAll')}
          </button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {/* Status banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[color:var(--color-surface-2)]/60 border border-[color:var(--color-border)] text-xs">
          <span className="text-[color:var(--color-text-dim)]">
            {isCustom ? t('account.customActive') : t('account.inheritWorkspace')}
          </span>
          <span
            className={cn(
              'px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase',
              isCustom
                ? 'bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] border border-[color:var(--color-accent)]/30'
                : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)] border border-[color:var(--color-border)]'
            )}
          >
            {isCustom ? 'Custom' : 'Workspace'}
          </span>
        </div>

        {/* Categorized groups */}
        <div className="space-y-4">
          {CATEGORY_GROUPS.map((group) => {
            const groupAlerts = ALERT_TYPES.filter((at) => group.keys.includes(at.key));
            return (
              <div
                key={group.id}
                className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/30 p-4 space-y-3"
              >
                <div className="flex items-center gap-2 border-b border-[color:var(--color-border)] pb-2">
                  <span className="text-[color:var(--color-accent)]">{group.icon}</span>
                  <h3 className="text-xs font-semibold text-[color:var(--color-text)]">
                    {t(group.titleKey)}
                  </h3>
                  <span className="text-[10px] text-[color:var(--color-text-faint)] font-mono ml-auto">
                    {groupAlerts.filter((a) => types[a.key]).length}/{groupAlerts.length}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {groupAlerts.map((at) => {
                    const isOverridden = isCustom && types[at.key] !== account.workspaceNotifyTypes[at.key];
                    return (
                      <div
                        key={at.key}
                        className={cn(
                          'flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors',
                          types[at.key]
                            ? 'bg-[color:var(--color-surface)] border-[color:var(--color-border)]'
                            : 'bg-[color:var(--color-surface-2)]/50 border-transparent opacity-75'
                        )}
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <span className="text-xs font-medium text-[color:var(--color-text)] block truncate">
                            {t(`alert.${at.key}` as TKey)}
                          </span>
                          {isOverridden && (
                            <span className="text-[9px] font-mono text-[color:var(--color-accent)] uppercase tracking-wider block">
                              override
                            </span>
                          )}
                        </div>
                        <Switch
                          checked={!!types[at.key]}
                          onChange={() => toggleType(at.key)}
                          label={t(`alert.${at.key}` as TKey)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[color:var(--color-border)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => save(types)}
              disabled={pending}
              className={saveBtn}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t('common.save')}
            </button>
            {msg && (
              <span
                className={cn(
                  'text-xs font-mono',
                  msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'
                )}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
