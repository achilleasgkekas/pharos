'use client';
import { useRef, useState, useTransition } from 'react';
import { Download, Upload, Loader2, ShieldCheck, KeyRound, Database, FileSpreadsheet, FileArchive, Check } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { formatDate } from '@/lib/i18n/format';
import type { TKey } from '@/lib/i18n';
import { exportData, exportDataEncrypted, importData, importDataEncrypted, verifyBackup, exportCSV, exportInsuranceBundle } from './actions';

// Settings → Storage → Data (#382). Three jobs that used to share one row of buttons and one
// status line: a full backup you can restore, spreadsheets you open elsewhere, and a claim
// package for an insurer. Each now has its own card, its own explanation and its own status,
// so a CSV message never looks like it is about the backup, and a failure is marked as one by
// what happened, not by sniffing the message text.

type Busy = 'json' | 'encrypted' | 'restore' | 'verify' | 'csv-receipts' | 'csv-expenses' | 'csv-items' | 'insurance' | null;
type Card = 'backup' | 'csv' | 'claim';
type Status = { card: Card; tone: 'ok' | 'error' | 'busy'; text: string } | null;
type Report = { ok: boolean; headline: string; issues: { level: string; message: string }[] };

const CSV_KINDS = ['items', 'receipts', 'expenses'] as const;
type CsvKind = (typeof CSV_KINDS)[number];
const CSV_LABEL: Record<CsvKind, TKey> = { receipts: 'nav.receipts', expenses: 'nav.expenses', items: 'nav.inventory' };

const today = () => new Date().toISOString().slice(0, 10);

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Structural check for a P54 envelope, inline so this client never imports the node:crypto
 *  backup lib. Mirrors backupCrypto.isEncryptedBackup. */
function looksEncrypted(text: string): boolean {
  try {
    const o = JSON.parse(text);
    return !!o && o.app === 'pharos-enc' && typeof o.data === 'string';
  } catch {
    return false;
  }
}

