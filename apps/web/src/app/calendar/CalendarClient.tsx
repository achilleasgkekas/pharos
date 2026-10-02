'use client';
import { PAGE_MAIN, PageHeader, HeaderStat, ViewToggle } from '@/components/ui/PageHeader';
import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import {
  CalendarClock,
  Layers,
  ShieldCheck,
  Ticket,
  Wallet,
  Banknote,
  Receipt,
  Target,
  CalendarDays,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { formatDate } from '@/lib/i18n/format';
import { dayOf } from '@/lib/calendarDay';
import type { EntryDetails } from './details';
import { markBillPaid } from '@/app/bills/actions';
import { reviewSubscription } from '@/app/subscriptions/actions';
import { useRouter } from 'next/navigation';

export type Kind = 'renewal' | 'installments' | 'bill' | 'payable' | 'income' | 'goal' | 'warranty' | 'voucher';

export type Entry = {
  id?: string;
  date: string;
  pinned?: boolean;
  kind: Kind;
  label: string;
  sub: string;
  amount: number | null;
  details?: EntryDetails;
};

export type MonthBlock = { key: string; label: string; entries: Entry[]; out: number; inc: number };

const mono = { fontFamily: 'var(--font-mono)' } as const;
const display = { fontFamily: 'var(--font-display)' } as const;

const KIND_META: Record<Kind, { icon: React.ReactNode; color: string; labelKey: string }> = {
  renewal: { icon: <CalendarClock size={15} />, color: 'var(--color-purple)', labelKey: 'cal.lblSubscription' },
  installments: { icon: <Layers size={15} />, color: 'var(--color-gold)', labelKey: 'cal.lblInstallments' },
  bill: { icon: <Wallet size={15} />, color: 'var(--color-red)', labelKey: 'cal.lblBill' },
  payable: { icon: <Receipt size={15} />, color: 'var(--color-orange)', labelKey: 'cal.lblBill' },
  income: { icon: <Banknote size={15} />, color: 'var(--color-accent)', labelKey: 'cal.lblIncome' },
  goal: { icon: <Target size={15} />, color: 'var(--color-purple)', labelKey: 'cal.lblGoal' },
  warranty: { icon: <ShieldCheck size={15} />, color: 'var(--color-cyan)', labelKey: 'cal.lblItem' },
  voucher: { icon: <Ticket size={15} />, color: 'var(--color-gold)', labelKey: 'cal.lblVoucher' },
};

type View = 'month' | 'agenda';
const VIEWS: { id: View; icon: React.ReactNode }[] = [
  { id: 'month', icon: <LayoutGrid size={15} /> },
  { id: 'agenda', icon: <CalendarDays size={15} /> },
];

const dayMonth = (value: string, locale: string) =>
  formatDate(value, locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Amount({ e }: { e: Entry }) {
  const money = useMoney();
  const fmt = (n: number) => money(n, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (e.amount == null) return null;
  return (
    <span className={cn('font-bold', e.kind === 'income' && 'text-[color:var(--color-accent)]')} style={display}>
      {e.kind === 'income' ? '+' : ''}
      {fmt(e.amount)}
    </span>
  );
}

/** One agenda row (icon · label/sub · date · amount). */
function EntryRow({ e, onClick }: { e: Entry; onClick: () => void }) {
  const locale = useLocale();
  const meta = KIND_META[e.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-2)] rounded-xl px-3.5 py-2.5 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
    >
      <span
        className="grid place-items-center w-8 h-8 rounded-lg shrink-0"
        style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-[color:var(--color-text)]">{e.label}</p>
        <p className="text-[11px] text-[color:var(--color-text-faint)] truncate" style={mono}>
          {e.sub}
        </p>
      </div>
      <span className="text-[11px] text-[color:var(--color-text-faint)] shrink-0 w-20 text-right" style={mono}>
        {e.pinned ? 'monthly' : dayMonth(e.date, locale)}
      </span>
      <span className="shrink-0 w-20 text-right text-sm">
        <Amount e={e} />
      </span>
    </button>
  );
}

/** Monday-first short weekday names in the app language (5 Jan 2026 was a Monday). */
const weekdays = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => formatDate(new Date(2026, 0, 5 + i), locale, { weekday: 'short' }));

