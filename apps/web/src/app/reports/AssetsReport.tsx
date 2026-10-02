'use client';
// Reports → Assets & debts, read as a household balance sheet: what you own on one side,
// what you owe on the other, the net between them, and the road to owing nothing (the
// remaining installments paid down month by month).
import Link from 'next/link';
import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ArrowRight, Landmark, Package, CreditCard, Layers, Pencil, ShieldCheck, PartyPopper } from 'lucide-react';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { formatDate } from '@/lib/i18n/format';

export type PlanRow = {
  key: string;
  label: string;
  linked: boolean;
  paidInstallments: number;
  totalInstallments: number;
  perAmount: number;
  remainingAmount: number;
  done: boolean;
};

type Point = { period: string; net: number };

const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 12 };

export function AssetsReport({
  inventory,
  accounts,
  installments,
  cardBalance,
  plans,
  inventoryByCategory,
  warranties,
  series,
  onEditAccounts,
}: {
  inventory: number;
  accounts: number;
  installments: number;
  cardBalance: number;
  plans: PlanRow[];
  inventoryByCategory: { name: string; value: number }[];
  warranties: { title: string; until: string; days: number }[];
  series: Point[];
  onEditAccounts: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const locale = useLocale();
  const own = inventory + accounts;
  const owe = installments + cardBalance;
  const net = own - owe;
  const ownPct = own + owe > 0 ? (own / (own + owe)) * 100 : 100;

  const active = plans.filter((p) => !p.done && p.totalInstallments > p.paidInstallments);
  const compact = (v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 });

  // The road to zero: this month's card balance is paid now, then each plan drops one
  // installment a month until it ends. Months are counted from the current one.
  const path = useMemo(() => {
    const longest = Math.max(0, ...active.map((p) => p.totalInstallments - p.paidInstallments));
    const start = new Date();
    start.setDate(1);
    const out: { label: string; owed: number }[] = [];
    for (let k = 0; k <= longest; k++) {
      const d = new Date(start.getFullYear(), start.getMonth() + k, 1);
      const owed = active.reduce((s, p) => s + p.perAmount * Math.max(0, p.totalInstallments - p.paidInstallments - k), 0) + (k === 0 ? cardBalance : 0);
      out.push({ label: formatDate(d, locale, { month: 'short', year: '2-digit' }), owed: Math.round(owed) });
    }
    return out;
  }, [active, cardBalance, locale]);
  const freeAt = path.length > 1 ? path[path.length - 1].label : null;
  const perMonthNow = active.reduce((s, p) => s + p.perAmount, 0);

  const plansByEnd = [...active].sort((a, b) => a.totalInstallments - a.paidInstallments - (b.totalInstallments - b.paidInstallments));
  const endLabel = (left: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + left - 1);
    return formatDate(d, locale, { month: 'short', year: 'numeric' });
  };

  const invTop = inventoryByCategory.slice(0, 5);
  const invMax = Math.max(1, ...invTop.map((c) => c.value));

  return (
    <div className="space-y-4">
      {/* Net worth with the own/owe split as one bar. */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface-2)] to-[color:var(--color-surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-[color:var(--color-text-dim)]">{t('reports.netWorth')}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: net >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>{money(net)}</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">{t('reports.netWorthIs', { own: money(own), owe: money(owe) })}</p>
          </div>
          {series.length >= 2 && (
            <div className="h-16 w-full max-w-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00ff88" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(Number(v)), t('reports.netWorth')]} labelFormatter={(_, p) => String(p?.[0]?.payload?.period ?? '')} />
                  <Area type="monotone" dataKey="net" stroke="#00ff88" strokeWidth={2} fill="url(#nwSpark)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[color:var(--color-surface-3)]">
          <span className="h-full bg-[color:var(--color-accent)]" style={{ width: `${ownPct}%` }} />
          <span className="h-full bg-[color:var(--color-red)]" style={{ width: `${100 - ownPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-[color:var(--color-text-faint)]">
          <span>{t('reports.youOwn')} {money(own)}</span>
          <span>{t('reports.youOwe')} {money(owe)}</span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* What you own */}
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">{t('reports.youOwn')}</h3>
            <span className="text-lg font-bold tabular-nums text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-display)' }}>{money(own)}</span>
          </header>
          <ul className="mt-3 space-y-2">
            <li className="flex items-center gap-3 rounded-xl bg-[color:var(--color-surface-2)] px-3 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-cyan)]/15 text-[color:var(--color-cyan)]"><Landmark size={16} /></span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('reports.accounts')}</span>
                <span className="block text-[11px] text-[color:var(--color-text-faint)]">{accounts > 0 ? t('reports.accountsHint') : t('reports.accountsEmpty')}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{money(accounts)}</span>
              <button type="button" onClick={onEditAccounts} aria-label={t('reports.accounts')} title={t('reports.accounts')} className="rounded-lg p-1.5 text-[color:var(--color-text-faint)] hover:bg-[color:var(--color-surface-3)] hover:text-[color:var(--color-text)]"><Pencil size={14} /></button>
            </li>
            <li className="rounded-xl bg-[color:var(--color-surface-2)] px-3 py-2.5">
              <Link href="/items" prefetch={false} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"><Package size={16} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{t('reports.inventoryValue')}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('reports.inventoryHint')}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(inventory)}</span>
              </Link>
              {invTop.length > 0 && (
                <ul className="mt-2.5 space-y-1.5 pl-12">
                  {invTop.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-[11px]">
                      <span className="w-20 shrink-0 truncate capitalize text-[color:var(--color-text-dim)]">{c.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-3)]"><span className="block h-full rounded-full bg-[color:var(--color-accent)]/70" style={{ width: `${(c.value / invMax) * 100}%` }} /></span>
                      <span className="w-16 shrink-0 text-right tabular-nums">{compact(c.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
          {warranties.length > 0 && (
            <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-faint)]">{t('reports.warrantiesSoon')}</p>
              <ul className="space-y-1">
                {warranties.slice(0, 4).map((w, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <ShieldCheck size={13} className="shrink-0" style={{ color: w.days <= 30 ? 'var(--color-red)' : 'var(--color-gold)' }} />
                    <span className="flex-1 truncate">{w.title}</span>
                    <span className="shrink-0 text-[color:var(--color-text-faint)]">{formatDate(w.until, locale, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* What you owe */}
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">{t('reports.youOwe')}</h3>
            <span className="text-lg font-bold tabular-nums text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-display)' }}>{money(owe)}</span>
          </header>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/statements" prefetch={false} className="flex items-center gap-3 rounded-xl bg-[color:var(--color-surface-2)] px-3 py-2.5 hover:bg-[color:var(--color-surface-3)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)]"><CreditCard size={16} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{t('reports.cardBalance')}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('reports.cardBalanceHint')}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(cardBalance)}</span>
              </Link>
            </li>
            <li>
              <Link href="/statements" prefetch={false} className="flex items-center gap-3 rounded-xl bg-[color:var(--color-surface-2)] px-3 py-2.5 hover:bg-[color:var(--color-surface-3)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-purple)]/15 text-[color:var(--color-purple)]"><Layers size={16} /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{t('reports.installmentsLeft')}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('reports.installmentsHint', { n: active.length, x: money(perMonthNow) })}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(installments)}</span>
              </Link>
            </li>
          </ul>
          {plansByEnd.length > 0 && (
            <ul className="mt-3 space-y-2.5 border-t border-[color:var(--color-border)] pt-3">
              {plansByEnd.map((p) => {
                const left = p.totalInstallments - p.paidInstallments;
                const pct = Math.round((p.paidInstallments / p.totalInstallments) * 100);
                return (
                  <li key={p.key}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{p.label}</span>
                      <span className="shrink-0 tabular-nums text-[color:var(--color-text-dim)]">{money(p.remainingAmount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]"><div className="h-full rounded-full bg-[color:var(--color-purple)]" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-0.5 text-[11px] text-[color:var(--color-text-faint)]">{t('reports.planEnds', { paid: p.paidInstallments, total: p.totalInstallments, date: endLabel(left) })}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* The road to owing nothing. */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('reports.debtPath')}</h3>
          {owe <= 0 ? null : freeAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-accent)]/12 px-2.5 py-1 text-xs font-semibold text-[color:var(--color-accent)]"><PartyPopper size={13} /> {t('reports.debtFreeBy', { date: freeAt })}</span>
          ) : null}
        </header>
        {owe <= 0 ? (
          <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">{t('reports.debtFree')}</p>
        ) : path.length > 1 ? (
          <>
            <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">{t('reports.debtPathNote')}</p>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={path} margin={{ left: 0, right: 8, top: 6 }}>
                  <defs>
                    <linearGradient id="debtFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a55eea" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a55eea" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={compact} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(Number(v)), t('reports.stillOwed')]} />
                  <Area type="stepAfter" dataKey="owed" stroke="#a55eea" strokeWidth={2} fill="url(#debtFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">{t('reports.debtOnlyCard', { x: money(cardBalance) })}</p>
        )}
        <Link href="/statements" prefetch={false} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-accent)] hover:underline">
          {t('nav.statements')} <ArrowRight size={13} />
        </Link>
      </section>
    </div>
  );
}
