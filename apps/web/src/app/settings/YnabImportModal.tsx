'use client';
import { cur } from '@/lib/money';
import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useT } from '@/components/LocaleProvider';
import { parseYnabCsv, type YnabMapResult } from '@/lib/ynabImport';
import { importExpensesCsv } from '@/app/expenses/actions';

const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5';
const CHUNK = 300;

type Props = { onClose: () => void; onImported: () => void };

/** Settings → Storage & backup → "Import from another app" → YNAB. Auto-detects
 *  the register export's columns (see lib/ynabImport.ts) — unlike the generic
 *  bank-CSV modal there is no manual column-mapping step, YNAB's export shape is
 *  known. Reuses the existing, already-tested importExpensesCsv action for the
 *  actual writes (dedupe + category inheritance + tenant scoping). */
export function YnabImportModal({ onClose, onImported }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<YnabMapResult | null>(null);
  const [notYnab, setNotYnab] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError('');
    setNotYnab(false);
    setResult(null);
    try {
      const text = await f.text();
      const { mapping, result: mapped } = parseYnabCsv(text);
      setFileName(f.name);
      if (!mapping) {
        setNotYnab(true);
        setParsed(null);
        return;
      }
      setParsed(mapped);
    } catch {
      setError(t('csv.readError'));
    }
  }

  async function runImport() {
    if (!parsed || parsed.rows.length === 0 || importing) return;
    setImporting(true);
    setError('');
    let imported = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        setProgress(t('csv.importingN', { i: Math.min(i + CHUNK, parsed.rows.length), n: parsed.rows.length }));
        const r = await importExpensesCsv(parsed.rows.slice(i, i + CHUNK), { kind: 'expense', signSplit: true });
        if (!r.ok) { setError(r.error); break; }
        imported += r.imported;
        skipped += r.skippedDupes;
      }
      setResult({ imported, skipped });
      if (imported > 0) onImported();
    } finally {
      setImporting(false);
      setProgress('');
    }
  }

  const preview = parsed?.rows.slice(0, 8) ?? [];

  return (
    <Modal open onClose={onClose} title={t('ynab.title')} size="lg">
      <div className="p-5 space-y-4" style={{ fontFamily: 'var(--font-body)' }}>
        <div
          onClick={() => !importing && fileRef.current?.click()}
          className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]', importing && 'pointer-events-none opacity-60')}
        >
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          <div className="flex flex-col items-center gap-1.5 text-[color:var(--color-text-dim)]">
            <FileSpreadsheet size={22} />
            {fileName ? (
              <p className="text-xs text-[color:var(--color-text)]">{fileName}</p>
            ) : (
              <p className="text-xs">{t('ynab.dropHint')}</p>
            )}
            <p className="text-[10px] text-[color:var(--color-text-faint)]">{t('ynab.formats')}</p>
          </div>
        </div>

        {error && <p className="text-xs text-[color:var(--color-red)] flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}
        {notYnab && <p className="text-xs text-[color:var(--color-red)] flex items-center gap-1.5"><AlertTriangle size={13} /> {t('ynab.notYnab')}</p>}

        {parsed && !result && (
          <>
            <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>
              {t('ynab.summary', { valid: parsed.rows.length, excluded: parsed.excluded, invalid: parsed.invalid })}
            </p>

            {preview.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[color:var(--color-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-[color:var(--color-text-faint)] border-b border-[color:var(--color-border)]" style={{ fontFamily: 'var(--font-mono)' }}>
                      <th className="px-3 py-2">{t('csv.f_date')}</th>
                      <th className="px-3 py-2">{t('csv.f_vendor')}</th>
                      <th className="px-3 py-2 text-right">{t('csv.f_amount')}</th>
                      <th className="px-3 py-2">{t('csv.f_category')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-b border-[color:var(--color-border)] last:border-0">
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>{r.date}</td>
                        <td className="px-3 py-1.5 max-w-[220px] truncate">{r.vendor}</td>
                        <td className={cn('px-3 py-1.5 text-right whitespace-nowrap', r.amount < 0 ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
                          {r.amount < 0 ? '-' : ''}{cur()}{Math.abs(r.amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-[color:var(--color-text-faint)]">{r.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {importing && <span className="text-xs text-[color:var(--color-cyan)] flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {progress}</span>}
              <Button onClick={runImport} disabled={parsed.rows.length === 0 || importing}>
                {t('csv.importN', { n: parsed.rows.length })}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="text-center py-4 space-y-2">
            <CheckCircle2 size={28} className="mx-auto text-[color:var(--color-accent)]" />
            <p className="text-sm text-[color:var(--color-text)]">{t('csv.doneImported', { n: result.imported })}</p>
            <p className="text-xs text-[color:var(--color-text-faint)]">
              {t('csv.doneSkipped', { dupes: result.skipped, invalid: parsed?.invalid ?? 0 })}
            </p>
            <Button onClick={onClose} className="mt-2">{t('common.close')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
