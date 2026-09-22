'use client';
import { useState } from 'react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { formatDate } from '@/lib/i18n/format';
import { cur } from '@/lib/money';
import type { StatementPaymentReport as Report } from '@/lib/statementPayments';

export function StatementPaymentReport({ report }: { report: Report }) {
  const t = useT(), locale = useLocale();
  const [card, setCard] = useState('');
  const cards = new Map<string, string>();
  report.history.forEach(r => cards.set(r.cardKey, r.card));
  report.forecast.forEach(m => m.lines.forEach(l => cards.set(l.cardKey, l.card)));
  const selectedCard = cards.has(card) ? card : '';
  const money = (n: number) => `${cur()}${n.toFixed(2)}`;
  const month = (key: string) => formatDate(`${key}-01T12:00:00Z`, locale, { month: 'long', year: 'numeric' });
  const history = report.history.filter(r => !selectedCard || r.cardKey === selectedCard);
  return <section className="min-w-0 space-y-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('payments.title')}</h2>
      <select aria-label={t('st.cards', { n: cards.size })} value={selectedCard} onChange={e => setCard(e.target.value)} className="min-w-0 max-w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]">
        <option value="">{t('st.allCards')}</option>
        {[...cards].map(([id,label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>
    <p className="text-xs leading-relaxed text-[color:var(--color-text-dim)]">{t('payments.forecastNote')}</p>
    <h3 className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-purple)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('payments.forecast', { n: report.forecast.length })}</h3>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {report.forecast.map(m => {
        const lines = m.lines.filter(l => !selectedCard || l.cardKey === selectedCard);
        const amount = lines.reduce((n,l) => n+l.amount,0);
        return <details key={m.period} className="min-w-0 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 open:border-[color:var(--color-border-light)]">
          <summary className="cursor-pointer text-xs leading-7 text-[color:var(--color-text-dim)]"><span>{month(m.period)}</span><strong className="ml-3 whitespace-nowrap tabular-nums text-sm text-[color:var(--color-purple)]" style={{ fontFamily: 'var(--font-display)' }}>{money(amount)}</strong></summary>
          <ul className="mt-3 space-y-3 border-t border-[color:var(--color-border)] pt-3 text-xs">
            {lines.map((l,i) => <li key={`${l.cardKey}-${l.key}-${i}`} className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words">{l.adjustment ? t('payments.adjustment') : l.label}<small className="block text-[color:var(--color-text-faint)]">{l.card}</small></span>
              <span className="shrink-0 tabular-nums text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{money(l.amount)}</span>
            </li>)}
          </ul>
        </details>;
      })}
    </div>
    <h3 className="border-t border-[color:var(--color-border)] pt-4 text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('payments.history')}</h3>
    <p className="text-xs leading-relaxed text-[color:var(--color-text-dim)]">{t('payments.summaryNote')}</p>
    <div className="space-y-2">
      {history.map(r => <details key={r.id} className="min-w-0 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 open:border-[color:var(--color-border-light)]">
        <summary className="cursor-pointer break-words text-xs leading-7 text-[color:var(--color-text-dim)]">{month(r.period)} · {r.card} <strong className="ml-2 whitespace-nowrap text-sm" style={{ fontFamily: 'var(--font-display)', color: r.due > 0 ? 'var(--color-red)' : 'var(--color-accent)' }}>{t('payments.remaining')}: {money(r.due)}</strong></summary>
        <dl className="mt-3 grid min-w-0 gap-4 border-t border-[color:var(--color-border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['opening','charges','paymentsIncluded','otherCredits','closing','additionalPaid','due','credit'] as const).map((k,i) => <div key={k} className="min-w-0"><dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t((['payments.opening','payments.charges','payments.included','payments.otherCredits','payments.closing','payments.additional','payments.remaining','payments.credit'] as const)[i])}</dt><dd className="mt-1 text-sm font-semibold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: ['paymentsIncluded', 'additionalPaid', 'credit', 'otherCredits'].includes(k) ? 'var(--color-accent)' : k === 'due' && r.due > 0 ? 'var(--color-red)' : 'var(--color-text)' }}>{money(r[k])}</dd></div>)}
        </dl>
      </details>)}
    </div>
  </section>;
}
