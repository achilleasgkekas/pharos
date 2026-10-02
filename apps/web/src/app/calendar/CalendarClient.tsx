'use client';
import { PAGE_MAIN, PageHeader, HeaderStat } from '@/components/ui/PageHeader';
import { useState, useTransition } from 'react';
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
import { cn } from '@/components/ui/cn';
import { formatDate } from '@/lib/i18n/format';
import { dayOf } from '@/lib/calendarDay';
import type { EntryDetails } from './details';
import { markBillPaid } from '@/app/bills/actions';
import { reviewSubscription } from '@/app/subscriptions/actions';
import { useRouter } from 'next/navigation';

// spent / earned / receipt are recorded (behind today); the rest are what is coming.
export type Kind = 'renewal' | 'installments' | 'bill' | 'payable' | 'income' | 'goal' | 'warranty' | 'voucher' | 'spent' | 'earned' | 'receipt';
const RECORDED: Kind[] = ['spent', 'earned', 'receipt'];

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

/** out = still to pay, spent = recorded expenses, rec = receipts, inc = income (recorded or expected). */
export type MonthBlock = { key: string; label: string; entries: Entry[]; out: number; inc: number; rec: number; spent: number };

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
  spent: { icon: <Wallet size={15} />, color: 'var(--color-text-dim)', labelKey: 'cal.lblSpent' },
  earned: { icon: <Banknote size={15} />, color: 'var(--color-accent)', labelKey: 'cal.lblIncome' },
  receipt: { icon: <Receipt size={15} />, color: 'var(--color-cyan)', labelKey: 'cal.lblReceipt' },
};

const isIncome = (k: Kind) => k === 'income' || k === 'earned';

/** 650 stays "650", 51.3 reads "51.30". */
const exact = (n: number): Intl.NumberFormatOptions =>
  Number.isInteger(n) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const dayMonth = (value: string, locale: string) =>
  formatDate(value, locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Amount({ e }: { e: Entry }) {
  const money = useMoney();
  const fmt = (n: number) => money(n, undefined, exact(n));
  if (e.amount == null) return null;
  return (
    <span className={cn('font-bold', isIncome(e.kind) && 'text-[color:var(--color-accent)]')} style={display}>
      {isIncome(e.kind) ? '+' : ''}
      {fmt(e.amount)}
    </span>
  );
}

/** One agenda row (icon · label/sub · date · amount). */
function EntryRow({ e, onClick }: { e: Entry; onClick: () => void }) {
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
      <span className="shrink-0 text-right text-sm">
        <Amount e={e} />
      </span>
    </button>
  );
}

/** Monday-first short weekday names in the app language (5 Jan 2026 was a Monday). */
const weekdays = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => formatDate(new Date(2026, 0, 5 + i), locale, { weekday: 'short' }));

