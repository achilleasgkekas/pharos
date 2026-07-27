'use client';
import { useState, useTransition, useMemo } from 'react';
import { Plus, Trash2, Check, Undo2, Archive, ArchiveRestore, CalendarClock, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useOpenParam } from '@/components/useOpenParam';
import { cn } from '@/components/ui/cn';
import { cur, currencySymbol, CURRENCIES } from '@/lib/money';
import { convertToBase, deriveFxRate, formatMoney, isForeignCurrency, normalizeCurrency } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { billStatus, billDaysUntilDue, type BillStatus } from '@/lib/bill';
import type { SerializedBill } from '@/types';
import { createBill, updateBill, deleteBill, setBillArchived, markBillPaid, markBillUnpaid } from './actions';

const money = (n: number) => `${cur()}${n.toFixed(2)}`;
type Filter = 'open' | 'overdue' | 'paid' | 'all';
/** P9 context: the deployment's base currency + whether multi-currency is switched on at all. */
type FxCtx = { base: string; enabled: boolean };

function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}

const STATUS_META: Record<BillStatus, { label: string; cls: string }> = {
  overdue: { label: 'overdue', cls: 'bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]' },
  'due-soon': { label: 'due soon', cls: 'bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)]' },
  upcoming: { label: 'upcoming', cls: 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]' },
  paid: { label: 'paid', cls: 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]' },
};

function dueLabel(bill: SerializedBill): string {
  if (bill.paidAt) return `paid ${new Date(bill.paidAt).toLocaleDateString('en-GB')}`;
  const days = billDaysUntilDue(bill.dueDate);
  const date = bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('en-GB') : '—';
  if (days === null) return date;
  if (days < 0) return `${date} · ${-days}d overdue`;
  if (days === 0) return `${date} · today`;
  return `${date} · in ${days}d`;
}

