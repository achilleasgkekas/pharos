'use client';
import { cur } from '@/lib/money';
import { useState, useEffect, useCallback, useTransition } from 'react';
import { Loader2, Receipt as ReceiptIcon, Link2, X, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useLocale, useT } from '@/components/LocaleProvider';
import { periodLabel } from '@/lib/cards';
import {
  getReconciliation,
  linkTransactionReceipt,
  unlinkTransactionReceipt,
  type ReconciliationResult,
  type ReconReceiptView,
} from './actions';
import { formatDate, formatTime, formatDateTime } from '@/lib/i18n/format';

type StmtOption = { _id: string; card: string; period: string };

function fmtDate(iso: string, locale: string): string {
  return formatDate(iso, locale);
}

/**
 * Reconciliation surface (P18): pick a statement, see each charge with its
 * suggested receipt match, confirm/clear links, and spot receipts in the period
 * that no charge is linked to. Loads suggestions on demand per statement.
 */
export function ReconcilePanel({ statements }: { statements: StmtOption[] }) {
  const locale = useLocale();
  const t = useT();
  const [statementId, setStatementId] = useState(statements[0]?._id ?? '');
  const [data, setData] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await getReconciliation(id);
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(statementId);
  }, [statementId, load]);

  function relink(txnId: string, receiptId: string) {
    startTransition(async () => {
      await linkTransactionReceipt(statementId, txnId, receiptId);
      await load(statementId);
    });
  }
  function unlink(txnId: string) {
    startTransition(async () => {
      await unlinkTransactionReceipt(statementId, txnId);
      await load(statementId);
    });
  }

  const receipts = data?.receipts ?? {};
  const txns = data?.txns ?? [];
  const matchedCount = txns.filter((tx) => tx.matchedReceiptId).length;

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm leading-relaxed text-[color:var(--color-text-dim)]">{t('payments.reconcileHelp')}</p>
      {/* Statement picker */}
      {statements.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('rec.pickStatement')}
          </span>
          <select
            value={statementId}
            onChange={(e) => setStatementId(e.target.value)}
            className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5 text-sm"
          >
            {statements.map((s) => (
              <option key={s._id} value={s._id}>
                {s.card} · {periodLabel(s.period)}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[color:var(--color-cyan)] py-8 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">{t('rec.loading')}</span>
        </div>
      ) : (
        <>
          <div
            className="text-xs text-[color:var(--color-text-dim)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('rec.summary', { matched: matchedCount, total: txns.length })}
          </div>

          {/* Charges */}
          {txns.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-faint)] py-4">{t('rec.noCharges')}</p>
          ) : (
            <div className="space-y-2">
              {txns.map((tx) => {
                const matched = tx.matchedReceiptId ? receipts[tx.matchedReceiptId] : null;
                return (
                  <div
                    key={tx.txnId}
                    className={cn(
                      'rounded-xl border p-3',
                      matched
                        ? 'border-[color:var(--color-accent)]/40 bg-[#00ff8806]'
                        : tx.candidates.length === 0
                          ? 'border-[color:var(--color-border)] opacity-70'
                          : 'border-[color:var(--color-cyan)]/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <p
                          className="text-[11px] text-[color:var(--color-text-faint)]"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {fmtDate(tx.date, locale)} · {cur()}
                          {Math.abs(tx.amount).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Match / suggestions */}
                    {matched ? (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[color:var(--color-surface-2)] px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5 text-xs min-w-0">
                          <Check size={13} className="text-[color:var(--color-accent)] shrink-0" />
                          <span className="truncate">{matched.store}</span>
                          <span className="text-[color:var(--color-text-faint)] shrink-0">
                            {fmtDate(matched.date, locale)} · {cur()}
                            {matched.total.toFixed(2)}
                          </span>
                        </span>
                        <button
                          onClick={() => unlink(tx.txnId)}
                          disabled={pending}
                          className="text-[11px] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] flex items-center gap-1 shrink-0"
                        >
                          <X size={12} /> {t('rec.unlink')}
                        </button>
                      </div>
                    ) : tx.candidates.length === 0 ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-faint)]">
                        <AlertCircle size={12} /> {t('rec.noMatch')}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        <p
                          className="text-[10px] uppercase tracking-wider text-[color:var(--color-cyan)]"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {tx.candidates.length === 1
                            ? t('rec.suggest')
                            : t('rec.suggestN', { n: tx.candidates.length })}
                        </p>
                        {tx.candidates.map((c) => {
                          const r = receipts[c.receiptId];
                          if (!r) return null;
                          return (
                            <div
                              key={c.receiptId}
                              className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--color-surface-2)] px-2.5 py-1.5"
                            >
                              <span className="flex items-center gap-1.5 text-xs min-w-0">
                                <ReceiptIcon size={13} className="text-[color:var(--color-text-dim)] shrink-0" />
                                <span className="truncate">{r.store}</span>
                                <span className="text-[color:var(--color-text-faint)] shrink-0">
                                  {fmtDate(r.date, locale)} · {cur()}
                                  {r.total.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-[color:var(--color-text-faint)] shrink-0">
                                  {c.dayDiff === 0 ? t('rec.dayExact') : t('rec.dayOff', { n: c.dayDiff })}
                                  {c.storeMatch ? ` · ${t('rec.storeHint')}` : ''}
                                </span>
                              </span>
                              <button
                                onClick={() => relink(tx.txnId, c.receiptId)}
                                disabled={pending}
                                className="text-[11px] text-[color:var(--color-accent)] hover:underline flex items-center gap-1 shrink-0"
                              >
                                <Link2 size={12} /> {t('rec.link')}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unmatched receipts */}
          {data?.unmatchedReceipts && data.unmatchedReceipts.length > 0 && (
            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <p className="text-xs font-semibold text-[color:var(--color-gold)] mb-1">
                {t('rec.unmatchedTitle', { n: data.unmatchedReceipts.length })}
              </p>
              <p className="text-[11px] text-[color:var(--color-text-faint)] mb-2">
                {t('rec.unmatchedHint')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.unmatchedReceipts.map((r: ReconReceiptView) => (
                  <span
                    key={r.id}
                    className="text-[11px] rounded-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] px-2 py-0.5"
                  >
                    {r.store} · {cur()}
                    {r.total.toFixed(2)}
                    <span className="text-[color:var(--color-text-faint)]"> · {fmtDate(r.date, locale)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
