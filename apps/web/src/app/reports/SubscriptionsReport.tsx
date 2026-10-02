'use client';
// Reports → Subscriptions: what the recurring charges cost, which ones carry the bill,
// what is about to be charged, and the few worth a second look (a trial about to convert,
// a big yearly charge coming, one nobody has checked in months).
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ArrowRight, CalendarClock, Hourglass, Repeat, Eye, Crown } from 'lucide-react';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { CategoryIcon, useCategoryLabel } from '@/components/CategoryBadge';
import { CATEGORY_GROUPS, categoryGroup, categoryGroupLabel, type CategoryGroupKey } from '@/lib/categories';
import { addCycleUTC, cycleRenews } from '@/lib/billingCycle';
import { formatDate } from '@/lib/i18n/format';
import type { TKey } from '@/lib/i18n';

export type SubRow = {
  id: string;
  name: string;
  amount: number;
  cycle: string;
  monthly: number;
  category: string;
  next: string | null;
  trialEndsAt: string | null;
  reviewedAt: string | null;
};

const DAY = 86_400_000;
const CYCLE_KEY: Record<string, TKey> = {
  weekly: 'sub.weekly',
  monthly: 'sub.monthly',
  quarterly: 'sub.quarterly',
  yearly: 'sub.yearly',
  biennial: 'sub.biennial',
};

/** Every charge of one subscription inside the next `days` days. */
function chargesWithin(s: SubRow, days: number, now: number): { date: Date; amount: number }[] {
  if (!s.next || !cycleRenews(s.cycle)) return [];
  const end = now + days * DAY;
  const out: { date: Date; amount: number }[] = [];
  let d = new Date(s.next);
  const anchor = new Date(s.next);
  for (let guard = 0; d.getTime() <= end && guard < 60; guard++) {
    if (d.getTime() >= now - DAY) out.push({ date: d, amount: s.amount });
    d = addCycleUTC(d, s.cycle, anchor);
  }
  return out;
}

const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 12 };