export function BillsClient({
  bills,
  categories,
  baseCurrency = 'EUR',
  multiCurrency = false,
}: {
  bills: SerializedBill[];
  categories: string[];
  baseCurrency?: string;
  multiCurrency?: boolean;
}) {
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedBill | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [pending, startTransition] = useTransition();

  // `/bills?open=<id>` opens that bill's edit modal — the convention every other money view
  // already follows, and what the /reports "needs an exchange rate" audit links to.
  useOpenParam((id) => {
    const found = bills.find((b) => b._id === id);
    if (found) setEditing(found);
  });

  const withStatus = useMemo(
    () => bills.map((b) => ({ b, status: billStatus(b.dueDate, b.paidAt) })),
    [bills]
  );

  const openBills = withStatus.filter(({ b, status }) => !b.archived && status !== 'paid');
  const overdueCount = openBills.filter(({ status }) => status === 'overdue').length;
  const totalDue = openBills.reduce((s, { b }) => s + (b.amount || 0), 0);

  const visible = useMemo(() => {
    const rows = withStatus.filter(({ b, status }) => {
      if (b.archived) return filter === 'all';
      if (filter === 'open') return status !== 'paid';
      if (filter === 'overdue') return status === 'overdue';
      if (filter === 'paid') return status === 'paid';
      return true;
    });
    // Sort: overdue → due-soon → upcoming → paid, then by due date.
    const rank: Record<BillStatus, number> = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
    return rows.sort((x, y) => {
      if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
      return new Date(x.b.dueDate || 0).getTime() - new Date(y.b.dueDate || 0).getTime();
    });
  }, [withStatus, filter]);

  const markPaid = (id: string, logExpense: boolean) =>
    startTransition(async () => {
      await markBillPaid(id, { logExpense });
    });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'paid', label: 'Paid' },
    { key: 'all', label: 'All' },
  ];

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Bills
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {openBills.length} open
            </span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">
            {totalDue > 0 && (
              <>
                <span className="text-[color:var(--color-text)] font-semibold">{money(totalDue)}</span> to pay
              </>
            )}
            {overdueCount > 0 && (
              <span className="ml-2 text-[color:var(--color-red)] font-semibold">· {overdueCount} overdue</span>
            )}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={2.5} /> New bill
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg border transition-colors',
              filter === f.key
                ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                : 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-4">🧾</p>
          <p className="text-sm">
            {bills.length === 0
              ? 'No bills yet. Hit + to track a bill you pay by hand (ΔΕΗ, ΟΤΕ, κοινόχρηστα), so nothing slips into overdue.'
              : 'Nothing here. Try another filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(({ b, status }) => (
            <BillRow
              key={b._id}
              bill={b}
              status={status}
              fx={fx}
              pending={pending}
              onOpen={() => setEditing(b)}
              onPay={() => markPaid(b._id, false)}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New bill" size="lg">
        <BillForm categories={categories} fx={fx} onSuccess={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.title} size="lg">
          <BillForm bill={editing} categories={categories} fx={fx} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

function BillRow({
  bill,
  status,
  fx,
  pending,
  onOpen,
  onPay,
}: {
  bill: SerializedBill;
  status: BillStatus;
  fx: FxCtx;
  pending: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border bg-[color:var(--color-surface)]',
        status === 'paid' ? 'border-[color:var(--color-border)] opacity-70' : 'border-[color:var(--color-border-light)]'
      )}
    >
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-faint)] flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)' }}>
            <CalendarClock size={11} /> {bill.vendor || bill.category || 'bill'}
          </p>
          {bill.cycle && (
            <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded text-[color:var(--color-text-faint)] bg-[color:var(--color-surface-2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <RotateCw size={9} /> {bill.cycle}
            </span>
          )}
        </div>
        <p className="font-semibold text-[color:var(--color-text)] truncate mt-0.5">{bill.title}</p>
        <p className="text-[11px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {dueLabel(bill)}
        </p>
      </button>
      <div className="text-right shrink-0">
        <p className={cn('font-bold', status === 'paid' ? 'text-[color:var(--color-text-faint)]' : 'text-[color:var(--color-text)]')} style={{ fontFamily: 'var(--font-display)' }}>
          {money(bill.amount || 0)}
        </p>
        {/* P9: what the paper actually says, when it is not the base currency. */}
        {fx.enabled && (
          <div className="mt-1 flex justify-end">
            <FxBadge doc={bill} base={fx.base} />
          </div>
        )}
        <span className={cn('inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold mt-1', meta.cls)} style={{ fontFamily: 'var(--font-mono)' }}>
          {meta.label}
        </span>
      </div>
      {status !== 'paid' && (
        <button
          onClick={onPay}
          disabled={pending}
          title="Mark paid"
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
  fx,
  onSuccess,
  onDeleted,
}: {
  bill?: SerializedBill;
  categories: string[];
  fx: FxCtx;
  onSuccess: () => void;
  onDeleted?: () => void;
}) {
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
  const foreign = fx.enabled && isForeignCurrency(currency, fx.base);

  const submit = (formData: FormData) => {
    setError('');
    startTransition(async () => {
      const r = bill ? await updateBill(bill._id, formData) : await createBill(formData);
      if (r.ok) onSuccess();
      else setError(r.error || 'Save failed');
    });
  };

  const label = 'block text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)] mb-1';
  const isPaid = !!bill?.paidAt;

  return (
    <div className="space-y-5">
      <form action={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Title</label>
          <Input name="title" defaultValue={bill?.title} placeholder="ΔΕΗ electricity" required />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Payee</label>
          <Input name="vendor" defaultValue={bill?.vendor} placeholder="ΔΕΗ" />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>
            Amount ({fx.enabled ? currencySymbol(currency).trim() : cur()})
          </label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        {fx.enabled && (
          <div>
            <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Currency</label>
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm"
            >
              {currencyCodes(fx.base).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        {foreign && (
          <div className="md:col-span-2">
            <BillFxFields amount={amount} currency={currency} fxRate={fxRate} setRate={setFxRate} base={fx.base} />
          </div>
        )}
        {/* Always submitted so the server can clear a rate that no longer applies. */}
        {fx.enabled && <input type="hidden" name="fxRate" value={foreign ? fxRate : ''} />}
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Due date</label>
          <Input name="dueDate" type="date" defaultValue={bill?.dueDate ? bill.dueDate.slice(0, 10) : ''} required />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Repeat</label>
          <select name="cycle" defaultValue={bill?.cycle || ''} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
            <option value="">One-off</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Category</label>
          <Input name="category" defaultValue={bill?.category || 'other'} list="bill-categories" placeholder="utilities" />
          <datalist id="bill-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Notes</label>
          <Input name="notes" defaultValue={bill?.notes} placeholder="optional" />
        </div>
        {error && <p className="md:col-span-2 text-xs text-[color:var(--color-red)]">{error}</p>}
        <div className="md:col-span-2 flex items-center justify-between gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {bill ? 'Save' : 'Add bill'}
          </Button>
          {bill && onDeleted && (
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
                {bill.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {bill.archived ? 'Reopen' : 'Archive'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({ title: 'Delete bill', message: `Delete "${bill.title}"? It moves to Trash.`, confirmLabel: 'Delete', danger: true });
                  if (ok) startTransition(async () => { await deleteBill(bill._id); onDeleted(); });
                }}
                className="text-xs px-2 py-1.5 rounded-lg text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </form>

      {bill && (
        <div className="pt-4 border-t border-[color:var(--color-border)] space-y-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Payment
          </p>
          {isPaid ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[color:var(--color-accent)]">
                Paid {bill.paidAt ? new Date(bill.paidAt).toLocaleDateString('en-GB') : ''}
                {bill.linkedExpenseId && ' · logged as expense'}
              </span>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { await markBillUnpaid(bill._id); onDeleted?.(); })}>
                <Undo2 size={14} /> Undo
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer">
                <input type="checkbox" checked={logExpense} onChange={(e) => setLogExpense(e.target.checked)} />
                Also log this as an expense
              </label>
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => startTransition(async () => { await markBillPaid(bill._id, { logExpense }); onDeleted?.(); })}
              >
                <Check size={14} /> Mark paid
              </Button>
              {bill.cycle && (
                <p className="text-[11px] text-[color:var(--color-text-faint)]">
                  Paying spawns the next {bill.cycle} instance automatically.
                </p>
              )}
            </div>
          )}
        </div>
      )}
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
  const label = 'block text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)] mb-1';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end rounded-lg border border-[color:var(--color-purple)]/30 bg-[color:var(--color-surface-2)] p-3">
      <div>
        <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>
          Rate ({normalizeCurrency(currency)}→{base})
        </label>
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
      </div>
      <div>
        <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>
          or charged ({currencySymbol(base).trim()})
        </label>
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
      </div>
      <p className="text-[11px] pb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {rate > 0 ? (
          <span className="text-[color:var(--color-purple)]">= {formatMoney(convertToBase(printed, rate), base)}</span>
        ) : (
          <span className="text-[color:var(--color-gold)]">⚠ no rate yet — stored as-is, not in {base}</span>
        )}
      </p>
    </div>
  );
}
