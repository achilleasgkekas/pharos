'use client';
import { useState, useEffect } from 'react';
import { CalendarClock, Layers, ShieldCheck, Ticket, Wallet, Banknote, CalendarDays, List, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import { cur } from '@/lib/money';
import { cn } from '@/components/ui/cn';

export type Kind = 'renewal' | 'installments' | 'bill' | 'income' | 'warranty' | 'voucher';
export type Entry = { date: string; pinned?: boolean; kind: Kind; label: string; sub: string; amount: number | null };
export type MonthBlock = { key: string; label: string; entries: Entry[]; out: number; inc: number };

const mono = { fontFamily: 'var(--font-mono)' } as const;
const display = { fontFamily: 'var(--font-display)' } as const;

const KIND_META: Record<Kind, { icon: React.ReactNode; color: string; short: string }> = {
  renewal: { icon: <CalendarClock size={15} />, color: 'var(--color-purple)', short: 'renewal' },
  installments: { icon: <Layers size={15} />, color: 'var(--color-gold)', short: 'installments' },
  bill: { icon: <Wallet size={15} />, color: 'var(--color-red)', short: 'bill' },
  income: { icon: <Banknote size={15} />, color: 'var(--color-accent)', short: 'income' },
  warranty: { icon: <ShieldCheck size={15} />, color: 'var(--color-cyan)', short: 'warranty' },
  voucher: { icon: <Ticket size={15} />, color: 'var(--color-gold)', short: 'voucher' },
};

type View = 'month' | 'agenda' | 'list';
const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'month', label: 'Month', icon: <LayoutGrid size={14} /> },
  { id: 'agenda', label: 'Agenda', icon: <CalendarDays size={14} /> },
  { id: 'list', label: 'List', icon: <List size={14} /> },
];

const fmt = (n: number) => `${cur()}${n.toLocaleString('en-GB')}`;
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Amount({ e }: { e: Entry }) {
  if (e.amount == null) return null;
  return (
    <span className={cn('font-bold', e.kind === 'income' && 'text-[color:var(--color-accent)]')} style={display}>
      {e.kind === 'income' ? '+' : ''}{fmt(e.amount)}
    </span>
  );
}

/** One agenda/list row (icon · label/sub · date · amount). */
function EntryRow({ e, showMonth }: { e: Entry; showMonth?: boolean }) {
  const meta = KIND_META[e.kind];
  return (
    <div className="flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3.5 py-2.5">
      <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{e.label}</p>
        <p className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>{e.sub}</p>
      </div>
      <span className="text-[11px] text-[color:var(--color-text-faint)] shrink-0 w-20 text-right" style={mono}>
        {e.pinned ? 'monthly' : showMonth ? new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : dayMonth(e.date)}
      </span>
      <span className="shrink-0 w-20 text-right text-sm">
        <Amount e={e} />
      </span>
    </div>
  );
}