export function SubscriptionsReport({ subs, bySpace }: { subs: SubRow[]; bySpace: { name: string; value: number }[] }) {
  const t = useT();
  const money = useMoney();
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  // The exact monthly total (the summary figure elsewhere is rounded to whole units).
  const monthly = subs.reduce((n, s) => n + s.monthly, 0);
  // One clock for the whole render, so every "in N days" agrees.
  const [now] = useState(() => Date.now());

  const upcoming = useMemo(
    () =>
      subs
        .flatMap((s) => chargesWithin(s, 30, now).map((c) => ({ ...c, sub: s })))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [subs, now]
  );
  const next30 = upcoming.reduce((n, c) => n + c.amount, 0);

  const groups = useMemo(() => {
    const m = new Map<CategoryGroupKey, number>();
    for (const s of subs) {
      const g = categoryGroup(s.category).key;
      m.set(g, (m.get(g) ?? 0) + s.monthly);
    }
    return [...m.entries()]
      .map(([key, value]) => ({ key, value: Math.round(value * 100) / 100, color: CATEGORY_GROUPS.find((g) => g.key === key)?.color ?? '#94a3b8' }))
      .sort((a, b) => b.value - a.value);
  }, [subs]);

  // Worth a look: trials converting soon, a big non-monthly charge ahead, unchecked for 6 months.
  const insights = useMemo(() => {
    const out: { key: string; icon: React.ReactNode; text: string; href: string; tone: string }[] = [];
    for (const s of subs) {
      if (s.trialEndsAt) {
        const days = Math.ceil((new Date(s.trialEndsAt).getTime() - now) / DAY);
        if (days <= 14) out.push({ key: `trial-${s.id}`, icon: <Hourglass size={14} />, tone: 'var(--color-gold)', href: `/subscriptions?open=${s.id}`, text: t('reports.subTrial', { name: s.name, n: Math.max(0, days) }) });
      }
      if ((s.cycle === 'yearly' || s.cycle === 'biennial' || s.cycle === 'quarterly') && s.next) {
        const days = Math.ceil((new Date(s.next).getTime() - now) / DAY);
        if (days >= 0 && days <= 60) out.push({ key: `big-${s.id}`, icon: <CalendarClock size={14} />, tone: 'var(--color-cyan)', href: `/subscriptions?open=${s.id}`, text: t('reports.subBigCharge', { name: s.name, amount: money(s.amount), n: days }) });
      }
      if (s.reviewedAt) {
        const days = Math.floor((now - new Date(s.reviewedAt).getTime()) / DAY);
        if (days >= 180) out.push({ key: `rev-${s.id}`, icon: <Eye size={14} />, tone: 'var(--color-purple)', href: `/subscriptions?open=${s.id}`, text: t('reports.subReview', { name: s.name, m: Math.floor(days / 30) }) });
      }
    }
    return out.slice(0, 6);
  }, [subs, now, t, money]);

  if (subs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--color-border-light)] p-8 text-center">
        <Repeat size={22} className="mx-auto text-[color:var(--color-text-faint)]" />
        <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">{t('reports.noSubscriptions')}</p>
        <Link href="/subscriptions" prefetch={false} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-accent)] hover:underline">
          {t('nav.subscriptions')} <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  const top = subs[0];
  const topShare = monthly > 0 ? Math.round((top.monthly / monthly) * 100) : 0;
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: t('reports.subsPerMonth'), value: money(monthly) },
    { label: t('reports.subPerYear'), value: money(monthly * 12) },
    { label: t('reports.subActive'), value: String(subs.length), sub: t('reports.subAvg', { x: money(monthly / subs.length) }) },
    { label: t('reports.subNext30'), value: money(next30), sub: t('reports.subCharges', { n: upcoming.length }) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x, i) => (
          <div key={x.label} className={`rounded-2xl border border-[color:var(--color-border)] p-4 ${i === 0 ? 'bg-gradient-to-br from-[color:var(--color-purple)]/15 to-[color:var(--color-surface)]' : 'bg-[color:var(--color-surface)]'}`}>
            <p className="text-xs text-[color:var(--color-text-dim)]">{x.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{x.value}</p>
            {x.sub && <p className="mt-0.5 text-[11px] text-[color:var(--color-text-faint)]">{x.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Who carries the bill, biggest first, each as a share of the monthly total. */}
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] lg:col-span-3">
          <header className="flex items-center justify-between gap-2 px-4 pt-4">
            <h3 className="text-sm font-semibold">{t('reports.subWhere')}</h3>
            <Link href="/subscriptions" prefetch={false} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-accent)] hover:underline">
              {t('nav.subscriptions')} <ArrowRight size={13} />
            </Link>
          </header>
          {topShare >= 25 && subs.length > 1 && (
            <p className="mx-4 mt-2 flex items-center gap-1.5 rounded-lg bg-[color:var(--color-gold)]/10 px-2.5 py-1.5 text-xs text-[color:var(--color-gold)]">
              <Crown size={13} /> {t('reports.subTop', { name: top.name, pct: topShare })}
            </p>
          )}
          <ul className="mt-2 divide-y divide-[color:var(--color-border)]">
            {subs.map((s) => {
              const g = categoryGroup(s.category);
              const share = monthly > 0 ? (s.monthly / monthly) * 100 : 0;
              return (
                <li key={s.id}>
                  <Link href={`/subscriptions?open=${s.id}`} prefetch={false} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--color-surface-2)]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{ background: `color-mix(in srgb, ${g.color} 16%, transparent)`, color: g.color }}>
                      {s.name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{s.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(s.monthly)}<span className="text-[11px] font-normal text-[color:var(--color-text-faint)]">{t('reports.perMo')}</span></span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(share, 2)}%`, background: g.color }} />
                        </span>
                        <span className="w-28 shrink-0 truncate text-right text-[11px] text-[color:var(--color-text-faint)]">
                          {s.cycle === 'monthly' ? catLabel(s.category) : `${money(s.amount)} · ${CYCLE_KEY[s.cycle] ? t(CYCLE_KEY[s.cycle]) : s.cycle}`}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-4 lg:col-span-2">
          {/* The same total split by category group, with the total in the middle. */}
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold">{t('reports.subByGroup')}</h3>
            <div className="relative mx-auto mt-2 h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={groups} dataKey="value" nameKey="key" innerRadius={56} outerRadius={80} paddingAngle={groups.length > 1 ? 2 : 0} stroke="none">
                    {groups.map((g) => <Cell key={g.key} fill={g.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [`${money(Number(v))}${t('reports.perMo')}`, categoryGroupLabel(t, k as CategoryGroupKey)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <span>
                  <span className="block text-lg font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{money(monthly)}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('reports.perMonthShort')}</span>
                </span>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {groups.map((g) => (
                <li key={g.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="flex-1 text-[color:var(--color-text-dim)]">{categoryGroupLabel(t, g.key)}</span>
                  <span className="tabular-nums">{money(g.value)}</span>
                  <span className="w-9 text-right tabular-nums text-[color:var(--color-text-faint)]">{monthly > 0 ? Math.round((g.value / monthly) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </section>

          {/* The next 30 days of charges, in order. */}
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold">{t('reports.subComing')}</h3>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-xs text-[color:var(--color-text-faint)]">{t('reports.subNothingSoon')}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {upcoming.slice(0, 8).map((c, i) => {
                  const days = Math.max(0, Math.ceil((c.date.getTime() - now) / DAY));
                  return (
                    <li key={`${c.sub.id}-${i}`} className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--color-border)] text-center leading-none">
                        <span>
                          <span className="block text-sm font-bold">{c.date.getUTCDate()}</span>
                          <span className="block text-[11px] text-[color:var(--color-text-faint)]">{formatDate(c.date, locale, { month: 'short' })}</span>
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-sm font-medium"><CategoryIcon category={c.sub.category} size={13} /> {c.sub.name}</span>
                        <span className="block text-[11px] text-[color:var(--color-text-faint)]">{days === 0 ? t('reports.today') : t('reports.inDays', { n: days })}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{money(c.amount)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>

      {insights.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <h3 className="text-sm font-semibold">{t('reports.subWorthALook')}</h3>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {insights.map((x) => (
              <li key={x.key}>
                <Link href={x.href} prefetch={false} className="flex items-start gap-2.5 rounded-xl border border-[color:var(--color-border)] p-3 text-sm hover:bg-[color:var(--color-surface-2)]">
                  <span className="mt-0.5 shrink-0" style={{ color: x.tone }}>{x.icon}</span>
                  <span className="flex-1">{x.text}</span>
                  <ArrowRight size={14} className="mt-0.5 shrink-0 text-[color:var(--color-text-faint)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bySpace.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <h3 className="text-sm font-semibold">{t('reports.subBySpace')}</h3>
          <ul className="mt-3 space-y-2">
            {bySpace.map((s) => (
              <li key={s.name} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-[color:var(--color-text-dim)]">{s.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                  <span className="block h-full rounded-full bg-[color:var(--color-cyan)]" style={{ width: `${monthly > 0 ? Math.max(2, (s.value / monthly) * 100) : 0}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">{money(s.value)}{t('reports.perMo')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