function MonthGrid({
  month,
  onSelectEntry,
}: {
  month: MonthBlock;
  onSelectEntry: (e: Entry) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const fmt = (n: number) => money(n, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const [y, mo] = month.key.split('-').map(Number); // mo = 1-12
  const first = new Date(y, mo - 1, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(y, mo, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === y && today.getMonth() === mo - 1;

  const [selectedDay, setSelectedDay] = useState<number | null>(() =>
    isThisMonth ? today.getDate() : 1
  );

  const pinned = month.entries.filter((e) => e.pinned);
  const byDay = new Map<number, Entry[]>();
  for (const e of month.entries) {
    if (e.pinned) continue;
    const day = dayOf(e.date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDayEvents = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div>
      {pinned.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {pinned.map((e, i) => {
            const meta = KIND_META[e.kind];
            return (
              <button
                type="button"
                key={i}
                onClick={() => onSelectEntry(e)}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border hover:brightness-110 transition-all cursor-pointer text-left"
                style={{
                  ...mono,
                  color: meta.color,
                  borderColor: `color-mix(in srgb, ${meta.color} 40%, transparent)`,
                  background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
                }}
              >
                {meta.icon} {e.label}
                {e.amount != null && (
                  <b>
                    {' '}
                    {fmt(e.amount)}
                    {t('cal.perMo')}
                  </b>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1">
        {weekdays(locale).map((w) => (
          <div
            key={w}
            className="text-[11px] text-[color:var(--color-text-faint)] text-center pb-1"
            style={mono}
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const events = day ? byDay.get(day) ?? [] : [];
          const isToday = isThisMonth && day === today.getDate();
          const isSelected = selectedDay === day;
          return (
            <div
              key={i}
              onClick={() => day && setSelectedDay(day)}
              className={cn(
                'min-h-[58px] sm:min-h-[78px] rounded-lg border p-1 sm:p-1.5 flex flex-col gap-1 transition-all',
                day
                  ? 'bg-[color:var(--color-surface)] border-[color:var(--color-border)] cursor-pointer hover:border-[color:var(--color-border-light)]'
                  : 'border-transparent pointer-events-none',
                isSelected && 'ring-1 ring-[color:var(--color-accent)] border-[color:var(--color-accent)]',
                isToday && !isSelected && 'border-[color:var(--color-accent)]/50'
              )}
            >
              {day && (
                <span
                  className={cn(
                    'text-[11px] font-semibold',
                    isToday ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'
                  )}
                  style={mono}
                >
                  {day}
                </span>
              )}

              {/* Phone dots (sm:hidden) */}
              <div className="flex flex-wrap gap-1 sm:hidden">
                {events.map((e, j) => {
                  const meta = KIND_META[e.kind];
                  return (
                    <span
                      key={j}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: meta.color }}
                      title={`${e.label} · ${e.sub}`}
                    />
                  );
                })}
              </div>

              {/* Desktop chips (hidden sm:flex) */}
              <div className="hidden sm:flex flex-col gap-1">
                {events.map((e, j) => {
                  const meta = KIND_META[e.kind];
                  return (
                    <button
                      type="button"
                      key={j}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEntry(e);
                      }}
                      title={`${e.label} · ${e.sub}${e.amount != null ? ` · ${fmt(e.amount)}` : ''}`}
                      className="text-[11px] leading-tight px-1.5 py-1 rounded truncate text-left cursor-pointer hover:brightness-125 transition-all"
                      style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                    >
                      {e.amount != null && <b>{e.kind === 'income' ? '+' : ''}{fmt(e.amount)} </b>}
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day events list on phone (#356: dots + day list under grid) */}
      {selectedDay != null && (
        <div className="sm:hidden mt-4 pt-3 border-t border-[color:var(--color-border)]">
          <h3 className="text-xs font-semibold text-[color:var(--color-text-dim)] mb-2" style={mono}>
            {dayMonth(`${month.key}-${String(selectedDay).padStart(2, '0')}`, locale)}
          </h3>
          {selectedDayEvents.length === 0 ? (
            <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">{t('cal.nothingScheduled')}</p>
          ) : (
            <div className="space-y-1.5">
              {selectedDayEvents.map((e, idx) => (
                <EntryRow key={idx} e={e} onClick={() => onSelectEntry(e)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventDetailModal({
  entry,
  onClose,
}: {
  entry: Entry | null;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!entry) return null;

  const d = entry.details;
  const meta = KIND_META[entry.kind];
  const fmt = (n: number) => money(n, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function copyText(val: string) {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleMarkPaid() {
    if (!d?.id) return;
    startTransition(async () => {
      await markBillPaid(d.id!);
      setActionDone(t('cal.paidOk'));
      router.refresh();
    });
  }

  function handleReviewSub() {
    if (!d?.id) return;
    startTransition(async () => {
      await reviewSubscription(d.id!);
      setActionDone(t('cal.reviewedOk'));
      router.refresh();
    });
  }

  return (
    <Modal open={!!entry} onClose={onClose} title={d?.title || entry.label} size="sm">
      <div className="space-y-4 pt-1">
        {/* Header summary: Badge + Amount */}
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
            style={{
              color: meta.color,
              background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
            }}
          >
            {meta.icon}
            {t(meta.labelKey as TKey)}
          </span>
          {entry.amount != null && (
            <div className="text-right">
              <span className={cn('text-lg font-bold', entry.kind === 'income' && 'text-[color:var(--color-accent)]')} style={display}>
                {entry.kind === 'income' ? '+' : ''}
                {fmt(entry.amount)}
              </span>
              {d?.billingCycle && (
                <span className="block text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                  {t(`sub.${d.billingCycle}` as TKey)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action feedback */}
        {actionDone && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] text-xs font-medium">
            <CheckCircle2 size={16} />
            {actionDone}
          </div>
        )}

        {/* Detailed Metadata Fields */}
        <div className="bg-[color:var(--color-surface-2)]/60 rounded-xl p-3 border border-[color:var(--color-border)] space-y-2 text-xs">
          {d?.provider && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('ex.vendor')}</span>
              <span className="font-medium text-[color:var(--color-text)]">{d.provider}</span>
            </div>
          )}
          {d?.nextRenewal && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('cal.lblSubscription')}</span>
              <span className="font-medium text-[color:var(--color-text)]" style={mono}>
                {formatDate(d.nextRenewal, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                {d.daysUntil != null && (
                  <span className="ml-1 text-[color:var(--color-text-faint)]">
                    ({d.daysUntil >= 0 ? t('cal.daysLeft', { n: d.daysUntil }) : t('cal.daysOverdue', { n: Math.abs(d.daysUntil) })})
                  </span>
                )}
              </span>
            </div>
          )}
          {d?.dueDate && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('cal.lblBill')}</span>
              <span className="font-medium text-[color:var(--color-text)]" style={mono}>
                {formatDate(d.dueDate, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
          )}
          {d?.paymentMethod && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('nav.statements')}</span>
              <span className="font-medium text-[color:var(--color-text)]">{d.paymentMethod}</span>
            </div>
          )}
          {d?.startDate && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Start</span>
              <span className="font-medium text-[color:var(--color-text)]" style={mono}>
                {formatDate(d.startDate, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
          )}
          {d?.trialEndsAt && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('alert.trials')}</span>
              <span className="font-medium text-[color:var(--color-purple)]" style={mono}>
                {formatDate(d.trialEndsAt, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
          )}
          {d?.space && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Space</span>
              <span className="font-medium text-[color:var(--color-text)]">{d.space}</span>
            </div>
          )}
          {d?.store && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Store</span>
              <span className="font-medium text-[color:var(--color-text)]">{d.store}</span>
            </div>
          )}
          {d?.purchaseDate && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Purchased</span>
              <span className="font-medium text-[color:var(--color-text)]" style={mono}>
                {formatDate(d.purchaseDate, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
          )}
          {d?.warrantyEnd && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">{t('alert.warranty')}</span>
              <span className="font-medium text-[color:var(--color-cyan)]" style={mono}>
                {formatDate(d.warrantyEnd, locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
          )}
          {d?.code && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Code</span>
              <span className="font-bold text-[color:var(--color-gold)] font-mono text-sm">
                {d.code}
              </span>
            </div>
          )}
          {d?.targetAmount != null && (
            <div className="flex justify-between items-center">
              <span className="text-[color:var(--color-text-dim)]">Progress</span>
              <span className="font-medium text-[color:var(--color-accent)]" style={mono}>
                {fmt(d.savedAmount || 0)} / {fmt(d.targetAmount)}
              </span>
            </div>
          )}
          {d?.notes && (
            <div className="pt-1 border-t border-[color:var(--color-border)]">
              <p className="text-[11px] text-[color:var(--color-text-dim)] italic">{d.notes}</p>
            </div>
          )}
          {d?.url && (
            <div className="pt-1">
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[color:var(--color-accent)] hover:underline"
              >
                Website <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>

        {/* Installment plan details breakdown */}
        {d?.plans && d.plans.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-semibold text-[color:var(--color-text-dim)]" style={mono}>
              {t('cal.lblInstallments')}
            </h4>
            <div className="space-y-1">
              {d.plans.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)]">
                  <div>
                    <p className="font-medium">{p.merchant || p.cardName || 'Plan'}</p>
                    <p className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                      {p.cardName ? `${p.cardName} · ` : ''}Installment {p.planIndex} of {p.totalInstallments}
                    </p>
                  </div>
                  <span className="font-semibold" style={mono}>{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-border)]">
          <div className="flex items-center gap-1.5">
            {d?.code && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyText(d.code!)}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? t('cal.copied') : t('cal.copyCode')}
              </Button>
            )}
            {entry.amount != null && !d?.code && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyText(String(entry.amount))}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? t('cal.copied') : t('cal.copyAmount')}
              </Button>
            )}
            {entry.kind === 'payable' && !d?.paid && !actionDone && (
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={handleMarkPaid}
              >
                {t('cal.markPaid')}
              </Button>
            )}
            {entry.kind === 'renewal' && !actionDone && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={handleReviewSub}
              >
                {t('cal.markReviewed')}
              </Button>
            )}
          </div>

          {d?.editUrl && (
            <Link
              href={d.editUrl}
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors ml-auto"
            >
              Open <ExternalLink size={12} />
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function CalendarClient({ months, dueThisMonth }: { months: MonthBlock[]; dueThisMonth: number }) {
  const money = useMoney();
  const fmt = (n: number) => money(n, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const t = useT();
  const [view, setView] = useState<View>('month');
  const [monthIdx, setMonthIdx] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? (window.localStorage.getItem('calendarView') as View | null) : null;
    if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
  }, []);
  function go(v: View) {
    setView(v);
    try {
      window.localStorage.setItem('calendarView', v);
    } catch {
      /* private mode */
    }
  }

  const empty = months.every((m) => m.entries.length === 0);
  const m = months[monthIdx];

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.calendar')} count={t('cal.next3')}>
        <HeaderStat label={t('cal.dueThisMonth')} value={fmt(dueThisMonth)} color="var(--color-gold)" />
        <ViewToggle
          value={view}
          onChange={go}
          options={VIEWS.map((v) => ({ value: v.id, icon: v.icon, title: t(`cal.${v.id}` as TKey) }))}
        />
      </PageHeader>

      {empty ? (
        <EmptyState icon={<CalendarDays />} title={t('cal.empty')} />
      ) : view === 'month' ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <h2 className="text-sm font-bold" style={mono}>
                {m.label}
              </h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {m.out > 0 && (
                  <>
                    {t('cal.out')} <span className="text-[color:var(--color-red)]">{fmt(m.out)}</span>
                  </>
                )}
                {m.inc > 0 && (
                  <>
                    {' '}
                    · {t('cal.in')} <span className="text-[color:var(--color-accent)]">{fmt(m.inc)}</span>
                  </>
                )}
                {m.out === 0 && m.inc === 0 && t('cal.nothingDue')}
              </span>
            </div>
            <button
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={monthIdx >= months.length - 1}
              className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <MonthGrid month={m} onSelectEntry={setSelectedEntry} />
        </section>
      ) : (
        months.map((mb) => (
          <section key={mb.key} className="mb-6">
            <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-[color:var(--color-border)]">
              <h2 className="text-sm font-bold" style={mono}>
                {mb.label}
              </h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {mb.out > 0 && (
                  <>
                    {t('cal.out')} <span className="text-[color:var(--color-red)]">{fmt(mb.out)}</span>
                  </>
                )}
                {mb.inc > 0 && (
                  <>
                    {' '}
                    · {t('cal.in')} <span className="text-[color:var(--color-accent)]">{fmt(mb.inc)}</span>
                  </>
                )}
              </span>
            </div>
            {mb.entries.length === 0 ? (
              <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">{t('cal.nothingScheduled')}</p>
            ) : (
              <div className="space-y-1.5">
                {mb.entries.map((e, i) => (
                  <EntryRow key={i} e={e} onClick={() => setSelectedEntry(e)} />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {/* Inline Event Detail Modal (#356) */}
      <EventDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </main>
  );
}
