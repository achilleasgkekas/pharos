'use client';
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useT } from './LocaleProvider';
import { scanHomeDocument, type HomeScanResult } from '@/app/homeScanActions';
import type { HomeScanKind } from '@/lib/homeScan';

type Ok = Extract<HomeScanResult, { ok: true }>;

/**
 * "Scan with AI" for a form: pick or take a photo (or a PDF), let the AI read it, and hand the
 * fields back. Nothing is saved here; the form shows the values for the user to check.
 */
export function ScanFileButton({
  kind,
  label,
  onResult,
  accept = 'image/*,application/pdf',
}: {
  kind: HomeScanKind;
  label: string;
  onResult: (result: Ok, file: File) => void;
  accept?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('file', file);
    try {
      const r = await scanHomeDocument(kind, fd);
      if (!r.ok) setMsg({ text: r.error, tone: 'err' });
      else {
        onResult(r, file);
        setMsg({ text: t('scan.filledCheck'), tone: 'ok' });
      }
    } catch (e) {
      setMsg({ text: (e as Error).message || t('common.failed'), tone: 'err' });
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={ref} type="file" accept={accept} capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/10 px-3 text-xs font-medium text-[color:var(--color-accent)] transition-colors hover:bg-[color:var(--color-accent)]/15 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        {busy ? t('scan.reading') : label}
      </button>
      {msg && <span className={msg.tone === 'ok' ? 'text-[11px] text-[color:var(--color-accent)]' : 'text-[11px] text-[color:var(--color-red)]'}>{msg.text}</span>}
    </div>
  );
}
