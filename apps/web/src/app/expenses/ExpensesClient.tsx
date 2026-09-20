'use client';
import { cur, currencySymbol, CURRENCIES } from '@/lib/money';
import { isForeignCurrency, normalizeCurrency, convertToBase, deriveFxRate } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { useState, useTransition, useRef, useMemo } from 'react';
import {
  Upload, Loader2, Trash2, CheckCircle2, AlertTriangle, FileText, FileSpreadsheet, Repeat, Wallet, Search, Plus, X, Camera, Sparkles,
  LayoutGrid, List as ListIcon, SlidersHorizontal, MapPin, Users, Split as SplitIcon, Landmark, Copy, Check, Pencil, CreditCard, Gift,
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
import type { SerializedExpense, SerializedCard, GiftCardOption } from '@/types';
import { uploadExpense, updateExpense, addExpense, deleteExpense, rescanExpense, settlePerson, bulkUpdateExpenses } from './actions';
import { equalSplit, splitTotals, computeBalances, type SplitEntry } from '@/lib/split';
import { paymentSplitTotal, paymentSplitRemainder, paymentSplitsBalance, balancePaymentSplits, type PaymentSplitEntry } from '@/lib/paymentSplit';
import { RECURRING_CYCLES } from '@/lib/billingCycle';
import { TAX_CATEGORY_PRESETS } from '@/lib/taxonomies';
import { CsvImportModal } from './CsvImportModal';
import { ExpenseDuplicatesModal } from './ExpenseDuplicatesModal';
import { OpenInOneDriveButton } from '@/components/OpenInOneDriveButton';
import { useLocale, useT, useMoney } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import { formatDate, formatTime, formatDateTime, compareNames } from '@/lib/i18n/format';

const CYCLES = RECURRING_CYCLES;
// Filter sentinel for "records with no space assigned" (distinct from '' = no filter).
const NO_SPACE = '\x00none';

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}
const fmtDate = (s: string, locale: string) => formatDate(s, locale, undefined, '—');
type Status = 'verified' | 'parsed' | 'failed';
function statusOf(e: SerializedExpense): Status {
  if (e.verified) return 'verified';
  return (e.amount || 0) === 0 ? 'failed' : 'parsed';
}

const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5';
const selCls = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[color:var(--color-accent)]';

/** Multi-currency context (P9): the deployment's base currency code + whether the
 *  per-entry currency/FX controls are switched on at all. Passed as one object so the
 *  already-long prop lists below grow by a single entry. */
type FxCtx = { base: string; enabled: boolean };

type Props = { kind: 'income' | 'expense'; expenses: SerializedExpense[]; cards: SerializedCard[]; giftCards: GiftCardOption[]; vendors: string[]; ollamaUp: boolean; categories: string[]; spaces: string[]; baseCurrency: string; multiCurrency: boolean };