// ── Month grid ──────────────────────────────────────────────────────────────
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthGrid({ month }: { month: MonthBlock }) {
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
    const day = new Date(e.date).getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {pinned.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {pinned.map((e, i) => {
            const meta = KIND_META[e.kind];
            return (
              <span key={i} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border" style={{ ...mono, color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 40%, transparent)`, background: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}>
                {meta.icon} {e.label}{e.amount != null && <b> {fmt(e.amount)}/mo</b>}
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider text-center pb-1" style={mono}>
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const events = day ? byDay.get(day) ?? [] : [];
          const isToday = isThisMonth && day === today.getDate();
          return (
            <div
              key={i}
              className={cn(
                'min-h-[78px] rounded-lg border p-1.5 flex flex-col gap-1',
                day ? 'bg-[color:var(--color-surface)] border-[color:var(--color-border)]' : 'border-transparent',
                isToday && 'ring-1 ring-[color:var(--color-accent)] border-[color:var(--color-accent)]'
              )}
            >
              {day && (
                <span className={cn('text-[11px] font-semibold', isToday ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]')} style={mono}>
                  {day}
                </span>
              )}
              {events.map((e, j) => {
                const meta = KIND_META[e.kind];
                return (
                  <span
                    key={j}
                    title={`${e.label} · ${e.sub}${e.amount != null ? ` · ${fmt(e.amount)}` : ''}`}
                    className="text-[10px] leading-tight px-1.5 py-1 rounded truncate"
                    style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                  >
                    {e.amount != null && <b>{e.kind === 'income' ? '+' : ''}{fmt(e.amount)} </b>}
                    {e.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarClient({ months, dueThisMonth }: { months: MonthBlock[]; dueThisMonth: number }) {
  const [view, setView] = useState<View>('month');
  const [monthIdx, setMonthIdx] = useState(0);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? (window.localStorage.getItem('calendarView') as View | null) : null;
    if (saved && VIEWS.some((v) => v.id === saved)) setView(saved);
  }, []);
  function go(v: View) {
    setView(v);
    try { window.localStorage.setItem('calendarView', v); } catch { /* private mode */ }
  }

  const empty = months.every((m) => m.entries.length === 0);
  const m = months[monthIdx];
  // Flat chronological list (List view): every dated entry across the window.
  const flat = months.flatMap((mb) => mb.entries.filter((e) => !e.pinned)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recurringPinned = months[0].entries.filter((e) => e.pinned);

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={display}>
          Calendar
          <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={mono}>next 3 months</span>
        </h1>
        <span className="text-xs text-[color:var(--color-text-dim)]" style={mono}>
          due this month <span className="text-[color:var(--color-gold)] font-bold">{fmt(dueThisMonth)}</span>
        </span>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1.5 mb-5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => go(v.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              view === v.id
                ? 'bg-[color:var(--color-accent)] text-black'
                : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
          >
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 text-center text-sm text-[color:var(--color-text-dim)]">
          Nothing scheduled — renewals, installments, recurring bills and expiries will show up here.
        </div>
      ) : view === 'month' ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} disabled={monthIdx === 0} className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <h2 className="text-sm font-bold uppercase tracking-[0.1em]" style={mono}>{m.label}</h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {m.out > 0 && <>out <span className="text-[color:var(--color-red)]">{fmt(m.out)}</span></>}
                {m.inc > 0 && <> · in <span className="text-[color:var(--color-accent)]">{fmt(m.inc)}</span></>}
                {m.out === 0 && m.inc === 0 && 'nothing due'}
              </span>
            </div>
            <button onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} disabled={monthIdx >= months.length - 1} className="p-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
          <MonthGrid month={m} />
        </section>
      ) : view === 'agenda' ? (
        months.map((mb) => (
          <section key={mb.key} className="mb-6">
            <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-[color:var(--color-border)]">
              <h2 className="text-sm font-bold uppercase tracking-[0.1em]" style={mono}>{mb.label}</h2>
              <span className="text-[11px] text-[color:var(--color-text-faint)]" style={mono}>
                {mb.out > 0 && <>out <span className="text-[color:var(--color-red)]">{fmt(mb.out)}</span></>}
                {mb.inc > 0 && <> · in <span className="text-[color:var(--color-accent)]">{fmt(mb.inc)}</span></>}
              </span>
            </div>
            {mb.entries.length === 0 ? (
              <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">Nothing scheduled.</p>
            ) : (
              <div className="space-y-1.5">
                {mb.entries.map((e, i) => <EntryRow key={i} e={e} />)}
              </div>
            )}
          </section>
        ))
      ) : (
        <section className="space-y-1.5">
          {recurringPinned.map((e, i) => <EntryRow key={`p${i}`} e={e} />)}
          {flat.map((e, i) => <EntryRow key={i} e={e} showMonth />)}
        </section>
      )}
    </main>
  );
}
