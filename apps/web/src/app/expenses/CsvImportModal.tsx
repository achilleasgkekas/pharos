'use client';
import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useT, useMoney } from '@/components/LocaleProvider';
import {
  parseCsv, guessMapping, looksLikeHeader, mapCsvRow,
  type CsvField, type CsvMapping, type CsvParsedRow,
} from '@/lib/csvImport';
import { isForeignCurrency, normalizeCurrency, convertToBase } from '@/lib/fx';
import { importExpensesCsv } from './actions';

const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5';
const selCls = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[color:var(--color-accent)]';

const MAPPED_FIELDS: Array<{ field: CsvField; required: boolean }> = [
  { field: 'date', required: true },
  { field: 'amount', required: true },
  { field: 'vendor', required: true },
  { field: 'category', required: false },
  { field: 'notes', required: false },
];

const CHUNK = 300;

type Props = {
  kind: 'income' | 'expense';
  /** Multi-currency (P9): base code + whether the per-entry currency controls are on. */
  fx: { base: string; enabled: boolean };
  onClose: () => void;
  onImported: () => void;
};

export function CsvImportModal({ kind, fx, onClose, onImported }: Props) {
  const t = useT();
  const money = useMoney();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [signSplit, setSignSplit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number; invalid: number; needsRate: number } | null>(null);
  const [error, setError] = useState('');
  // One rate per foreign currency found in the file (a bank export prints codes, never
  // rates). Kept as raw strings so the inputs stay editable while half-typed.
  const [rateInput, setRateInput] = useState<Record<string, string>>({});

  async function handleFile(f: File | null) {
    if (!f) return;
    setError('');
    try {
      const text = await f.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) { setError(t('csv.emptyFile')); return; }
      const header = looksLikeHeader(parsed);
      setRows(parsed);
      setFileName(f.name);
      setHasHeader(header);
      setMapping(guessMapping(parsed[0]));
      setResult(null);
      setRateInput({});
    } catch {
      setError(t('csv.readError'));
    }
  }

  const header = rows && hasHeader ? rows[0] : null;
  const dataRows = useMemo(() => (rows ? (hasHeader ? rows.slice(1) : rows) : []), [rows, hasHeader]);
  const columnCount = rows ? Math.max(...rows.map((r) => r.length)) : 0;

  const mapped = useMemo(() => {
    const good: CsvParsedRow[] = [];
    let invalid = 0;
    for (const r of dataRows) {
      const m = mapCsvRow(r, mapping);
      if (m.ok) good.push(m.row);
      else invalid++;
    }
    return { good, invalid };
  }, [dataRows, mapping]);

  const canImport = mapping.date !== undefined && mapping.amount !== undefined && mapping.vendor !== undefined && mapped.good.length > 0;
  const hasNegatives = useMemo(() => mapped.good.some((r) => r.amount < 0), [mapped]);

  // Distinct foreign codes in the file → one rate input each. Rows whose code has no
  // rate still import (flagged), they just keep their printed amount for now.
  const foreignCodes = useMemo(() => {
    if (!fx.enabled) return [] as string[];
    const codes = new Set<string>();
    for (const r of mapped.good) if (isForeignCurrency(r.currency, fx.base)) codes.add(normalizeCurrency(r.currency));
    return [...codes].sort();
  }, [mapped, fx.enabled, fx.base]);

  const fxRates = useMemo(() => {
    const out: Record<string, number> = {};
    for (const code of foreignCodes) {
      const n = Number(rateInput[code]);
      if (Number.isFinite(n) && n > 0) out[code] = n;
    }
    return out;
  }, [foreignCodes, rateInput]);

  const mappedFields = useMemo(
    () => (fx.enabled ? [...MAPPED_FIELDS, { field: 'currency' as CsvField, required: false }] : MAPPED_FIELDS),
    [fx.enabled]
  );

  /** Printed amount as it will be stored: converted when a rate is known. */
  function rowBase(r: CsvParsedRow): number | null {
    const code = normalizeCurrency(r.currency);
    if (!isForeignCurrency(code, fx.base) || !fxRates[code]) return null;
    return convertToBase(Math.abs(r.amount), fxRates[code]);
  }

  function columnLabel(i: number): string {
    const name = header?.[i]?.trim();
    return name ? `${name}` : t('csv.columnN', { n: i + 1 });
  }

  async function runImport() {
    if (!canImport || importing) return;
    setImporting(true);
    setError('');
    let imported = 0;
    let skipped = 0;
    let needsRate = 0;
    try {
      for (let i = 0; i < mapped.good.length; i += CHUNK) {
        setProgress(t('csv.importingN', { i: Math.min(i + CHUNK, mapped.good.length), n: mapped.good.length }));
        const r = await importExpensesCsv(mapped.good.slice(i, i + CHUNK), { kind, signSplit, fxRates });
        if (!r.ok) { setError(r.error); break; }
        imported += r.imported;
        skipped += r.skippedDupes;
        needsRate += r.needsRate;
      }
      setResult({ imported, skipped, invalid: mapped.invalid, needsRate });
      if (imported > 0) onImported();
    } finally {
      setImporting(false);
      setProgress('');
    }
  }

  const preview = mapped.good.slice(0, 8);

  return (
    <Modal open onClose={onClose} title={t('csv.title')} size="lg">
      <div className="p-5 space-y-4" style={{ fontFamily: 'var(--font-body)' }}>
        {/* File picker */}
        <div
          onClick={() => !importing && fileRef.current?.click()}
          className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]', importing && 'pointer-events-none opacity-60')}
        >
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          <div className="flex flex-col items-center gap-1.5 text-[color:var(--color-text-dim)]">
            <FileSpreadsheet size={22} />
            {rows ? (
              <p className="text-xs text-[color:var(--color-text)]">{fileName} · {t('csv.rowsDetected', { n: dataRows.length })}</p>
            ) : (
              <p className="text-xs">{t('csv.dropHint')}</p>
            )}
            <p className="text-[10px] text-[color:var(--color-text-faint)]">{t('csv.formats')}</p>
          </div>
        </div>

        {error && <p className="text-xs text-[color:var(--color-red)] flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}

        {rows && !result && (
          <>
            {/* Column mapping */}
            <div>
              <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('csv.mapColumns')}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {mappedFields.map(({ field, required }) => (
                  <div key={field}>
                    <p className="text-[10px] text-[color:var(--color-text-dim)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                      {t(`csv.f_${field}` as Parameters<typeof t>[0])}{required && ' *'}
                    </p>
                    <select
                      value={mapping[field] ?? -1}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value === '-1' ? undefined : Number(e.target.value) }))}
                      className={selCls}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      <option value={-1}>—</option>
                      {Array.from({ length: columnCount }, (_, i) => (
                        <option key={i} value={i}>{columnLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[color:var(--color-text-dim)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="accent-[color:var(--color-accent)]" />
                {t('csv.firstRowHeaders')}
              </label>
              <label className={cn('flex items-center gap-1.5', hasNegatives ? 'cursor-pointer' : 'opacity-50')}>
                <input type="checkbox" checked={signSplit} disabled={!hasNegatives} onChange={(e) => setSignSplit(e.target.checked)} className="accent-[color:var(--color-accent)]" />
                {t('csv.signSplit')}
              </label>
            </div>
            {!signSplit && (
              <p className="text-[10px] text-[color:var(--color-text-faint)]">{t('csv.allAsKind', { kind: kind === 'income' ? t('nav.income') : t('nav.expenses') })}</p>
            )}

            {/* Multi-currency (P9): one rate per foreign code found in the file. */}
            {foreignCodes.length > 0 && (
              <div>
                <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('csv.fxRates')}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {foreignCodes.map((code) => (
                    <div key={code}>
                      <p className="text-[10px] text-[color:var(--color-text-dim)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                        {t('csv.fxRateFor', { code, base: normalizeCurrency(fx.base) || 'EUR' })}
                      </p>
                      <input
                        type="number"
                        step="0.000001"
                        min="0"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={rateInput[code] ?? ''}
                        onChange={(e) => setRateInput((m) => ({ ...m, [code]: e.target.value }))}
                        className={selCls}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-[color:var(--color-text-faint)]">{t('csv.fxRatesHint')}</p>
              </div>
            )}

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>
                  {t('csv.previewValid', { valid: mapped.good.length, invalid: mapped.invalid })}
                </p>
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
                            {r.amount < 0 ? '-' : ''}
                            {isForeignCurrency(r.currency, fx.base)
                              ? money(Math.abs(r.amount), normalizeCurrency(r.currency))
                              : `${money(Math.abs(r.amount))}`}
                            {(() => {
                              const b = rowBase(r);
                              return b === null ? null : (
                                <span className="ml-1 text-[color:var(--color-text-faint)]">→ {money(b, fx.base)}</span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-1.5 text-[color:var(--color-text-faint)]">{r.category || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {importing && <span className="text-xs text-[color:var(--color-cyan)] flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {progress}</span>}
              <Button onClick={runImport} disabled={!canImport || importing}>
                {t('csv.importN', { n: mapped.good.length })}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="text-center py-4 space-y-2">
            <CheckCircle2 size={28} className="mx-auto text-[color:var(--color-accent)]" />
            <p className="text-sm text-[color:var(--color-text)]">{t('csv.doneImported', { n: result.imported })}</p>
            <p className="text-xs text-[color:var(--color-text-faint)]">
              {t('csv.doneSkipped', { dupes: result.skipped, invalid: result.invalid })}
            </p>
            {result.needsRate > 0 && (
              <p className="text-xs text-[color:var(--color-gold)] flex items-center justify-center gap-1.5">
                <AlertTriangle size={13} /> {t('csv.doneNeedsRate', { n: result.needsRate })}
              </p>
            )}
            <Button onClick={onClose} className="mt-2">{t('common.close')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
