'use client';
import { useState, useTransition, useEffect } from 'react';
import { UserRound, KeyRound, ShieldCheck, Bell, Check, X, Loader2, LogOut, Mail, Pencil } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { controlClass } from '@/components/ui/Input';
import { useT } from '@/components/LocaleProvider';
import { QrCode } from '@/components/QrCode';
import { mfaCodeReady, mfaPasswordReady, describeMfaError } from '@/lib/mfaSettings';
import { ALERT_TYPES } from '@/lib/alertTypes';
import type { TKey } from '@/lib/i18n';
import type { MfaStatus } from '@/lib/userMfaStore';
import {
  updateProfile,
  updateAlertSubscriptions,
  type ProfileData,
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
  'flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const ghostBtn =
  'flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50';

export function ProfileClient({ profile }: { profile: ProfileData }) {
  const t = useT();
  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('profile.title')} />
      <div className="max-w-2xl space-y-4">
        <ProfileDetailsSection profile={profile} />
        <PasswordSection />
        <MfaSection />
        <AlertPreferencesSection profile={profile} />
      </div>
    </main>
  );
}

// ─── Profile Details ───────────────────────────────────────────────────────────

function ProfileDetailsSection({ profile }: { profile: ProfileData }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateProfile({ name, email });
      if (r.ok) {
        setMsg({ ok: true, text: t('common.savedOk') });
        setEditing(false);
      } else {
        setMsg({ ok: false, text: r.error || t('common.failed') });
      }
    });
  }

  return (
    <Section title={t('profile.details')} icon={<UserRound size={15} />}>
      {editing ? (
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-xs text-[color:var(--color-text-dim)]">{t('profile.displayName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={cn(controlClass, 'mt-1')} placeholder={t('profile.displayName')} />
          </label>
          <label className="block">
            <span className="text-xs text-[color:var(--color-text-dim)]">{t('profile.email')}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={cn(controlClass, 'mt-1')} placeholder={t('profile.emailPlaceholder')} />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={pending} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
            </button>
            <button onClick={() => { setEditing(false); setName(profile.name); setEmail(profile.email); setMsg(null); }} className={ghostBtn}>
              <X size={13} /> {t('common.cancel')}
            </button>
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{profile.name || profile.username}</div>
              <div className="text-xs text-[color:var(--color-text-dim)]">
                @{profile.username}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{profile.role}</span>
              </div>
            </div>
            <button onClick={() => setEditing(true)} className={ghostBtn}>
              <Pencil size={13} /> {t('profile.edit')}
            </button>
          </div>
          {profile.email && (
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-dim)]">
              <Mail size={13} /> {profile.email}
            </div>
          )}
          {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
        </div>
      )}
    </Section>
  );
}