const btn =
  'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export function BackupData() {
  const money = useMoney();
  const locale = useLocale();
  const t = useT();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<Status>(null);
  const [report, setReport] = useState<Report | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const verifyRef = useRef<HTMLInputElement>(null);
  const working = pending || busy !== null;

  /** Run one action: mark it busy, show its progress line, and report the outcome on its card. */
  function run(card: Card, key: Exclude<Busy, null>, progress: string, job: () => Promise<string>, failure: (error: string) => string) {
    setBusy(key);
    setStatus({ card, tone: 'busy', text: progress });
    startTransition(async () => {
      try {
        setStatus({ card, tone: 'ok', text: await job() });
      } catch (e) {
        setStatus({ card, tone: 'error', text: failure((e as Error).message.slice(0, 120)) });
      } finally {
        setBusy(null);
      }
    });
  }

  function exportJson() {
    setReport(null);
    run('backup', 'json', t('set.preparing'), async () => {
      const json = await exportData();
      downloadBlob(new Blob([json], { type: 'application/json' }), `pharos-backup-${today()}.json`);
      return t('set.backupDownloaded');
    }, (error) => t('set.exportFailed', { error }));
  }

  // P54: passphrase-encrypted export. The passphrase is prompted, used once, never stored.
  async function exportEncrypted() {
    setReport(null);
    const pass = await prompt({ title: t('set.encTitle'), message: t('set.encHelp'), label: t('set.encPassLabel'), type: 'password', minLength: 8 });
    if (pass === null) return;
    const again = await prompt({ title: t('set.encTitle'), label: t('set.encPassAgain'), type: 'password', minLength: 8, confirmLabel: t('set.exportEncrypted') });
    if (again === null) return;
    if (again !== pass) {
      setStatus({ card: 'backup', tone: 'error', text: t('set.encMismatch') });
      return;
    }
    run('backup', 'encrypted', t('set.preparing'), async () => {
      const env = await exportDataEncrypted(pass);
      downloadBlob(new Blob([env], { type: 'application/json' }), `pharos-backup-${today()}.enc.json`);
      return t('set.encDone');
    }, (error) => t('set.encFailed', { error }));
  }

  async function restore(file: File) {
    if (restoreRef.current) restoreRef.current.value = '';
    const ok = await confirm({ title: t('set.restoreTitle'), message: t('set.restoreConfirm'), confirmLabel: t('common.restore'), danger: true });
    if (!ok) return;
    const text = await file.text();
    const encrypted = looksEncrypted(text);
    let pass = '';
    if (encrypted) {
      const entered = await prompt({ title: t('set.decTitle'), message: t('set.decHelp'), label: t('set.encPassLabel'), type: 'password', confirmLabel: t('common.restore') });
      if (entered === null) return;
      pass = entered;
    }
    setReport(null);
    run('backup', 'restore', t('set.restoring'), async () => {
      const r = encrypted ? await importDataEncrypted(text, pass) : await importData(text);
      if (!r.ok) throw new Error(r.error || t('common.failed'));
      // A restore that skipped collections or documents used to look identical to a clean one.
      if (r.warnings?.length) setReport({ ok: true, headline: t('set.restoreSkipped'), issues: r.warnings.map((message) => ({ level: 'warning', message })) });
      return t('set.restored', { n: r.restored });
    }, (error) => `${t('common.failed')}: ${error}`);
  }

  /** Read-only integrity check: never writes, so no confirmation is needed. */
  async function verify(file: File) {
    if (verifyRef.current) verifyRef.current.value = '';
    setReport(null);
    const text = await file.text();
    run('backup', 'verify', t('set.verifying'), async () => {
      const r = await verifyBackup(text);
      const stamp = formatDate(r.exportedAt, locale, undefined, '—');
      const headline = r.ok ? t('set.verifyOk', { date: stamp, summary: r.summary }) : t('set.verifyBad', { name: file.name });
      // The report below carries the verdict and its issues; the status line stays quiet.
      setReport({ ok: r.ok, headline, issues: r.issues });
      return '';
    }, (error) => error);
  }

  function csv(kind: CsvKind) {
    run('csv', `csv-${kind}`, t('set.preparing'), async () => {
      const body = await exportCSV(kind);
      // BOM so Excel reads UTF-8 (Greek vendor names) correctly.
      downloadBlob(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), `pharos-${kind}-${today()}.csv`);
      return t('set.csvDone', { kind: t(CSV_LABEL[kind]) });
    }, (error) => t('set.csvFailed', { error }));
  }

  function insurance() {
    run('claim', 'insurance', t('set.claimPreparing'), async () => {
      const { base64, itemCount, totalValue } = await exportInsuranceBundle();
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      downloadBlob(new Blob([bytes], { type: 'application/zip' }), `pharos-insurance-export-${today()}.zip`);
      return t('set.insuranceExportDone', { n: itemCount, total: money(totalValue) });
    }, (error) => t('set.insuranceFailed', { error }));
  }

  const spin = (key: Busy, icon: React.ReactNode) => (busy === key ? <Loader2 size={13} className="animate-spin" /> : icon);
  const line = (card: Card) => <StatusLine status={status?.card === card ? status : null} />;

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--color-border)] grid gap-3 lg:grid-cols-3">
      <DataCard icon={<Database size={14} />} title={t('set.cardBackupTitle')} desc={t('set.cardBackupDesc')}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportJson} disabled={working} className={cn(btn, 'text-[color:var(--color-accent)]')}>
            {spin('json', <Download size={13} />)} {t('set.exportJson')}
          </button>
          <button type="button" onClick={exportEncrypted} disabled={working} className={cn(btn, 'text-[color:var(--color-accent)]')} title={t('set.exportEncryptedDesc')}>
            {spin('encrypted', <KeyRound size={13} />)} {t('set.exportEncrypted')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => restoreRef.current?.click()} disabled={working} className={cn(btn, 'text-[color:var(--color-cyan)]')}>
            {spin('restore', <Upload size={13} />)} {t('set.restoreDots')}
          </button>
          <button type="button" onClick={() => verifyRef.current?.click()} disabled={working} className={cn(btn, 'text-[color:var(--color-text-dim)]')} title={t('set.verifyBackupDesc')}>
            {spin('verify', <ShieldCheck size={13} />)} {t('set.verifyBackup')}
          </button>
        </div>
        <input ref={restoreRef} type="file" accept="application/json,.json" className="hidden" aria-label={t('set.restoreDots')} onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        <input ref={verifyRef} type="file" accept="application/json,.json" className="hidden" aria-label={t('set.verifyBackup')} onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
        <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('set.cardBackupRestoreHint')}</p>
        {line('backup')}
        {report && <BackupReport report={report} />}
      </DataCard>

      <DataCard icon={<FileSpreadsheet size={14} />} title={t('set.cardCsvTitle')} desc={t('set.cardCsvDesc')}>
        <div className="flex flex-wrap gap-2">
          {CSV_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => csv(k)} disabled={working} className={cn(btn, 'text-[color:var(--color-text-dim)]')}>
              {spin(`csv-${k}`, <Download size={12} />)} {t(CSV_LABEL[k])}
            </button>
          ))}
        </div>
        {line('csv')}
      </DataCard>

      <DataCard icon={<FileArchive size={14} />} title={t('set.cardClaimTitle')} desc={t('set.cardClaimDesc')}>
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 space-y-2">
          <p className="text-sm font-medium">{t('set.claimInsuranceTitle')}</p>
          <ul className="space-y-1 text-[11px] text-[color:var(--color-text-dim)]">
            {(['set.claimIncludesManifest', 'set.claimIncludesReceipts', 'set.claimIncludesMedia'] as const).map((k) => (
              <li key={k} className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-[color:var(--color-accent)]" /> {t(k)}</li>
            ))}
          </ul>
          <button type="button" onClick={insurance} disabled={working} className={cn(btn, 'text-[color:var(--color-purple)]')}>
            {spin('insurance', <FileArchive size={13} />)} {t('set.insuranceExport')}
          </button>
        </div>
        {line('claim')}
      </DataCard>
    </div>
  );
}

function DataCard({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[color:var(--color-border)] p-4 space-y-3 min-w-0">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--color-text-faint)]">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function StatusLine({ status }: { status: Status }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'text-[11px] min-h-[1em] break-words',
        status?.tone === 'error' ? 'text-[color:var(--color-red)]' : status?.tone === 'ok' ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-dim)]'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {status?.text}
    </p>
  );
}

function BackupReport({ report }: { report: Report }) {
  return (
    <div
      className={cn('rounded-lg border px-3 py-2 text-[11px] bg-[color:var(--color-surface-2)]', report.ok ? 'border-[color:var(--color-border)]' : 'border-[color:var(--color-red)]')}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <p className={report.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>{report.headline}</p>
      {report.issues.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {report.issues.map((issue, i) => (
            <li key={i} className={issue.level === 'error' ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-gold)]'}>
              {issue.level === 'error' ? '✕' : '⚠'} {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