export function ExpensesClient({ kind, expenses, cards, giftCards, vendors, ollamaUp, categories, spaces, baseCurrency, multiCurrency }: Props) {
  const locale = useLocale();
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const router = useRouter();
  const confirm = useConfirm();
  const t = useT();
  const money = useMoney();
  const isIncome = kind === 'income';
  const label = isIncome ? t('nav.income') : t('nav.expenses');

  const [selected, setSelected] = useState<SerializedExpense | null>(null);
  const [creating, setCreating] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [findingDupes, setFindingDupes] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [spaceFilter, setSpaceFilter] = useState('');
  const [taxOnly, setTaxOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'amount-desc' | 'amount-asc' | 'vendor'>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // P78: select-mode + bulk field-edit (category only — Expense has no tags field, see
  // bulkUpdateExpenses' doc comment). Mirrors ItemsClient's selectMode/selectedIds pattern.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [applyingBulk, startBulkEdit] = useTransition();

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
  const hasSpaces = spaces.length > 0;
  const balances = useMemo(() => computeBalances(expenses), [expenses]);
  const totalOwedToYou = useMemo(() => balances.reduce((s, b) => s + b.owed, 0), [balances]);
  const anyFilter = !!(catFilter || spaceFilter || taxOnly || statusFilter !== 'all' || search || sortBy !== 'recent');
  function resetFilters() { setCatFilter(''); setSpaceFilter(''); setTaxOnly(false); setStatusFilter('all'); setSearch(''); setSortBy('recent'); }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = expenses.filter((e) => {
      if (catFilter && e.category !== catFilter) return false;
      if (spaceFilter && (spaceFilter === NO_SPACE ? !!e.space : e.space !== spaceFilter)) return false;
      if (taxOnly && !e.taxDeductible) return false;
      if (statusFilter !== 'all' && statusOf(e) !== statusFilter) return false;
      if (q && !`${e.vendor} ${e.category} ${e.notes} ${e.space}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc': return (b.amount || 0) - (a.amount || 0);
        case 'amount-asc': return (a.amount || 0) - (b.amount || 0);
        case 'vendor': return compareNames(a.vendor, b.vendor, locale);
        default: return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [expenses, search, catFilter, spaceFilter, taxOnly, statusFilter, sortBy]);

  const selectAllFiltered = () => setSelectedIds(new Set(visible.map((e) => e._id)));

  function openBulkEdit() {
    if (selectedIds.size === 0) return;
    setBulkCategory('');
    setShowBulkEdit(true);
  }
  function handleBulkEditApply() {
    if (!bulkCategory) return;
    startBulkEdit(async () => {
      const r = await bulkUpdateExpenses([...selectedIds], { category: bulkCategory }, kind);
      if (r.ok) {
        setShowBulkEdit(false);
        exitSelectMode();
        router.refresh();
      }
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      let f = files[i];
      setUploadMsg(t('ex.scanningN', { i: i + 1, n: files.length }));
      if (f.type.startsWith('image/')) {
        try { f = await shrinkImage(f); } catch { /* keep original */ }
      }
      const fd = new FormData();
      fd.set('file', f);
      fd.set('kind', kind);
      const r = await uploadExpense(fd);
      if (r.ok) ok++;
    }
    setUploadMsg(t('ex.scannedN', { ok, n: files.length }));
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
      <Input icon={<Search size={14} />} placeholder={t('ex.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.status')}</p>
        <div className="flex flex-col gap-1">
          {(['all', 'verified', 'parsed', 'failed'] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={cn('text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]')} style={{ fontFamily: 'var(--font-mono)' }}>{v === 'all' ? t('common.all') : v === 'verified' ? t('ex.stVerified') : v === 'parsed' ? t('ex.stParsed') : t('ex.stNeedsScan')}</button>
          ))}
        </div>
      </div>
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.category')}</p>
        <SearchableSelect value={catFilter} onChange={setCatFilter} options={categories} placeholder={t('sub.allCategories')} clearable size="sm" className="w-full" />
      </div>
      {hasSpaces && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.space')}</p>
          <SearchableSelect value={spaceFilter} onChange={setSpaceFilter} options={[...spaces, NO_SPACE]} labels={{ [NO_SPACE]: t('ex.spaceNone') }} placeholder={t('ex.allSpaces')} clearable size="sm" className="w-full" />
        </div>
      )}
      {!isIncome && (
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-dim)] cursor-pointer">
          <input type="checkbox" checked={taxOnly} onChange={(e) => setTaxOnly(e.target.checked)} className="accent-[color:var(--color-gold)]" />
          <Landmark size={12} className="text-[color:var(--color-gold)]" /> {t('ex.taxDeductible')}
        </label>
      )}
      {vendorOptions.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.vendor')}</p>
          <SearchableSelect value={search && vendorOptions.includes(search) ? search : ''} onChange={setSearch} options={vendorOptions} placeholder={t('ex.allVendors')} clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.sort')}</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selCls} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="recent">{t('ex.sortRecent')}</option>
          <option value="oldest">{t('ex.sortOldest')}</option>
          <option value="amount-desc">{t('ex.sortAmountDesc')}</option>
          <option value="amount-asc">{t('ex.sortAmountAsc')}</option>
          <option value="vendor">{t('ex.sortVendor')}</option>
        </select>
      </div>
      {anyFilter && <button onClick={resetFilters} className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline" style={{ fontFamily: 'var(--font-mono)' }}>{t('common.resetFilters')}</button>}
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
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-[color:var(--color-accent)] hover:opacity-80"><Plus size={13} /> {t('common.add')}</button>
            <button onClick={() => setImportingCsv(true)} className="flex items-center gap-1 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)]" title={t('csv.title')}><FileSpreadsheet size={13} /> {t('csv.button')}</button>
            <button onClick={() => setFindingDupes(true)} className="flex items-center gap-1 text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)]" title={t(isIncome ? 'exdup.titleIncome' : 'exdup.title')}><Copy size={13} /> {t('exdup.button')}</button>
            {!isIncome && balances.length > 0 && (
              <button onClick={() => setShowBalances(true)} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:opacity-80" title={t('ex.balancesTitle')}>
                <Users size={13} /> {t('ex.balancesBtn')}{totalOwedToYou > 0.009 ? ` · ${money(totalOwedToYou)}` : ''}
              </button>
            )}
            <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
              {([['grid', <LayoutGrid key="g" size={14} />], ['list', <ListIcon key="l" size={14} />]] as const).map(([v, icon]) => (
                <button key={v} onClick={() => setLayout(v)} className={cn('px-2 py-1 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}>{icon}</button>
              ))}
            </div>
            {visible.length > 0 && (
              selectMode ? (
                <>
                  {selectedIds.size > 0 && (
                    <button onClick={openBulkEdit} title={t('ex.bulkEditTitle')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] hover:opacity-80 transition-colors">
                      <Pencil size={14} /> {t('ex.editN', { n: selectedIds.size })}
                    </button>
                  )}
                  <button onClick={selectedIds.size === visible.length ? clearSelection : selectAllFiltered} className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors">
                    {selectedIds.size === visible.length ? t('common.deselectAll') : t('trash.selectAllN', { n: visible.length })}
                  </button>
                  <button onClick={exitSelectMode} className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-2">
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button onClick={() => setSelectMode(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors">
                  <Check size={14} /> {t('ex.select')}
                </button>
              )
            )}
            {failed.length > 0 && (
              <button onClick={rescanAllFailed} disabled={rescanning} className="text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)] disabled:opacity-60" title="Re-scan empty records (amount 0) with OCR">
                {rescanning ? t('ex.rescanning') : t('ex.failedRescan', { n: failed.length })}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.thisMonth')}</p>
          <p className={cn('text-2xl font-bold', isIncome ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-gold)]')} style={{ fontFamily: 'var(--font-display)' }}>{money(monthTotal)}</p>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.thisYear')}</p>
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
            <p className="text-sm font-medium text-[color:var(--color-text)]">{t('ex.dropBill', { doc: isIncome ? t('ex.payslip') : t('ex.invoice') })}</p>
            <p className="text-xs text-[color:var(--color-text-faint)]">{ollamaUp ? t('ex.aiReads') : t('ex.manualEntry')}</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }} className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"><Camera size={14} /> {t('ex.takePhoto')}</button>
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
              <SlidersHorizontal size={14} /> {t('ex.filters')} {anyFilter && <span className="text-[color:var(--color-accent)]">•</span>}
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
              <p className="text-sm">{expenses.length === 0 ? t('ex.emptyNone', { label: label.toLowerCase() }) : t('ex.emptyFiltered')}</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visible.map((e) => (
                <ExpenseCard
                  key={e._id}
                  expense={e}
                  isIncome={isIncome}
                  fx={fx}
                  series={e.vendorKey ? seriesCount[e.vendorKey] || 1 : 1}
                  onClick={() => setSelected(e)}
                  selectMode={selectMode}
                  selected={selectedIds.has(e._id)}
                  onToggleSelect={() => toggleSelect(e._id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((e) => (
                <ExpenseRow
                  key={e._id}
                  expense={e}
                  isIncome={isIncome}
                  fx={fx}
                  series={e.vendorKey ? seriesCount[e.vendorKey] || 1 : 1}
                  onClick={() => setSelected(e)}
                  selectMode={selectMode}
                  selected={selectedIds.has(e._id)}
                  onToggleSelect={() => toggleSelect(e._id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ExpenseDetail expense={selected} cards={cards} giftCards={giftCards} vendors={vendors} categories={categories} spaces={spaces} fx={fx} seriesCount={selected.vendorKey ? seriesCount[selected.vendorKey] || 1 : 1} onClose={() => setSelected(null)} onChanged={() => router.refresh()} confirm={confirm} />
      )}
      {creating && <ExpenseCreate kind={kind} cards={cards} giftCards={giftCards} vendors={vendors} categories={categories} spaces={spaces} fx={fx} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); router.refresh(); }} />}
      {importingCsv && <CsvImportModal kind={kind} fx={fx} onClose={() => setImportingCsv(false)} onImported={() => router.refresh()} />}
      {findingDupes && <ExpenseDuplicatesModal kind={kind} onClose={() => setFindingDupes(false)} />}
      {showBalances && <BalancesModal balances={balances} onClose={() => setShowBalances(false)} onChanged={() => router.refresh()} confirm={confirm} />}

      {/* P78: bulk field-edit (category) over the selected records */}
      <Modal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} title={t('ex.editN', { n: selectedIds.size })} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.bulkEditHint')}</p>
          <div>
            <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.category')}</p>
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className={selCls}>
              <option value="">{t('common.noChange')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowBulkEdit(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleBulkEditApply} disabled={applyingBulk || !bulkCategory}>
              {applyingBulk ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} {t('common.apply')}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

/** Who-owes-you overview (P35). Aggregates split shares across all expenses; each row
 *  can be settled up (marks every unsettled share for that person as paid back). */
function BalancesModal({ balances, onClose, onChanged, confirm }: {
  balances: ReturnType<typeof computeBalances>; onClose: () => void; onChanged: () => void; confirm: ReturnType<typeof useConfirm>;
}) {
  const t = useT();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const owing = balances.filter((b) => b.owed > 0.009);
  const settledUp = balances.filter((b) => b.owed <= 0.009);

  async function doSettle(name: string, amt: number) {
    const ok = await confirm({ title: t('ex.settleTitle', { name }), message: t('ex.settleBody', { name, amt: money(amt) }), confirmLabel: t('ex.splitMarkPaid') });
    if (!ok) return;
    startTransition(async () => { await settlePerson(name); onChanged(); });
  }

  return (
    <Modal open onClose={onClose} title={t('ex.balancesTitle')} size="lg">
      {owing.length === 0 && settledUp.length === 0 ? (
        <p className="text-sm text-[color:var(--color-text-faint)] py-8 text-center">{t('ex.balancesEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {owing.map((b) => (
            <div key={b.name} className="flex items-center gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>{b.name}</p>
                <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.balanceEntries', { n: b.entries })}{b.settled > 0.009 ? ` · ${t('ex.splitSettled', { amt: money(b.settled) })}` : ''}</p>
              </div>
              <span className="font-extrabold text-lg text-[color:var(--color-gold)]" style={{ fontFamily: 'var(--font-display)' }}>{money(b.owed)}</span>
              <button onClick={() => doSettle(b.name, b.owed)} disabled={pending} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] disabled:opacity-60">
                {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {t('ex.settleUp')}
              </button>
            </div>
          ))}
          {settledUp.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.balancesSettled')}</p>
              {settledUp.map((b) => (
                <div key={b.name} className="flex items-center gap-3 px-4 py-2 text-sm text-[color:var(--color-text-dim)]">
                  <span className="flex-1 truncate">{b.name}</span>
                  <CheckCircle2 size={14} className="text-[color:var(--color-accent)]" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
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

type SelectProps = { selectMode: boolean; selected: boolean; onToggleSelect: () => void };

/** Checkbox rendered by both ExpenseCard and ExpenseRow — same idiom as ItemsClient's
 *  select-mode toggle (P78/P31 shared pattern). Only visible in select-mode or once checked. */
function SelectCheckbox({ selectMode, selected, onToggleSelect }: SelectProps) {
  if (!selectMode && !selected) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      className={cn(
        'shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
        selected
          ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black'
          : 'border-[color:var(--color-border)] text-transparent hover:text-[color:var(--color-text-faint)] hover:border-[color:var(--color-accent)]'
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

function ExpenseRow({ expense, isIncome, series, fx, onClick, selectMode, selected, onToggleSelect }: { expense: SerializedExpense; isIncome: boolean; series: number; fx: FxCtx; onClick: () => void } & SelectProps) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const mainClick = selectMode ? onToggleSelect : onClick;
  return (
    <div className={cn('group flex items-center gap-3 bg-[color:var(--color-surface)] border rounded-xl px-3 py-2.5 transition-all', selected ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]')}>
      <SelectCheckbox selectMode={selectMode} selected={selected} onToggleSelect={onToggleSelect} />
      <button onClick={mainClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Thumb expense={expense} />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm truncate block" style={{ fontFamily: 'var(--font-display)' }}>{expense.vendor || t('ex.unknown')}</span>
          <span className="text-[10px] text-[color:var(--color-text-faint)] block mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {fmtDate(expense.date, locale)} · {expense.category}{expense.space ? ` · ${expense.space}` : ''}{expense.recurring ? ` · ${t('ex.recurringTag')}` : ''}{series > 1 ? ` · ×${series}` : ''}
          </span>
        </div>
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <FxBadge doc={expense} base={fx.base} />
        <SplitBadge split={expense.split} />
        <AnomalyBadge anomaly={expense.anomaly} />
        {expense.taxDeductible && <span title={t('ex.taxBadgeTitle')}><Landmark size={13} className="text-[color:var(--color-gold)]" /></span>}
        {expense.recurring && <Repeat size={13} className="text-[color:var(--color-purple)]" />}
        <span className={cn('font-extrabold text-base leading-none', isIncome ? 'text-[color:var(--color-accent)]' : '')} style={{ fontFamily: 'var(--font-display)' }}>{money(expense.amount)}</span>
        <StatusIcon status={statusOf(expense)} />
      </div>
    </div>
  );
}

function ExpenseCard({ expense, isIncome, series, fx, onClick, selectMode, selected, onToggleSelect }: { expense: SerializedExpense; isIncome: boolean; series: number; fx: FxCtx; onClick: () => void } & SelectProps) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const mainClick = selectMode ? onToggleSelect : onClick;
  return (
    <div className={cn('rounded-2xl border p-4 transition-colors', selected ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-accent)]', 'bg-[color:var(--color-surface)]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SelectCheckbox selectMode={selectMode} selected={selected} onToggleSelect={onToggleSelect} />
          <button onClick={mainClick} className="flex items-center gap-2.5 min-w-0 text-left flex-1">
            <Thumb expense={expense} />
            <div className="min-w-0">
              <p className="font-semibold truncate">{expense.vendor || t('ex.unknown')}</p>
              <p className="text-[11px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>{expense.category}</p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SplitBadge split={expense.split} />
          <AnomalyBadge anomaly={expense.anomaly} />
          {expense.taxDeductible && <span title={t('ex.taxBadgeTitle')}><Landmark size={13} className="text-[color:var(--color-gold)]" /></span>}
          {expense.recurring && <Repeat size={13} className="text-[color:var(--color-purple)]" />}
          <StatusIcon status={statusOf(expense)} />
        </div>
      </div>
      <button onClick={mainClick} className="block w-full text-left">
        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
          <p className={cn('text-xl font-bold', isIncome ? 'text-[color:var(--color-accent)]' : '')} style={{ fontFamily: 'var(--font-display)' }}>{money(expense.amount)}</p>
          <FxBadge doc={expense} base={fx.base} />
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px] text-[color:var(--color-text-faint)]">
          <span className="flex items-center gap-1.5 min-w-0">
            {fmtDate(expense.date, locale)}
            {expense.space && <span className="flex items-center gap-0.5 text-[color:var(--color-purple)] truncate" title={t('ex.fSpace')}><MapPin size={10} className="shrink-0" />{expense.space}</span>}
          </span>
          <span className="flex items-center gap-2 shrink-0">{series > 1 && <span title={t('ex.recordsFromVendor')}>×{series}</span>}{expense.filePath && <FileText size={12} />}</span>
        </div>
      </button>
    </div>
  );
}

/** Cyan chip: this expense is split — shows what's still owed to you (or ✓ when settled). */
function SplitBadge({ split }: { split?: SplitEntry[] }) {
  const money = useMoney();
  if (!split || split.length === 0) return null;
  const { owed } = splitTotals(split);
  const settledUp = owed <= 0.009;
  return (
    <span
      title={settledUp ? 'Split — settled up' : `Split — ${money(owed)} owed to you`}
      className={cn(
        'text-[10px] font-bold rounded-md px-1.5 py-0.5 flex items-center gap-1',
        settledUp
          ? 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 border border-[color:var(--color-accent)]/30'
          : 'text-[color:var(--color-cyan)] bg-[color:var(--color-cyan)]/10 border border-[color:var(--color-cyan)]/30'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <SplitIcon size={10} />{settledUp ? '✓' : money(owed)}
    </span>
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

type FormState = Pick<SerializedExpense, 'kind' | 'vendor' | 'category' | 'space' | 'taxDeductible' | 'taxCategory' | 'currency' | 'date' | 'period' | 'recurring' | 'recurringCycle' | 'paymentMethod' | 'notes' | 'verified'> & { amount: string; fxRate: string; split: SplitEntry[]; paymentSplits: PaymentSplitEntry[] };

/** The `amount` field always holds what is PRINTED on the document: the stored base-currency
 *  amount for a normal entry, `origAmount` for a foreign one. resolveFx() on the server does
 *  the conversion, so re-saving an unchanged foreign entry can never double-convert it. */
function toForm(e: SerializedExpense, base: string): FormState {
  const foreign = isForeignCurrency(e.currency, base);
  return {
    kind: e.kind, vendor: e.vendor, category: e.category, space: e.space || '', taxDeductible: e.taxDeductible, taxCategory: e.taxCategory || '',
    amount: String((foreign ? e.origAmount || e.amount : e.amount) ?? ''),
    currency: foreign ? normalizeCurrency(e.currency) : base,
    fxRate: foreign && e.fxRate ? String(e.fxRate) : '',
    date: e.date ? e.date.slice(0, 10) : '', period: e.period, recurring: e.recurring, recurringCycle: e.recurringCycle,
    paymentMethod: e.paymentMethod, notes: e.notes, verified: e.verified, split: e.split || [], paymentSplits: e.paymentSplits || [],
  };
}

function FormFields({ form, set, cards, giftCards, vendors, categories, spaces, fx }: { form: FormState; set: (p: Partial<FormState>) => void; cards: SerializedCard[]; giftCards: GiftCardOption[]; vendors: string[]; categories: string[]; spaces: string[]; fx: FxCtx }) {
  const t = useT();
  const foreign = fx.enabled && isForeignCurrency(form.currency, fx.base);
  const printedAmount = Number(form.amount) || 0;
  const rate = Number(form.fxRate) || 0;
  const baseAmount = foreign && rate > 0 ? convertToBase(printedAmount, rate) : printedAmount;
  // The base code always appears first, even if it isn't one of the 13 built-ins.
  const codes = [...new Set([normalizeCurrency(fx.base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ex.fVendor')}>
          <SearchableSelect value={form.vendor} onChange={(v) => set({ vendor: v })} options={vendors} placeholder={t('ex.fVendorPlaceholder')} allowCustom />
        </Field>
        <Field label={t('common.category')}>
          <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={selectCls}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {spaces.length > 0 && (
        <Field label={t('ex.fSpace')}>
          <SearchableSelect value={form.space} onChange={(v) => set({ space: v })} options={spaces} placeholder={t('ex.spaceNone')} allowCustom clearable />
        </Field>
      )}
      <div className={cn('grid grid-cols-2 gap-3', fx.enabled ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <Field label={t('ex.fAmount', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
        </Field>
        {fx.enabled && (
          <Field label={t('ex.fCurrency')}>
            <select value={form.currency} onChange={(e) => set({ currency: e.target.value })} className={selectCls}>
              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('ex.fDate')}>
          <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label={t('sub.fPayment')}>
          <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => set({ paymentMethod: v })} />
        </Field>
      </div>
      {foreign && <FxFields form={form} set={set} base={fx.base} />}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2">
          <span className="text-xs font-medium flex items-center gap-1.5"><Repeat size={13} className="text-[color:var(--color-purple)]" /> {t('ex.recurring')}</span>
          <button type="button" role="switch" aria-checked={form.recurring} onClick={() => set({ recurring: !form.recurring })} className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', form.recurring ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]')}>
            <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', form.recurring && 'translate-x-4')} />
          </button>
        </div>
        <Field label={t('ex.fCycle')}>
          <select value={form.recurringCycle} onChange={(e) => set({ recurringCycle: e.target.value as FormState['recurringCycle'] })} className={selectCls} disabled={!form.recurring}>
            {CYCLES.map((c) => <option key={c} value={c}>{c ? t(`cyc.${c}` as TKey) : '—'}</option>)}
          </select>
        </Field>
        <Field label={t('ex.fPeriod')}>
          <Input value={form.period} onChange={(e) => set({ period: e.target.value })} placeholder="2026-06" />
        </Field>
      </div>
      <Field label={t('v.fNotes')}>
        <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={selectCls} />
      </Field>
      {form.kind !== 'income' && (
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2">
            <span className="text-xs font-medium flex items-center gap-1.5"><Landmark size={13} className="text-[color:var(--color-gold)]" /> {t('ex.taxDeductible')}</span>
            <button type="button" role="switch" aria-checked={form.taxDeductible} onClick={() => set({ taxDeductible: !form.taxDeductible })} className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', form.taxDeductible ? 'bg-[color:var(--color-gold)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]')}>
              <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', form.taxDeductible && 'translate-x-4')} />
            </button>
          </div>
          <Field label={t('ex.fTaxCategory')}>
            <SearchableSelect value={form.taxCategory} onChange={(v) => set({ taxCategory: v })} options={TAX_CATEGORY_PRESETS} placeholder={t('ex.fTaxCategoryPlaceholder')} allowCustom clearable size="sm" />
          </Field>
        </div>
      )}
      {form.kind !== 'income' && (
        <SplitEditor split={form.split} amount={baseAmount} baseCurrency={fx.base} onChange={(split) => set({ split })} />
      )}
      {/* `baseAmount`, exactly like SplitEditor above — and for a sharper reason. `form.amount` is
          what the PAPER says; a payment split is stored in base currency and a gift card's balance
          IS base currency, so handing the printed figure here made the editor allocate 1000
          against a ¥1000 purchase, and `syncGiftCardUses` then took €1000 off the card instead of
          ~€6 (#205). The per-person split was fixed for this once; the line below it was missed. */}
      {form.kind !== 'income' && (
        <PaymentSplitEditor splits={form.paymentSplits} amount={baseAmount} giftCards={giftCards} onChange={(paymentSplits) => set({ paymentSplits })} />
      )}
    </div>
  );
}

/** Multi-currency (P9): shown only when the entry's currency differs from the base one.
 *  Two ways in, because a user reading a card statement knows the charged total but not the
 *  rate: type the rate directly, or type what your account was actually debited and let
 *  deriveFxRate() back the rate out. The preview is the number that will be stored. */
function FxFields({ form, set, base }: { form: FormState; set: (p: Partial<FormState>) => void; base: string }) {
  const t = useT();
  const money = useMoney();
  const [charged, setCharged] = useState('');
  const printed = Number(form.amount) || 0;
  const rate = Number(form.fxRate) || 0;
  const code = normalizeCurrency(form.currency);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end rounded-lg border border-[color:var(--color-purple)]/30 bg-[color:var(--color-surface-2)] p-3">
      <Field label={t('ex.fFxRate', { code, base })}>
        <Input
          type="number"
          step="0.000001"
          value={form.fxRate}
          onChange={(e) => { setCharged(''); set({ fxRate: e.target.value }); }}
          placeholder="0.92"
        />
        {/* P9 phase 2: offer the fixing for this entry's own day; still the user's to accept. */}
        <div className="mt-1">
          <FxRateButton currency={code} date={form.date} onRate={(r) => { setCharged(''); set({ fxRate: String(r) }); }} />
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
            set({ fxRate: derived ? String(derived) : '' });
          }}
        />
      </Field>
      <p className="text-[11px] pb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {rate > 0 ? (
          <span className="text-[color:var(--color-purple)]">= {money(convertToBase(printed, rate), base)}</span>
        ) : (
          <span className="text-[color:var(--color-gold)]">⚠ {t('ex.fxNoRate', { base })}</span>
        )}
      </p>
    </div>
  );
}

/** Expense splitting (P35): list the people who owe you a share of this expense.
 *  You paid the total; each row is another person and what they owe. "Split equally"
 *  divides the amount among the named people (optionally counting yourself). */
function SplitEditor({ split, amount, baseCurrency, onChange }: { split: SplitEntry[]; amount: number; baseCurrency?: string; onChange: (s: SplitEntry[]) => void }) {
  const t = useT();
  const money = useMoney();
  const [includeSelf, setIncludeSelf] = useState(true);
  const totals = splitTotals(split);
  const yourShare = Math.round((amount - split.reduce((s, e) => s + (e.share || 0), 0)) * 100) / 100;

  function setRow(i: number, p: Partial<SplitEntry>) {
    onChange(split.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() { onChange([...split, { name: '', share: 0, settled: false }]); }
  function removeRow(i: number) { onChange(split.filter((_, idx) => idx !== i)); }
  function splitEqually() {
    const names = split.map((r) => r.name);
    if (names.filter((n) => n.trim()).length === 0) return;
    const fresh = equalSplit(amount, names, includeSelf);
    // keep existing settled flags where names line up
    onChange(fresh.map((f) => ({ ...f, settled: split.find((r) => r.name.trim().toLowerCase() === f.name.toLowerCase())?.settled ?? false })));
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-border)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1.5"><SplitIcon size={13} className="text-[color:var(--color-cyan)]" /> {t('ex.splitTitle')}{baseCurrency ? ` (${currencySymbol(baseCurrency).trim()})` : ''}</span>
        {split.length > 0 && (
          <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('ex.splitOwedYou', { amt: money(totals.owed) })}{totals.settled > 0 ? ` · ${t('ex.splitSettled', { amt: money(totals.settled) })}` : ''}
          </span>
        )}
      </div>
      {split.length === 0 ? (
        <p className="text-[11px] text-[color:var(--color-text-faint)] mb-2">{t('ex.splitEmpty')}</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {split.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={t('ex.splitName')} className="flex-1" />
              <Input type="number" step="0.01" value={r.share || ''} onChange={(e) => setRow(i, { share: Number(e.target.value) || 0 })} placeholder="0.00" className="w-24" />
              <button type="button" onClick={() => setRow(i, { settled: !r.settled })} title={t('ex.splitMarkPaid')} className={cn('shrink-0 rounded-md p-1.5 border transition-colors', r.settled ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]')}><CheckCircle2 size={14} /></button>
              <button type="button" onClick={() => removeRow(i)} className="shrink-0 rounded-md p-1.5 border border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:border-[color:var(--color-red)]"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-[color:var(--color-accent)] hover:opacity-80"><Plus size={12} /> {t('ex.splitAddPerson')}</button>
        {split.some((r) => r.name.trim()) && (
          <>
            <button type="button" onClick={splitEqually} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:opacity-80"><SplitIcon size={12} /> {t('ex.splitEqually')}</button>
            <label className="flex items-center gap-1.5 text-[color:var(--color-text-dim)] cursor-pointer">
              <input type="checkbox" checked={includeSelf} onChange={(e) => setIncludeSelf(e.target.checked)} className="accent-[color:var(--color-cyan)]" /> {t('ex.splitIncludeMe')}
            </label>
          </>
        )}
        {split.length > 0 && (
          <span className="ml-auto text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.splitYourShare', { amt: money(yourShare) })}</span>
        )}
      </div>
    </div>
  );
}

/** Payment-method split (P62): ONE purchase paid with SEVERAL methods (part gift
 *  card, part card, part cash). Opt-in — the panel stays a single "split payment"
 *  link until the user adds a row, so the default form is exactly as before.
 *
 *  The rows are expected to add up to the expense total, but a mismatch is shown as
 *  a WARNING rather than blocking the save: the amount is often edited after the
 *  rows, and refusing to save a whole expense over a stray cent would be hostile.
 *  "Balance" drops the difference onto the last row in one click (the P62 analogue
 *  of P35's "split equally"). Picking a gift card on a row makes saving write the
 *  matching spend onto that card's balance automatically.
 */
function PaymentSplitEditor({ splits, amount, giftCards, onChange }: { splits: PaymentSplitEntry[]; amount: number; giftCards: GiftCardOption[]; onChange: (s: PaymentSplitEntry[]) => void }) {
  const t = useT();
  const money = useMoney();
  const allocated = paymentSplitTotal(splits);
  const rest = paymentSplitRemainder(amount, splits);
  const balanced = paymentSplitsBalance(amount, splits);

  function setRow(i: number, p: Partial<PaymentSplitEntry>) {
    onChange(splits.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    // A fresh row pre-fills with whatever is still unallocated, which is the amount
    // the user is about to type in the overwhelming majority of cases.
    onChange([...splits, { method: '', amount: Math.max(0, paymentSplitRemainder(amount, splits)), giftCardId: '' }]);
  }
  function removeRow(i: number) { onChange(splits.filter((_, idx) => idx !== i)); }
  /** Choosing a gift card also names the row after it, unless the user typed a method. */
  function pickCard(i: number, id: string) {
    const card = giftCards.find((g) => g._id === id);
    const cur = splits[i];
    const named = (cur?.method || '').trim();
    const auto = !named || giftCards.some((g) => g.title === named);
    setRow(i, { giftCardId: id, method: id && auto && card ? card.title : named });
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-border)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1.5"><CreditCard size={13} className="text-[color:var(--color-gold)]" /> {t('ex.paySplitTitle')}</span>
        {splits.length > 0 && (
          <span className={cn('text-[10px]', balanced ? 'text-[color:var(--color-text-faint)]' : 'text-[color:var(--color-red)]')} style={{ fontFamily: 'var(--font-mono)' }}>
            {t('ex.paySplitAllocated', { amt: money(allocated), total: money(amount) })}
          </span>
        )}
      </div>
      {splits.length === 0 ? (
        <p className="text-[11px] text-[color:var(--color-text-faint)] mb-2">{t('ex.paySplitEmpty')}</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {splits.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.method} onChange={(e) => setRow(i, { method: e.target.value })} placeholder={t('ex.paySplitMethod')} className="flex-1" />
              {giftCards.length > 0 && (
                <select value={r.giftCardId} onChange={(e) => pickCard(i, e.target.value)} className={cn(selectCls, 'w-36 shrink-0 text-xs')} title={t('ex.paySplitGiftCard')}>
                  <option value="">{t('ex.paySplitNoGiftCard')}</option>
                  {giftCards.map((g) => <option key={g._id} value={g._id}>{g.title} ({money(g.balance)})</option>)}
                </select>
              )}
              <Input type="number" step="0.01" value={r.amount || ''} onChange={(e) => setRow(i, { amount: Number(e.target.value) || 0 })} placeholder="0.00" className="w-24" />
              <button type="button" onClick={() => removeRow(i)} className="shrink-0 rounded-md p-1.5 border border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:border-[color:var(--color-red)]"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-[color:var(--color-accent)] hover:opacity-80"><Plus size={12} /> {t('ex.paySplitAddMethod')}</button>
        {splits.length > 0 && !balanced && (
          <button type="button" onClick={() => onChange(balancePaymentSplits(amount, splits))} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:opacity-80"><SplitIcon size={12} /> {t('ex.paySplitBalance')}</button>
        )}
        {splits.length > 0 && !balanced && (
          <span className="text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {rest > 0 ? t('ex.paySplitShort', { amt: money(rest) }) : t('ex.paySplitOver', { amt: money(Math.abs(rest)) })}
          </span>
        )}
        {splits.some((r) => r.giftCardId) && (
          <span className="ml-auto flex items-center gap-1 text-[color:var(--color-text-faint)]"><Gift size={11} /> {t('ex.paySplitGiftCardHint')}</span>
        )}
      </div>
    </div>
  );
}

function ExpenseDetail({ expense, cards, giftCards, vendors, categories, spaces, fx, seriesCount, onClose, onChanged, confirm }: {
  expense: SerializedExpense; cards: SerializedCard[]; giftCards: GiftCardOption[]; vendors: string[]; categories: string[]; spaces: string[]; fx: FxCtx; seriesCount: number;
  onClose: () => void; onChanged: () => void; confirm: ReturnType<typeof useConfirm>;
}) {
  const t = useT();
  const [form, setForm] = useState<FormState>(toForm(expense, fx.base));
  const [pending, startTransition] = useTransition();
  const [rev, setRev] = useState(0);
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const isImage = !!expense.fileType && expense.fileType.startsWith('image/');

  function save(verified = form.verified) {
    startTransition(async () => {
      await updateExpense(expense._id, { ...form, amount: Number(form.amount) || 0, fxRate: Number(form.fxRate) || 0, verified });
      onChanged();
      onClose();
    });
  }
  function doRescan(useOcr: boolean) {
    startTransition(async () => {
      const r = await rescanExpense(expense._id, useOcr);
      if (r.ok && r.expense) { setForm(toForm(r.expense, fx.base)); setRev((x) => x + 1); onChanged(); }
    });
  }
  async function doDelete() {
    const ok = await confirm({ title: t('ex.deleteTitle'), message: t('ex.deleteBody'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    startTransition(async () => { await deleteExpense(expense._id); onChanged(); onClose(); });
  }

  return (
    <Modal open onClose={onClose} title={expense.vendor || t('ex.recordFallback')} size="2xl">
      {expense.filePath && (
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[color:var(--color-border)] text-xs flex-wrap">
          <span className="text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.rescan')}</span>
          <button onClick={() => doRescan(false)} disabled={pending} className="px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]">{t('ex.rescanText')}</button>
          <button onClick={() => doRescan(true)} disabled={pending} className="px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)]">{t('ex.rescanOcr')}</button>
          {pending && <Loader2 size={13} className="animate-spin" />}
          <OpenInOneDriveButton filePath={expense.filePath} />
          {seriesCount > 1 && <span className="ml-auto text-[color:var(--color-purple)] flex items-center gap-1"><Repeat size={12} /> {t('ex.inSeries', { n: seriesCount })}</span>}
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
                <a href={fileUrl(expense.filePath)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--color-cyan)] hover:underline"><FileText size={12} /> {t('ex.openNewTab')}</a>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-8 text-center text-xs text-[color:var(--color-text-faint)] flex items-center justify-center"><Wallet size={26} className="opacity-40" /></div>
          )}
        </div>
        <div className="order-1 md:order-2"><FormFields form={form} set={set} cards={cards} giftCards={giftCards} vendors={vendors} categories={categories} spaces={spaces} fx={fx} /></div>
      </div>
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[color:var(--color-border)] flex-wrap">
        <Button onClick={() => save(true)} disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {t('common.confirm')}</Button>
        <button onClick={() => save(form.verified)} disabled={pending} className="text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)]">{t('common.save')}</button>
        <button onClick={doDelete} disabled={pending} className="ml-auto flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)]"><Trash2 size={13} /> {t('common.delete')}</button>
      </div>
    </Modal>
  );
}

function ExpenseCreate({ kind, cards, giftCards, vendors, categories, spaces, fx, onClose, onCreated }: { kind: 'income' | 'expense'; cards: SerializedCard[]; giftCards: GiftCardOption[]; vendors: string[]; categories: string[]; spaces: string[]; fx: FxCtx; onClose: () => void; onCreated: () => void }) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [form, setForm] = useState<FormState>({
    // A new entry starts in the deployment's own currency, so nothing looks "foreign" by
    // default on a non-EUR install.
    kind, vendor: '', category: kind === 'income' ? 'salary' : 'other', space: '', taxDeductible: false, taxCategory: '', amount: '', currency: normalizeCurrency(fx.base) || 'EUR', fxRate: '', date: iso, period: '',
    recurring: false, recurringCycle: '', paymentMethod: '', notes: '', verified: true, split: [], paymentSplits: [],
  });
  const t = useT();
  const [pending, startTransition] = useTransition();
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  function save() {
    startTransition(async () => { await addExpense({ ...form, amount: Number(form.amount) || 0, fxRate: Number(form.fxRate) || 0 }); onCreated(); });
  }
  return (
    <Modal open onClose={onClose} title={t('ex.newRecord')} size="lg">
      <FormFields form={form} set={set} cards={cards} giftCards={giftCards} vendors={vendors} categories={categories} spaces={spaces} fx={fx} />
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[color:var(--color-border)]">
        <Button onClick={save} disabled={pending || !form.amount}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('common.add')}</Button>
        <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]"><X size={13} /></button>
      </div>
    </Modal>
  );
}