// ─── Password ──────────────────────────────────────────────────────────────────

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
      if (r.ok) { setMsg({ ok: true, text: t('set.passwordChanged') }); setOldPwd(''); setNewPwd(''); setOpen(false); }
      else setMsg({ ok: false, text: r.error || t('common.failed') });
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
    <Section title={t('set.yourPassword')} icon={<KeyRound size={15} />}>
      {open ? (
        <div className="space-y-2.5">
          <input value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} type="password" placeholder={t('set.currentPwdPlaceholder')} className={controlClass} />
          <input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} type="password" placeholder={t('set.newPwdPlaceholder')} className={controlClass} />
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.update')}</button>
            <button onClick={() => { setOpen(false); setMsg(null); }} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--color-text-dim)]">{t('set.changePasswordDesc')}</span>
          <div className="flex items-center gap-2">
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
            <button onClick={signOutOthers} disabled={pending} className={ghostBtn} title={t('set.signOutOthersDesc')}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} {t('set.signOutOthers')}
            </button>
            <button onClick={() => setOpen(true)} className={ghostBtn}><KeyRound size={13} /> {t('set.changePassword')}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── MFA ───────────────────────────────────────────────────────────────────────

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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getSelfMfaStatus().then(setStatus).catch(() => {});
  }, []);

  function resetFlow() {
    setStage('idle'); setReauthPassword(''); setDisablePassword(''); setCode(''); setSecret(''); setUri(''); setError('');
  }

  function clickStart() {
    setError(''); setNotice('');
    if (status?.enabled) setStage('need-password-to-start');
    else beginEnrollment('');
  }

  function beginEnrollment(password: string) {
    setError('');
    startTransition(async () => {
      const res = await beginSelfMfaEnrollment(password);
      if (res.ok && res.secret && res.uri) { setSecret(res.secret); setUri(res.uri); setStage('enrolling'); }
      else setError(describeMfaError(400, res.error));
    });
  }

  function confirmEnrollment() {
    setError('');
    startTransition(async () => {
      const res = await confirmSelfMfaEnrollment(code);
      if (res.ok && res.recoveryCodes) { setRecoveryCodes(res.recoveryCodes); setStage('recovery-codes'); setStatus((s) => (s ? { ...s, enabled: true, pending: false } : s)); }
      else setError(describeMfaError(400, res.error));
    });
  }

  function finishRecoveryCodes() { setRecoveryCodes(null); resetFlow(); setNotice(t('set.twoFactorEnabledNotice')); }

  function confirmDisable() {
    setError('');
    startTransition(async () => {
      const res = await disableSelfMfa(disablePassword);
      if (res.ok) { resetFlow(); setStatus((s) => (s ? { ...s, enabled: false, pending: false } : s)); setNotice(t('set.twoFactorDisabledNotice')); }
      else setError(res.error || t('common.failed'));
    });
  }

  return (
    <Section title={t('set.twoFactor')} icon={<ShieldCheck size={15} />}>
      {status?.enabled && stage === 'idle' && (
        <span className="inline-block mb-1 text-[10px] uppercase tracking-wider text-[color:var(--color-accent)] border border-[color:var(--color-accent)]/40 rounded-full px-1.5 py-0.5">
          {t('set.twoFactorEnabled')}
        </span>
      )}

      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
      {notice && !error && stage === 'idle' && <p className="text-xs text-[color:var(--color-accent)]">{notice}</p>}
      {status && !status.cryptoReady && <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorUnavailable')}</p>}

      {status?.cryptoReady && stage === 'idle' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--color-text-dim)]">{status.enabled ? t('set.twoFactorDescOn') : t('set.twoFactorDescOff')}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={clickStart} disabled={pending} className={ghostBtn}>
              <ShieldCheck size={13} /> {status.enabled ? t('set.twoFactorReplace') : t('set.twoFactorEnable')}
            </button>
            {status.enabled && (
              <button
                onClick={() => { setError(''); setStage('need-password-to-disable'); }}
                disabled={pending}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-red)]/50 text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 transition-colors disabled:opacity-50"
              >
                {t('set.twoFactorDisable')}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'need-password-to-start' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorPasswordToStart')}</p>
          <input value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} type="password" autoComplete="current-password" placeholder={t('set.currentPwdPlaceholder')} className={controlClass} />
          <div className="flex items-center gap-2">
            <button onClick={() => beginEnrollment(reauthPassword)} disabled={pending || !mfaPasswordReady(reauthPassword)} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {pending ? t('set.twoFactorContinuing') : t('set.twoFactorContinue')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'enrolling' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorEnrollHint')}</p>
          {uri && <QrCode value={uri} label={t('set.twoFactorQrAlt')} />}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.twoFactorManualKey')}</p>
            <p className="mt-1 select-all break-all text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{secret}</p>
          </div>
          <label className="block text-xs">
            <span className="text-[color:var(--color-text-dim)]">{t('set.twoFactorCode')}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={cn(controlClass, 'mt-1 max-w-[10rem] text-center tracking-[0.3em]')}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={confirmEnrollment} disabled={pending || !mfaCodeReady(code)} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {pending ? t('set.twoFactorVerifying') : t('set.twoFactorConfirm')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'need-password-to-disable' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorPasswordToDisable')}</p>
          <input value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} type="password" autoComplete="current-password" placeholder={t('set.currentPwdPlaceholder')} className={controlClass} />
          <div className="flex items-center gap-2">
            <button
              onClick={confirmDisable}
              disabled={pending || !mfaPasswordReady(disablePassword)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-red)]/15 border border-[color:var(--color-red)]/50 text-[color:var(--color-red)] font-semibold hover:bg-[color:var(--color-red)]/25 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} {pending ? t('set.twoFactorDisabling') : t('set.twoFactorDisable')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'recovery-codes' && recoveryCodes && (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-[color:var(--color-gold)]/45 bg-[color:var(--color-gold)]/10 px-3 py-2 text-xs text-[color:var(--color-gold)]">
            {t('set.twoFactorRecoveryWarning')}
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            {recoveryCodes.map((c) => (
              <span key={c} className="select-all">{c}</span>
            ))}
          </div>
          <button onClick={finishRecoveryCodes} className={saveBtn}><Check size={13} /> {t('set.twoFactorRecoverySaved')}</button>
        </div>
      )}
    </Section>
  );
}

// ─── Alert Preferences ─────────────────────────────────────────────────────────

function AlertPreferencesSection({ profile }: { profile: ProfileData }) {
  const t = useT();
  const [subs, setSubs] = useState<Record<string, boolean>>(profile.alertSubscriptions ?? Object.fromEntries(ALERT_TYPES.map((a) => [a.key, true])));
  const [hasOverride, setHasOverride] = useState(profile.alertSubscriptions !== null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: string) {
    setSubs((s) => ({ ...s, [key]: !s[key] }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateAlertSubscriptions(hasOverride ? subs : null);
      setMsg(r.ok ? { ok: true, text: t('common.savedOk') } : { ok: false, text: r.error || t('common.failed') });
    });
  }

  function resetToWorkspace() {
    setHasOverride(false);
    setMsg(null);
    startTransition(async () => {
      const r = await updateAlertSubscriptions(null);
      setMsg(r.ok ? { ok: true, text: t('common.savedOk') } : { ok: false, text: r.error || t('common.failed') });
    });
  }

  return (
    <Section title={t('profile.alerts')} icon={<Bell size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1 mb-2">{t('profile.alertsDesc')}</p>

      {!hasOverride ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--color-text-dim)]">{t('profile.alertsInherit')}</span>
          <button onClick={() => setHasOverride(true)} className={ghostBtn}>
            <Pencil size={13} /> {t('profile.alertsCustomize')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {ALERT_TYPES.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2.5 py-2 hover:bg-[color:var(--color-surface-2)] transition-colors">
                <input
                  type="checkbox"
                  checked={subs[a.key] !== false}
                  onChange={() => toggle(a.key)}
                  className="rounded"
                />
                {t(`alert.${a.key}` as TKey)}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={pending} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
            </button>
            <button onClick={resetToWorkspace} disabled={pending} className={ghostBtn}>
              {t('profile.alertsReset')}
            </button>
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5">
      <h2
        className="flex items-center gap-2 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-4"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {icon}
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
