'use client';
import { ymd } from '@/lib/calendarDay';
import { useState, useTransition, useMemo } from 'react';
import { RECURRING_CYCLES, type RecurringCycle } from '@/lib/billingCycle';
import { Trash2, Check, Undo2, Archive, ArchiveRestore, CalendarClock, RotateCw, Coins, FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PAGE_MAIN, PageHeader, HeaderStat, PrimaryAction, FilterLayout, FilterSection, FilterOptions } from '@/components/ui/PageHeader';
import { Input, controlClass } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useOpenParam } from '@/components/useOpenParam';
import { cn } from '@/components/ui/cn';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { NO_SPACE, matchesSpace, spaceFilterOptions } from '@/lib/spaceFilter';
import { cur, currencySymbol, CURRENCIES } from '@/lib/money';
import { convertToBase, deriveFxRate, formatMoney, isForeignCurrency, normalizeCurrency } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { billStatus, billDaysUntilDue, billPaidAmount, billNeedsRate, billRemaining, billPaymentState, type BillStatus } from '@/lib/bill';
import type { SerializedBill } from '@/types';
import {
  createBill, updateBill, deleteBill, setBillArchived, markBillPaid, markBillUnpaid,
  logBillPayment, removeBillPayment,
} from './actions';
import { formatDate } from '@/lib/i18n/format';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import type { TFunc, TKey } from '@/lib/i18n';

type Filter = 'open' | 'overdue' | 'part-paid' | 'paid' | 'all';
/** P9 context: the deployment's base currency + whether multi-currency is switched on at all. */
type FxCtx = { base: string; enabled: boolean };

function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}


function dueLabel(bill: SerializedBill, locale: string, t: TFunc): string {
  if (bill.paidAt) return t('bill.paidOn', { date: formatDate(bill.paidAt, locale) });
  const days = billDaysUntilDue(bill.dueDate);
  const date = formatDate(bill.dueDate, locale, undefined, '—');
  if (days === null) return date;
  if (days < 0) return `${date} · ${t('bill.daysOverdue', { n: -days })}`;
  if (days === 0) return `${date} · ${t('bill.dueToday')}`;
  return `${date} · ${t('common.inDays', { n: days })}`;
}

// The VALUES come from lib/billingCycle, so the repeat options cannot drift out of step with
// the model enum again; the labels are the shared billing-cycle strings.
const CYCLE_LABELS: Record<RecurringCycle, TKey> = {
  '': 'bill.oneOff',
  weekly: 'cyc.weekly',
  monthly: 'cyc.monthly',
  quarterly: 'cyc.quarterly',
  yearly: 'cyc.yearly',
  biennial: 'cyc.biennial',
};
const cycleLabel = (c: string | undefined | null, t: TFunc) => (c && c in CYCLE_LABELS ? t(CYCLE_LABELS[c as RecurringCycle]) : c || '');

