'use client';
import { cur } from '@/lib/money';
import { useState, useTransition, useRef, useMemo } from 'react';
import {
  Upload, Loader2, Trash2, CheckCircle2, AlertTriangle, FileText, Repeat, Wallet, Search, Plus, X, Camera, Sparkles,
  LayoutGrid, List as ListIcon, SlidersHorizontal,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CardSelect } from '@/components/CardSelect';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useOpenParam } from '@/components/useOpenParam';
import { cn } from '@/components/ui/cn';
import { shrinkImage } from '@/lib/clientImage';
import { useRouter } from 'next/navigation';
import type { SerializedExpense, SerializedCard } from '@/types';
import { uploadExpense, updateExpense, addExpense, deleteExpense, rescanExpense } from './actions';

const CYCLES = ['', 'monthly', 'quarterly', 'yearly', 'weekly'] as const;

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}
const money = (n: number) => `${cur()}${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};
type Status = 'verified' | 'parsed' | 'failed';
function statusOf(e: SerializedExpense): Status {
  if (e.verified) return 'verified';
  return (e.amount || 0) === 0 ? 'failed' : 'parsed';
}

const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5';
const selCls = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[color:var(--color-accent)]';

type Props = { kind: 'income' | 'expense'; expenses: SerializedExpense[]; cards: SerializedCard[]; vendors: string[]; ollamaUp: boolean; categories: string[] };

export function ExpensesClient({ kind, expenses, cards, vendors, ollamaUp, categories }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const isIncome = kind === 'income';
  const label = isIncome ? 'Income' : 'Expenses';

  const [selected, setSelected] = useState<SerializedExpense | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'amount-desc' | 'amount-asc' | 'vendor'>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useOpenParam((id) => {
    const found = expenses.find((e) => e._id === id);
    if (found) setSelected(found);
  });

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTotal = expenses.filter((e) => (e.period || e.date.slice(0, 7)) === monthKey).reduce((s, e) => s + (e.amount || 0), 0);
  const yearTotal = expenses.filter((e) => e.date.slice(0, 4) === String(now.getFullYear())).reduce((s, e) => s + (e.amount || 0), 0);

  const failed = useMemo(() => expenses.filter((e) => statusOf(e) === 'failed' && e.filePath), [expenses]);
  const seriesCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) if (e.vendorKey) m[e.vendorKey] = (m[e.vendorKey] || 0) + 1;
    return m;
  }, [expenses]);

  const vendorOptions = vendors;
  const anyFilter = !!(catFilter || statusFilter !== 'all' || search || sortBy !== 'recent');
  function resetFilters() { setCatFilter(''); setStatusFilter('all'); setSearch(''); setSortBy('recent'); }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = expenses.filter((e) => {
      if (catFilter && e.category !== catFilter) return false;
      if (statusFilter !== 'all' && statusOf(e) !== statusFilter) return false;
      if (q && !`${e.vendor} ${e.category} ${e.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc': return (b.amount || 0) - (a.amount || 0);
        case 'amount-asc': return (a.amount || 0) - (b.amount || 0);
        case 'vendor': return (a.vendor || '').localeCompare(b.vendor || '');
        default: return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [expenses, search, catFilter, statusFilter, sortBy]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      let f = files[i];
      setUploadMsg(`Scanning ${i + 1}/${files.length}…`);
      if (f.type.startsWith('image/')) {
        try { f = await shrinkImage(f); } catch { /* keep original */ }
      }
      const fd = new FormData();
      fd.set('file', f);
      fd.set('kind', kind);
      const r = await uploadExpense(fd);
      if (r.ok) ok++;
    }
    setUploadMsg(`Scanned ${ok}/${files.length}. Review & confirm.`);
    setUploading(false);
    router.refresh();
    setTimeout(() => setUploadMsg(null), 4000);
  }

  async function rescanAllFailed() {
    if (rescanning || failed.length === 0) return;
    setRescanning(true);
    for (const e of failed.slice(0, 20)) {
      try { await rescanExpense(e._id, true); } catch { /* continue */ }
    }
    setRescanning(false);
    router.refresh();
  }

  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder="Search vendor, notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Status</p>
        <div className="flex flex-col gap-1">
          {([['all', 'All'], ['verified', '✓ Verified'], ['parsed', '✨ Parsed'], ['failed', '⚠ Needs scan']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={cn('text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]')} style={{ fontFamily: 'var(--font-mono)' }}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Category</p>
        <SearchableSelect value={catFilter} onChange={setCatFilter} options={categories} placeholder="All categories" clearable size="sm" className="w-full" />
      </div>
      {vendorOptions.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Vendor</p>
          <SearchableSelect value={search && vendorOptions.includes(search) ? search : ''} onChange={setSearch} options={vendorOptions} placeholder="All vendors" clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Sort</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selCls} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount-desc">Amount high→low</option>
          <option value="amount-asc">Amount low→high</option>
          <option value="vendor">Vendor A→Z</option>
        </select>
      </div>
      {anyFilter && <button onClick={resetFilters} className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline" style={{ fontFamily: 'var(--font-mono)' }}>reset all filters</button>}
    </div>
  );

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {label}<span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{expenses.length}</span>
          </h1>
          <div className="flex items-center gap-4 text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-[color:var(--color-accent)] hover:opacity-80"><Plus size={13} /> add</button>
            <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
              {([['grid', <LayoutGrid key="g" size={14} />], ['list', <ListIcon key="l" size={14} />]] as const).map(([v, icon]) => (
                <button key={v} onClick={() => setLayout(v)} className={cn('px-2 py-1 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}>{icon}</button>
              ))}
            </div>
            {failed.length > 0 && (
              <button onClick={rescanAllFailed} disabled={rescanning} className="text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)] disabled:opacity-60" title="Re-scan empty records (amount 0) with OCR">
                {rescanning ? 'Re-scanning…' : `${failed.length} failed · re-scan all (OCR)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>This month</p>
          <p className={cn('text-2xl font-bold', isIncome ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-gold)]')} style={{ fontFamily: 'var(--font-display)' }}>{money(monthTotal)}</p>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>This year</p>
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{money(yearTotal)}</p>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn('border-2 border-dashed rounded-2xl p-8 mb-6 text-center cursor-pointer transition-all', dragOver ? 'border-[color:var(--color-accent)] bg-[#00ff8808]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]', uploading && 'pointer-events-none opacity-70')}
      >
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-[color:var(--color-cyan)]"><Loader2 size={28} className="animate-spin" /><p className="text-sm">{uploadMsg}</p></div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[color:var(--color-text-dim)]">
            <Upload size={28} />
            <p className="text-sm font-medium text-[color:var(--color-text)]">Drop a bill / {isIncome ? 'payslip' : 'invoice'} here or click</p>
            <p className="text-xs text-[color:var(--color-text-faint)]">{ollamaUp ? 'PDF/JPG/PNG · AI reads vendor, amount, date' : 'PDF/JPG/PNG · manual entry (AI offline)'}</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }} className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"><Camera size={14} /> Take photo</button>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {/* E-shop body */}
      <div className="flex gap-6 items-start">
        <aside className="hidden lg:block w-56 shrink-0 sticky top-4 self-start">{filterControls}</aside>
        <div className="flex-1 min-w-0">
          <div className="lg:hidden mb-4">
            <button onClick={() => setShowFilters((v) => !v)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <SlidersHorizontal size={14} /> Filters {anyFilter && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>}
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {visible.length} {visible.length === 1 ? 'record' : 'records'}{visible.length !== expenses.length ? ` / ${expenses.length}` : ''}
            </span>
          </div>
          {visible.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">{isIncome ? '💶' : '🧾'}</p>
              <p className="text-sm">{expenses.length === 0 ? `No ${label.toLowerCase()} yet. Drop a file above or add one.` : 'Nothing matches these filters.'}</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visible.map((e) => <ExpenseCard key={e._id} expense={e} isIncome={isIncome} series={e.vendorKey ? seriesCount[e.vendorKey] || 1 : 1} onClick={() => setSelected(e)} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((e) => <ExpenseRow key={e._id} expense={e} isIncome={isIncome} series={e.vendorKey ? seriesCount[e.vendorKey] || 1 : 1} onClick={() => setSelected(e)} />)}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ExpenseDetail expense={selected} cards={cards} vendors={vendors} categories={categories} seriesCount={selected.vendorKey ? seriesCount[selected.vendorKey] || 1 : 1} onClose={() => setSelected(null)} onChanged={() => router.refresh()} confirm={confirm} />
      )}
      {creating && <ExpenseCreate kind={kind} cards={cards} vendors={vendors} categories={categories} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); router.refresh(); }} />}
    </main>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'verified') return <CheckCircle2 size={16} className="text-[color:var(--color-accent)]" />;
  if (status === 'parsed') return <Sparkles size={15} className="text-[color:var(--color-cyan)]" />;
  return <AlertTriangle size={15} className="text-[color:var(--color-gold)]" />;
}

function Thumb({ expense }: { expense: SerializedExpense }) {
  const isImage = !!expense.fileType && expense.fileType.startsWith('image/');
  const thumb = isImage ? expense.filePath : expense.thumbPath;
  return (
    <div className="w-11 h-11 rounded-lg bg-[color:var(--color-surface-2)] overflow-hidden shrink-0 grid place-items-center text-[color:var(--color-text-faint)]">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(thumb)} alt={expense.vendor} loading="lazy" className="w-full h-full object-cover object-top" />
      ) : expense.filePath ? <FileText size={18} /> : <Wallet size={18} />}
    </div>
  );
}

function ExpenseRow({ expense, isIncome, series, onClick }: { expense: SerializedExpense; isIncome: boolean; series: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3 py-2.5 text-left hover:border-[color:var(--color-border-light)] transition-all">
      <Thumb expense={expense} />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-sm truncate block" style={{ fontFamily: 'var(--font-display)' }}>{expense.vendor || 'Unknown'}</span>
        <span className="text-[10px] text-[color:var(--color-text-faint)] block mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {fmtDate(expense.date)} · {expense.category}{expense.recurring ? ' · recurring' : ''}{series > 1 ? ` · ×${series}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <AnomalyBadge anomaly={expense.anomaly} />
        {expense.recurring && <Repeat size={13} className="text-[color:var(--color-purple)]" />}
        <span className={cn('font-extrabold text-base leading-none', isIncome ? 'text-[color:var(--color-accent)]' : '')} style={{ fontFamily: 'var(--font-display)' }}>{money(expense.amount)}</span>
        <StatusIcon status={statusOf(expense)} />
      </div>
    </button>
  );
}

function ExpenseCard({ expense, isIncome, series, onClick }: { expense: SerializedExpense; isIncome: boolean; series: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 hover:border-[color:var(--color-accent)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Thumb expense={expense} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{expense.vendor || 'Unknown'}</p>
            <p className="text-[11px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>{expense.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <AnomalyBadge anomaly={expense.anomaly} />
          {expense.recurring && <Repeat size={13} className="text-[color:var(--color-purple)]" />}
          <StatusIcon status={statusOf(expense)} />
        </div>
      </div>
      <p className={cn('text-xl font-bold mt-2', isIncome ? 'text-[color:var(--color-accent)]' : '')} style={{ fontFamily: 'var(--font-display)' }}>{money(expense.amount)}</p>
      <div className="flex items-center justify-between mt-1 text-[11px] text-[color:var(--color-text-faint)]">
        <span>{fmtDate(expense.date)}</span>
        <span className="flex items-center gap-2">{series > 1 && <span title="records from this vendor">×{series}</span>}{expense.filePath && <FileText size={12} />}</span>
      </div>
    </button>
  );
}

/** Gold "unusual amount" chip — % deviation from this vendor's usual (median) bill. */
function AnomalyBadge({ anomaly }: { anomaly?: number }) {
  if (anomaly == null) return null;
  return (
    <span
      title={`Unusual amount: ${anomaly > 0 ? '+' : ''}${anomaly}% vs this vendor's usual`}
      className="text-[10px] font-bold text-[color:var(--color-gold)] bg-[color:var(--color-gold)]/10 border border-[color:var(--color-gold)]/30 rounded-md px-1.5 py-0.5"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      ⚠ {anomaly > 0 ? '+' : ''}{anomaly}%
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </label>
  );
}

const selectCls = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

type FormState = Pick<SerializedExpense, 'kind' | 'vendor' | 'category' | 'currency' | 'date' | 'period' | 'recurring' | 'recurringCycle' | 'paymentMethod' | 'notes' | 'verified'> & { amount: string };

function toForm(e: SerializedExpense): FormState {
  return {
    kind: e.kind, vendor: e.vendor, category: e.category, amount: String(e.amount ?? ''), currency: e.currency || 'EUR',
    date: e.date ? e.date.slice(0, 10) : '', period: e.period, recurring: e.recurring, recurringCycle: e.recurringCycle,
    paymentMethod: e.paymentMethod, notes: e.notes, verified: e.verified,
  };
}

function FormFields({ form, set, cards, vendors, categories }: { form: FormState; set: (p: Partial<FormState>) => void; cards: SerializedCard[]; vendors: string[]; categories: string[] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor / payer">
          <SearchableSelect value={form.vendor} onChange={(v) => set({ vendor: v })} options={vendors} placeholder="ΔΕΗ, landlord…" allowCustom />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={selectCls}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label={`Amount (${cur()})`}>
          <Input type="number" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Payment">
          <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => set({ paymentMethod: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2">
          <span className="text-xs font-medium flex items-center gap-1.5"><Repeat size={13} className="text-[color:var(--color-purple)]" /> Recurring</span>
          <button type="button" role="switch" aria-checked={form.recurring} onClick={() => set({ recurring: !form.recurring })} className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', form.recurring ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]')}>
            <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', form.recurring && 'translate-x-4')} />
          </button>
        </div>
        <Field label="Cycle">
          <select value={form.recurringCycle} onChange={(e) => set({ recurringCycle: e.target.value as FormState['recurringCycle'] })} className={selectCls} disabled={!form.recurring}>
            {CYCLES.map((c) => <option key={c} value={c}>{c || '—'}</option>)}
          </select>
        </Field>
        <Field label="Period (YYYY-MM)">
          <Input value={form.period} onChange={(e) => set({ period: e.target.value })} placeholder="2026-06" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={selectCls} />
      </Field>
    </div>
  );
}

function ExpenseDetail({ expense, cards, vendors, categories, seriesCount, onClose, onChanged, confirm }: {
  expense: SerializedExpense; cards: SerializedCard[]; vendors: string[]; categories: string[]; seriesCount: number;
  onClose: () => void; onChanged: () => void; confirm: ReturnType<typeof useConfirm>;
}) {
  const [form, setForm] = useState<FormState>(toForm(expense));
  const [pending, startTransition] = useTransition();
  const [rev, setRev] = useState(0);
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const isImage = !!expense.fileType && expense.fileType.startsWith('image/');

  function save(verified = form.verified) {
    startTransition(async () => {
      await updateExpense(expense._id, { ...form, amount: Number(form.amount) || 0, verified });
      onChanged();
      onClose();
    });
  }
  function doRescan(useOcr: boolean) {
    startTransition(async () => {
      const r = await rescanExpense(expense._id, useOcr);
      if (r.ok && r.expense) { setForm(toForm(r.expense)); setRev((x) => x + 1); onChanged(); }
    });
  }
  async function doDelete() {
    const ok = await confirm({ title: 'Delete?', message: `Delete this ${expense.kind} record?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    startTransition(async () => { await deleteExpense(expense._id); onChanged(); onClose(); });
  }

  return (
    <Modal open onClose={onClose} title={expense.vendor || 'Record'} size="2xl">
      {expense.filePath && (
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[color:var(--color-border)] text-xs flex-wrap">
          <span className="text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>Re-scan:</span>
          <button onClick={() => doRescan(false)} disabled={pending} className="px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]">text</button>
          <button onClick={() => doRescan(true)} disabled={pending} className="px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)]">OCR</button>
          {pending && <Loader2 size={13} className="animate-spin" />}
          {seriesCount > 1 && <span className="ml-auto text-[color:var(--color-purple)] flex items-center gap-1"><Repeat size={12} /> {seriesCount} in this vendor series</span>}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6" key={rev}>
        <div className="order-2 md:order-1">
          {expense.filePath ? (
            isImage ? (
              <a href={fileUrl(expense.filePath)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(expense.filePath)} alt={expense.vendor} className="w-full max-h-[55vh] md:max-h-[70vh] object-contain rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]" />
              </a>
            ) : (
              <div className="space-y-2">
                <iframe src={`${fileUrl(expense.filePath)}#toolbar=0&navpanes=0`} className="w-full h-[55vh] md:h-auto md:aspect-[3/4] rounded-xl border border-[color:var(--color-border)] bg-white" title={expense.vendor} />
                <a href={fileUrl(expense.filePath)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--color-cyan)] hover:underline"><FileText size={12} /> Open in new tab</a>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-8 text-center text-xs text-[color:var(--color-text-faint)] flex items-center justify-center"><Wallet size={26} className="opacity-40" /></div>
          )}
        </div>
        <div className="order-1 md:order-2"><FormFields form={form} set={set} cards={cards} vendors={vendors} categories={categories} /></div>
      </div>
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[color:var(--color-border)] flex-wrap">
        <Button onClick={() => save(true)} disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm</Button>
        <button onClick={() => save(form.verified)} disabled={pending} className="text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)]">Save</button>
        <button onClick={doDelete} disabled={pending} className="ml-auto flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)]"><Trash2 size={13} /> Delete</button>
      </div>
    </Modal>
  );
}

function ExpenseCreate({ kind, cards, vendors, categories, onClose, onCreated }: { kind: 'income' | 'expense'; cards: SerializedCard[]; vendors: string[]; categories: string[]; onClose: () => void; onCreated: () => void }) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [form, setForm] = useState<FormState>({
    kind, vendor: '', category: kind === 'income' ? 'salary' : 'other', amount: '', currency: 'EUR', date: iso, period: '',
    recurring: false, recurringCycle: '', paymentMethod: '', notes: '', verified: true,
  });
  const [pending, startTransition] = useTransition();
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  function save() {
    startTransition(async () => { await addExpense({ ...form, amount: Number(form.amount) || 0 }); onCreated(); });
  }
  return (
    <Modal open onClose={onClose} title={`New ${kind}`} size="lg">
      <FormFields form={form} set={set} cards={cards} vendors={vendors} categories={categories} />
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[color:var(--color-border)]">
        <Button onClick={save} disabled={pending || !form.amount}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</Button>
        <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]"><X size={13} /></button>
      </div>
    </Modal>
  );
}