/** Chips drawn in a day cell on a computer; the rest are counted ("+2") and listed in the panel. */
const CHIPS_PER_DAY = 3;

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
  const fmt = (n: number) => money(n, undefined, exact(n));
  const [y, mo] = month.key.split('-').map(Number); // mo = 1-12
  const first = new Date(y, mo - 1, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(y, mo, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === y && today.getMonth() === mo - 1;

  const pinned = month.entries.filter((e) => e.pinned);
  const byDay = new Map<number, Entry[]>();
  for (const e of month.entries) {
    if (e.pinned) continue;
    const day = dayOf(e.date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  // Open on today, else on the first day that has something.
  const [selectedDay, setSelectedDay] = useState<number>(() =>
    isThisMonth ? today.getDate() : [...byDay.keys()].sort((p, q) => p - q)[0] ?? 1
  );

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dayEvents = byDay.get(selectedDay) ?? [];
  const dayOut = dayEvents.filter((e) => !isIncome(e.kind)).reduce((n, e) => n + (e.amount ?? 0), 0);
  const dayIn = dayEvents.filter((e) => isIncome(e.kind)).reduce((n, e) => n + (e.amount ?? 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0">
        <div className="grid grid-cols-7 gap-1">
          {weekdays(locale).map((w) => (
            <div key={w} className="text-[11px] text-[color:var(--color-text-faint)] text-center pb-1" style={mono}>
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            const events = day ? byDay.get(day) ?? [] : [];
            const isToday = isThisMonth && day === today.getDate();
            const isSelected = selectedDay === day;
            const isPast = day != null && new Date(y, mo - 1, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            return (
              <button
                type="button"
                key={i}
                disabled={!day}
                onClick={() => day && setSelectedDay(day)}
                aria-pressed={isSelected}
                aria-label={day ? `${dayMonth(`${month.key}-${String(day).padStart(2, '0')}`, locale)}${events.length ? ` · ${events.length}` : ''}` : undefined}
                className={cn(
                  'min-h-[54px] sm:min-h-[84px] rounded-lg border p-1 sm:p-1.5 flex flex-col gap-1 text-left transition-all',
                  day
                    ? 'bg-[color:var(--color-surface)] border-[color:var(--color-border)] cursor-pointer hover:border-[color:var(--color-border-light)]'
                    : 'border-transparent pointer-events-none',
                  isPast && 'bg-[color:var(--color-surface)]/50',
                  isSelected && 'ring-1 ring-[color:var(--color-accent)] border-[color:var(--color-accent)]',
                  isToday && !isSelected && 'border-[color:var(--color-accent)]/50'
                )}
              >
                {day && (
                  <span
                    className={cn('text-[11px] font-semibold', isToday ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]')}
                    style={mono}
                  >
                    {day}
                  </span>
                )}

                {/* Phone: dots */}
                <span className="flex flex-wrap gap-1 sm:hidden">
                  {events.slice(0, 6).map((e, j) => (
                    <span key={j} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: KIND_META[e.kind].color }} />
                  ))}
                </span>

                {/* Computer: a few chips, then a count */}
                <span className="hidden sm:flex flex-col gap-1 min-w-0">
                  {events.slice(0, CHIPS_PER_DAY).map((e, j) => {
                    const meta = KIND_META[e.kind];
                    return (
                      <span
                        key={j}
                        title={`${e.label}${e.sub ? ` · ${e.sub}` : ''}${e.amount != null ? ` · ${fmt(e.amount)}` : ''}`}
                        className={cn('text-[11px] leading-tight px-1.5 py-0.5 rounded truncate', RECORDED.includes(e.kind) && 'opacity-80')}
                        style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                      >
                        {e.amount != null && <b>{isIncome(e.kind) ? '+' : ''}{fmt(e.amount)} </b>}
                        {e.label}
                      </span>
                    );
                  })}
                  {events.length > CHIPS_PER_DAY && (
                    <span className="text-[10px] text-[color:var(--color-text-faint)] px-1" style={mono}>
                      {t('cal.more', { n: events.length - CHIPS_PER_DAY })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The selected day, beside the grid on a computer and under it on a phone */}
      <aside className="min-w-0 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5 lg:sticky lg:top-20">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {formatDate(new Date(y, mo - 1, selectedDay), locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <span className="text-[11px] tabular-nums" style={mono}>
            {dayOut > 0 && <span className="text-[color:var(--color-red)]">{fmt(dayOut)}</span>}
            {dayIn > 0 && <span className="ml-2 text-[color:var(--color-accent)]">+{fmt(dayIn)}</span>}
          </span>
        </div>
        {dayEvents.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">{t('cal.nothingScheduled')}</p>
        ) : (
          <div className="space-y-1.5">
            {dayEvents.map((e, idx) => (
              <EntryRow key={idx} e={e} onClick={() => onSelectEntry(e)} />
            ))}
          </div>
        )}
        {pinned.length > 0 && (
          <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
            <p className="mb-1.5 text-[11px] text-[color:var(--color-text-faint)]" style={mono}>{t('cal.thisMonth')}</p>
            <div className="space-y-1.5">
              {pinned.map((e, idx) => (
                <EntryRow key={idx} e={e} onClick={() => onSelectEntry(e)} />
              ))}
            </div>
          </div>
        )}
      </aside>
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
  const fmt = (n: number) => money(n, undefined, exact(n));

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

export function CalendarClient({ months, dueThisMonth, currentIndex = 0 }: { months: MonthBlock[]; dueThisMonth: number; currentIndex?: number }) {
  const money = useMoney();
  const fmt = (n: number) => money(n, undefined, exact(n));
  const t = useT();
  const [monthIdx, setMonthIdx] = useState(Math.min(currentIndex, Math.max(0, months.length - 1)));
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  const empty = months.every((m) => m.entries.length === 0);
  const m = months[monthIdx];
  const past = monthIdx < currentIndex;

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.calendar')}>
        <HeaderStat label={t('cal.dueThisMonth')} value={fmt(dueThisMonth)} color="var(--color-gold)" />
      </PageHeader>

      {empty ? (
        <EmptyState icon={<CalendarDays />} title={t('cal.empty')} />
      ) : (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              aria-label={t('cal.prevMonth')}
              className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center min-w-0">
              <h2 className="text-sm font-bold" style={mono}>
                {m.label}
              </h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {[
                  m.spent > 0 && <span key="s">{t('cal.spent')} <span className="text-[color:var(--color-red)]">{fmt(m.spent)}</span></span>,
                  m.rec > 0 && <span key="r">{t('cal.receipts')} <span className="text-[color:var(--color-cyan)]">{fmt(m.rec)}</span></span>,
                  m.out > 0 && <span key="o">{t('cal.out')} <span className="text-[color:var(--color-gold)]">{fmt(m.out)}</span></span>,
                  m.inc > 0 && <span key="i">{t('cal.in')} <span className="text-[color:var(--color-accent)]">{fmt(m.inc)}</span></span>,
                ]
                  .filter(Boolean)
                  .flatMap((x, i) => (i ? [' · ', x] : [x]))}
                {m.out === 0 && m.inc === 0 && m.rec === 0 && m.spent === 0 && t(past ? 'cal.nothingRecorded' : 'cal.nothingDue')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {monthIdx !== currentIndex && (
                <button
                  onClick={() => setMonthIdx(currentIndex)}
                  className="rounded-lg px-2 py-1 text-[11px] text-[color:var(--color-cyan)] hover:bg-[color:var(--color-surface-2)]"
                  style={mono}
                >
                  {t('cal.today')}
                </button>
              )}
              <button
                onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
                disabled={monthIdx >= months.length - 1}
                aria-label={t('cal.nextMonth')}
                className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <MonthGrid key={m.key} month={m} onSelectEntry={setSelectedEntry} />
        </section>
      )}

      <EventDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </main>
  );
}