export function BillsClient({
  bills,
  categories,
  spaces = [],
  baseCurrency = 'EUR',
  multiCurrency = false,
}: {
  bills: SerializedBill[];
  categories: string[];
  /** #14 (P68): per-property ledger tags (AppConfig.spaces). */
  spaces?: string[];
  baseCurrency?: string;
  multiCurrency?: boolean;
}) {
  const money = useMoney();
  const t = useT();
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedBill | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [spaceFilter, setSpaceFilter] = useState(''); // #146: same filter as Expenses
  const [pending, startTransition] = useTransition();

  // `/bills?open=<id>` opens that bill's edit modal — the convention every other money view
  // already follows, and what the /reports "needs an exchange rate" audit links to.
  useOpenParam((id) => {
    const found = bills.find((b) => b._id === id);
    if (found) setEditing(found);
  });

  // P61: urgency (billStatus) and payment progress are two separate axes, so a bill that is
  // half paid AND late still sorts and reads as overdue. `remaining` is what is genuinely
  // still owed, which is what the "to pay" header should total.
  // #297: `remaining` is null for a foreign bill still waiting for its exchange rate. Its
  // printed figure is not base currency, so it stays OUT of the "to pay" total and is counted
  // separately instead of being added in as if $100 were €100.
  const withStatus = useMemo(
    () =>
      bills.map((b) => ({
        b,
        status: billStatus(b.dueDate, b.paidAt),
        partPaid: billPaymentState(b, fx.base) === 'partially-paid',
        remaining: billRemaining(b, fx.base),
      })),
    [bills, fx.base]
  );

  const openBills = withStatus.filter(({ b, status }) => !b.archived && status !== 'paid');
  const overdueCount = openBills.filter(({ status }) => status === 'overdue').length;
  const partPaidCount = openBills.filter(({ partPaid }) => partPaid).length;
  const totalDue = openBills.reduce((s, { remaining }) => s + (remaining ?? 0), 0);
  const noRateCount = openBills.filter(({ remaining }) => remaining === null).length;

  const visible = useMemo(() => {
    const rows = withStatus.filter(({ b, status, partPaid }) => {
      if (!matchesSpace(b.space, spaceFilter)) return false;
      if (b.archived) return filter === 'all';
      if (filter === 'open') return status !== 'paid';
      if (filter === 'overdue') return status === 'overdue';
      if (filter === 'part-paid') return partPaid;
      if (filter === 'paid') return status === 'paid';
      return true;
    });
    // Sort: overdue → due-soon → upcoming → paid, then by due date.
    const rank: Record<BillStatus, number> = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
    return rows.sort((x, y) => {
      if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
      return new Date(x.b.dueDate || 0).getTime() - new Date(y.b.dueDate || 0).getTime();
    });
  }, [withStatus, filter, spaceFilter]);

  const markPaid = (id: string, logExpense: boolean) =>
    startTransition(async () => {
      await markBillPaid(id, { logExpense });
    });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: t('bill.fOpen') },
    { key: 'overdue', label: t('bill.fOverdue') },
    // Only worth a chip once something is actually part-paid; otherwise it is noise.
    ...(partPaidCount > 0 ? [{ key: 'part-paid' as Filter, label: t('bill.fPartPaid', { n: partPaidCount }) }] : []),
    { key: 'paid', label: t('bill.fPaid') },
    { key: 'all', label: t('common.all') },
  ];

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.bills')} count={t('bill.openCount', { n: openBills.length })}>
        {totalDue > 0 && <HeaderStat label={t('bill.toPay')} value={money(totalDue)} color="var(--color-text)" />}
        {noRateCount > 0 && <HeaderStat label="need a rate" value={noRateCount} color="var(--color-gold)" />}
        {overdueCount > 0 && <HeaderStat label={t('bill.stOverdue')} value={overdueCount} color="var(--color-red)" />}
        <PrimaryAction onClick={() => setShowCreate(true)} />
      </PageHeader>

      <FilterLayout
        active={filter !== 'open' || !!spaceFilter}
        filters={
          <div className="space-y-4">
            <FilterSection label={t('common.status')}>
              <FilterOptions value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.key, label: f.label }))} />
            </FilterSection>
            {/* #146: hidden until a space is named, like the space field on the form. */}
            {spaces.length > 0 && (
              <FilterSection label={t('ex.space')}>
                <SearchableSelect value={spaceFilter} onChange={setSpaceFilter} options={spaceFilterOptions(spaces)} labels={{ [NO_SPACE]: t('ex.spaceNone') }} placeholder={t('ex.allSpaces')} clearable size="sm" className="w-full" />
              </FilterSection>
            )}
          </div>
        }
      >
      {visible.length === 0 ? (
        <EmptyState icon={<FileText />} title={bills.length === 0 ? t('bill.empty') : t('ex.emptyFiltered')} />
      ) : (
        <div className="space-y-2">
          {visible.map(({ b, status, partPaid, remaining }) => (
            <BillRow
              key={b._id}
              bill={b}
              status={status}
              partPaid={partPaid}
              remaining={remaining}
              fx={fx}
              pending={pending}
              onOpen={() => setEditing(b)}
              onPay={() => markPaid(b._id, false)}
            />
          ))}
        </div>
      )}
      </FilterLayout>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('bill.new')} size="lg">
        <BillForm categories={categories} spaces={spaces} fx={fx} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.title} size="lg">
          <BillForm bill={editing} categories={categories} spaces={spaces} fx={fx} onSuccess={() => setEditing(null)} onCancel={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

function BillRow({
  bill,
  status,
  partPaid,
  remaining,
  fx,
  pending,
  onOpen,
  onPay,
}: {
  bill: SerializedBill;
  status: BillStatus;
  partPaid: boolean;
  /** null = a foreign bill with no exchange rate yet, so no base-currency balance (#297). */
  remaining: number | null;
  fx: FxCtx;
  pending: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  const money = useMoney();
  const t = useT();
  const locale = useLocale();
  const paidSoFar = billPaidAmount(bill.payments);
  const total = bill.amount || 0;
  // #297: no rate, no base-currency total, so neither a progress bar nor "x of y" can be drawn:
  // the headline is the printed figure in its own currency instead.
  const noRate = remaining === null;
  const printed = noRate ? formatMoney(bill.origAmount || 0, bill.currency || fx.base, locale) : '';
  const progress = partPaid && !noRate && total > 0 ? Math.min(100, Math.round((paidSoFar / total) * 100)) : 0;
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-[color:var(--color-surface)]',
        status === 'paid' ? 'border-[color:var(--color-border)] opacity-70' : 'border-[color:var(--color-border-light)]'
      )}
    >
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-faint)] flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)' }}>
            <CalendarClock size={11} /> {bill.vendor || bill.category || t('bill.fallback')}
          </p>
          {bill.cycle && (
            <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded text-[color:var(--color-text-faint)] bg-[color:var(--color-surface-2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <RotateCw size={9} /> {cycleLabel(bill.cycle, t)}
            </span>
          )}
        </div>
        <p className="font-semibold text-[color:var(--color-text)] truncate mt-0.5">{bill.title}</p>
        <p className="text-[11px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {dueLabel(bill, locale, t)}
        </p>
        {/* P61: how far along a part-paid bill is, without stealing the urgency chip. */}
        {partPaid && noRate && (
          <p className="mt-1.5 text-[10px] text-[color:var(--color-cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {money(paidSoFar)} paid so far
          </p>
        )}
        {partPaid && !noRate && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-24 rounded-full bg-[color:var(--color-surface-2)] overflow-hidden">
              <div className="h-full rounded-full bg-[color:var(--color-cyan)]" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px] text-[color:var(--color-cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('bill.partProgress', { paid: money(paidSoFar), total: money(total) })}
            </span>
          </div>
        )}
      </button>
      <div className="text-right shrink-0">
        <p className={cn('font-bold', status === 'paid' ? 'text-[color:var(--color-text-faint)]' : 'text-[color:var(--color-text)]')} style={{ fontFamily: 'var(--font-display)' }}>
          {/* The headline figure is what is still owed once instalments exist. */}
          {noRate ? printed : money(partPaid ? (remaining ?? 0) : bill.amount || 0)}
        </p>
        {noRate && status !== 'paid' && (
          <p className="text-[10px] text-[color:var(--color-gold)]" style={{ fontFamily: 'var(--font-mono)' }}>
            needs a rate · not in total
          </p>
        )}
        {partPaid && !noRate && (
          <p className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('bill.leftOf', { total: money(total) })}
          </p>
        )}
        {/* P9: what the paper actually says, when it is not the base currency. */}
        {fx.enabled && (
          <div className="mt-1 flex justify-end">
            <FxBadge doc={bill} base={fx.base} />
          </div>
        )}
        <Badge status={status} className="mt-1" />
      </div>
      {status !== 'paid' && (
        <button
          onClick={onPay}
          disabled={pending}
          title={t('bill.markPaid')}
          aria-label={t('bill.markPaid')}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-50"
        >
          <Check size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function BillForm({
  bill,
  categories,
  spaces = [],
  fx,
  onSuccess,
  onCancel,
  onDeleted,
}: {
  bill?: SerializedBill;
  categories: string[];
  spaces?: string[];
  fx: FxCtx;
  onSuccess: () => void;
  onCancel: () => void;
  onDeleted?: () => void;
}) {
  const money = useMoney();
  const t = useT();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [logExpense, setLogExpense] = useState(false);
  // P9: the form is edited in the currency the bill is PRINTED in — `amount` for an ordinary
  // bill, `origAmount` for a foreign one — so re-saving it unchanged re-resolves to the same
  // stored figure instead of converting it a second time.
  const wasForeign = isForeignCurrency(bill?.currency, fx.base);
  const [currency, setCurrency] = useState(normalizeCurrency(bill?.currency) || normalizeCurrency(fx.base) || 'EUR');
  const [fxRate, setFxRate] = useState(String(bill?.fxRate || ''));
  const [amount, setAmount] = useState(String((wasForeign ? bill?.origAmount || bill?.amount : bill?.amount) || ''));
  const [dueDate, setDueDate] = useState(bill?.dueDate ? bill.dueDate.slice(0, 10) : '');
  const foreign = fx.enabled && isForeignCurrency(currency, fx.base);

  const submit = (formData: FormData) => {
    setError('');
    startTransition(async () => {
      const r = bill ? await updateBill(bill._id, formData) : await createBill(formData);
      if (r.ok) onSuccess();
      else setError(r.error || t('common.saveFailed'));
    });
  };

  const isPaid = !!bill?.paidAt;
  // P61 — instalment state for the payment panel below the form.
  const [showPartial, setShowPartial] = useState(false);
  const paidSoFar = billPaidAmount(bill?.payments);
  const remaining = bill ? billRemaining(bill, fx.base) : 0;
  // #297: a foreign bill with no exchange rate. Its instalments are base currency and its
  // amount is not, so what is left cannot be worked out, and never settles on its own.
  const noRate = !!bill && billNeedsRate(bill, fx.base);
  const printedTotal = noRate && bill ? formatMoney(bill.origAmount || 0, bill.currency || fx.base, locale) : '';

  return (
    <div className="space-y-5">
      <form action={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t('bill.fTitle')} className="md:col-span-2">
          <Input name="title" defaultValue={bill?.title} placeholder={t('bill.titleHint')} required />
        </Field>
        <Field label={t('bill.fPayee')}>
          <Input name="vendor" defaultValue={bill?.vendor} placeholder={t('bill.payeeHint')} />
        </Field>
        <Field label={t('ex.fAmount', { cur: fx.enabled ? currencySymbol(currency).trim() : cur() })}>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        {fx.enabled && (
          <Field label={t('ex.fCurrency')}>
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={controlClass}
            >
              {currencyCodes(fx.base).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        {foreign && (
          <div className="md:col-span-2">
            <BillFxFields amount={amount} currency={currency} fxRate={fxRate} setRate={setFxRate} base={fx.base} />
          </div>
        )}
        {/* Always submitted so the server can clear a rate that no longer applies. */}
        {fx.enabled && <input type="hidden" name="fxRate" value={foreign ? fxRate : ''} />}
        <Field label={t('bill.fDue')}>
          <DateInput name="dueDate" value={dueDate} onValueChange={setDueDate} required />
        </Field>
        <Field label={t('bill.fRepeat')}>
          <select name="cycle" defaultValue={bill?.cycle || ''} className={controlClass}>
            {RECURRING_CYCLES.map((c) => (
              <option key={c} value={c}>{t(CYCLE_LABELS[c])}</option>
            ))}
          </select>
        </Field>
        <Field label={t('common.category')}>
          <Input name="category" defaultValue={bill?.category || 'other'} list="bill-categories" placeholder={t('bill.categoryHint')} />
          <datalist id="bill-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {/* #14 (P68): which property this bill belongs to. Hidden until a space is named in
            Settings, like the Expenses/Receipts/Subscriptions forms; while hidden nothing is
            submitted, so an existing tag is never wiped. */}
        {spaces.length > 0 && (
          <Field label={t('ex.space')}>
            <Input name="space" defaultValue={bill?.space || ''} list="bill-spaces" placeholder="—" maxLength={40} />
            <datalist id="bill-spaces">
              {spaces.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label={t('v.fNotes')} className="md:col-span-2">
          <Input name="notes" defaultValue={bill?.notes} placeholder={t('common.optional')} />
        </Field>
        {error && <p className="md:col-span-2 text-xs text-[color:var(--color-red)]">{error}</p>}
        {/* Footer like every other form (#351): record actions on the left, Cancel and the
            primary action on the right. */}
        <div className="md:col-span-2 flex items-center justify-between gap-2 flex-wrap pt-1">
          {bill && onDeleted ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await setBillArchived(bill._id, !bill.archived);
                    onDeleted();
                  })
                }
                className="text-xs px-2 py-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {bill.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {bill.archived ? t('bill.reopen') : t('common.archive')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({ title: t('bill.deleteTitle'), message: t('bill.deleteBody', { title: bill.title }), confirmLabel: t('common.delete'), danger: true });
                  if (ok) startTransition(async () => { await deleteBill(bill._id); onDeleted(); });
                }}
                className="text-xs px-2 py-1.5 rounded-lg text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Trash2 size={13} /> {t('common.delete')}
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="ghost" onClick={onCancel}>
              <X size={14} /> {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Check size={14} /> {bill ? t('common.save') : t('bill.add')}
            </Button>
          </div>
        </div>
      </form>

      {bill && (
        <div className="pt-4 border-t border-[color:var(--color-border)] space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('bill.payment')}
          </p>
          {isPaid ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[color:var(--color-accent)]">
                {t('bill.paidDate', { date: formatDate(bill.paidAt, locale) })}
                {bill.linkedExpenseId && ` · ${t('bill.loggedAsExpense')}`}
              </span>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { await markBillUnpaid(bill._id); onDeleted?.(); })}>
                <Undo2 size={14} /> {t('common.undo')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* P61: what has already been handed over, when anything has. */}
              {paidSoFar > 0 && (
                <div className="rounded-lg border border-[color:var(--color-cyan)]/30 bg-[color:var(--color-surface-2)] p-3 space-y-2">
                  <p className="text-sm">
                    <span className="text-[color:var(--color-cyan)] font-semibold">{money(paidSoFar)}</span>
                    {remaining === null ? (
                      <span className="text-[color:var(--color-text-dim)]"> paid toward {printedTotal}</span>
                    ) : (
                      <>
                        <span className="text-[color:var(--color-text-dim)]"> {t('bill.paidOf', { total: money(bill.amount || 0) })} · </span>
                        <span className="text-[color:var(--color-text)] font-semibold">{t('bill.left', { amount: money(remaining) })}</span>
                      </>
                    )}
                  </p>
                  <ul className="space-y-1">
                    {(bill.payments || []).map((p) => (
                      <li key={p._id} className="flex items-center gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="text-[color:var(--color-text)] w-20">{money(p.amount || 0)}</span>
                        <span className="text-[color:var(--color-text-dim)]">
                          {formatDate(p.date, locale)}
                        </span>
                        {p.note && <span className="text-[color:var(--color-text-faint)] truncate">· {p.note}</span>}
                        {p.expenseId && <span className="text-[color:var(--color-text-faint)]">· {t('bill.expensed')}</span>}
                        <button
                          type="button"
                          title={t('bill.removePayment')}
                          aria-label={t('bill.removePayment')}
                          disabled={pending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('bill.removePaymentTitle'),
                              message: t('bill.removePaymentBody', { amount: money(p.amount || 0) }),
                              confirmLabel: t('common.remove'),
                              danger: true,
                            });
                            if (ok) startTransition(async () => { await removeBillPayment(bill._id, p._id); onDeleted?.(); });
                          }}
                          className="ml-auto text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50"
                        >
                          <Trash2 size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {noRate && (
                <p className="text-[11px] text-[color:var(--color-gold)]">
                  ⚠ No exchange rate yet, so what is left in {fx.base} is unknown: this bill is kept out of the
                  &quot;to pay&quot; total and your payments will not mark it paid on their own. Add its exchange rate to fix both.
                  {paidSoFar > 0 && ' Until then, "Pay the rest" cannot log the final payment as an expense.'}
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer">
                <input type="checkbox" checked={logExpense} onChange={(e) => setLogExpense(e.target.checked)} />
                {t('bill.alsoLog')}
              </label>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="primary"
                  disabled={pending}
                  onClick={() => startTransition(async () => { await markBillPaid(bill._id, { logExpense }); onDeleted?.(); })}
                >
                  <Check size={14} /> {paidSoFar > 0 ? (remaining === null ? 'Pay the rest' : t('bill.payRest', { amount: money(remaining) })) : t('bill.markPaid')}
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => setShowPartial((v) => !v)}>
                  <Coins size={14} /> {showPartial ? t('common.cancel') : t('bill.logPartial')}
                </Button>
              </div>

              {showPartial && (
                <PartialPaymentForm
                  billId={bill._id}
                  remaining={remaining}
                  logExpense={logExpense}
                  foreignBill={isForeignCurrency(bill.currency, fx.base) && fx.enabled}
                  base={fx.base}
                  onDone={() => { setShowPartial(false); onDeleted?.(); }}
                />
              )}

              {bill.cycle && (
                <p className="text-[11px] text-[color:var(--color-text-faint)]">
                  {t('bill.nextInstance', { cycle: cycleLabel(bill.cycle, t).toLowerCase() })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * P61 — log one instalment toward a bill. Deliberately a SECOND action next to "Mark paid",
 * never a replacement: a bill you settle in one go should still be one click.
 *
 * The amount is entered in the deployment's BASE currency, the same denomination as the
 * stored bill amount, which is what keeps "what is left" plain subtraction. For a foreign
 * bill that is worth saying out loud, hence the hint.
 */
function PartialPaymentForm({
  billId,
  remaining,
  logExpense,
  foreignBill,
  base,
  onDone,
}: {
  billId: string;
  /** null = unknown until the bill gets its exchange rate (#297). */
  remaining: number | null;
  logExpense: boolean;
  foreignBill: boolean;
  base: string;
  onDone: () => void;
}) {
  const money = useMoney();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState('');
  // `ymd`, not `toISOString().slice(0, 10)`: the latter is UTC, so in Athens every payment
  // logged before 03:00 defaulted to YESTERDAY. This runs in the browser, where the local
  // date is the one the person means by "today".
  const [date, setDate] = useState(ymd(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // #299: one key per opened form. A double-click (or a retry after an error) sends the same key,
  // so the server records the instalment and its expense once however many requests arrive.
  const [paymentKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2)}`
  );
  const submit = () => {
    setError('');
    startTransition(async () => {
      const r = await logBillPayment(billId, { amount: Number(amount) || 0, date, note, logExpense, key: paymentKey });
      if (r.ok) onDone();
      else setError(r.error || t('bill.logFailed'));
    });
  };

  return (
    <div className="rounded-lg border border-[color:var(--color-border-light)] bg-[color:var(--color-surface-2)] p-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label={t('ex.fAmount', { cur: cur() })}>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={remaining === null ? '0.00' : remaining.toFixed(2)} />
        </Field>
        <Field label={t('bill.fPaidOn')}>
          <DateInput value={date} onValueChange={setDate} />
        </Field>
        <Field label={t('bill.fNote')} className="col-span-2 sm:col-span-1">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('bill.noteHint')} />
        </Field>
      </div>
      {foreignBill && (
        <p className="text-[11px] text-[color:var(--color-gold)]">
          ⚠ {t('bill.foreignHint', { base })}
        </p>
      )}
      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" disabled={pending || !(Number(amount) > 0)} onClick={submit}>
          <Coins size={14} /> {t('bill.logPayment')}
        </Button>
        <p className="text-[11px] text-[color:var(--color-text-faint)]">
          {remaining === null
            ? 'Needs an exchange rate before payments can settle it.'
            : t('bill.leftHint', { amount: money(remaining) })}
        </p>
      </div>
    </div>
  );
}

/** Multi-currency (P9): shown only when the bill's currency differs from the base one.
 *  Two ways in, because someone holding a foreign invoice often knows what their bank
 *  actually debited but not the rate: type the rate, or type the debited amount and let
 *  deriveFxRate() back it out. The preview is the figure that will be stored, i.e. the one
 *  the "to pay" total and any logged expense will sum. */
function BillFxFields({
  amount,
  currency,
  fxRate,
  setRate,
  base,
}: {
  amount: string;
  currency: string;
  fxRate: string;
  setRate: (v: string) => void;
  base: string;
}) {
  const [charged, setCharged] = useState('');
  const printed = Number(amount) || 0;
  const rate = Number(fxRate) || 0;
  const t = useT();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end rounded-lg border border-[color:var(--color-purple)]/30 bg-[color:var(--color-surface-2)] p-3">
      <Field as="div" label={t('ex.fFxRate', { base, code: normalizeCurrency(currency) })}>
        <Input
          type="number"
          step="0.000001"
          value={fxRate}
          onChange={(e) => {
            setCharged('');
            setRate(e.target.value);
          }}
          placeholder="0.92"
        />
        {/* P9 phase 2: latest fixing — a bill's date is its DUE date, usually in the
            future, and the ECB only publishes up to today. */}
        <div className="mt-1">
          <FxRateButton currency={currency} onRate={(r) => { setCharged(''); setRate(String(r)); }} />
        </div>
      </Field>
      <Field label={t('ex.fFxCharged', { cur: currencySymbol(base).trim() })}>
        <Input
          type="number"
          step="0.01"
          value={charged}
          onChange={(e) => {
            const v = e.target.value;
            setCharged(v);
            const derived = deriveFxRate(printed, Number(v) || 0);
            setRate(derived ? String(derived) : '');
          }}
        />
      </Field>
      <p className="text-[11px] pb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {rate > 0 ? (
          <span className="text-[color:var(--color-purple)]">= {formatMoney(convertToBase(printed, rate), base)}</span>
        ) : (
          <span className="text-[color:var(--color-gold)]">⚠ {t('ex.fxNoRate', { base })}</span>
        )}
      </p>
    </div>
  );
}
