'use client';
import { cur, currencySymbol, CURRENCIES } from "@/lib/money";
import { matchesQuery, haystack, fold, sameLabel } from '@/lib/searchText';
import { isForeignCurrency, normalizeCurrency, convertToBase, deriveFxRate, formatMoney, toPrinted } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { useState, useTransition, useRef, useMemo } from 'react';
import {
  Upload,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  FileText,
  Loader2,
  PackagePlus,
  Mail,
  Search,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
  Archive,
  Zap,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { shrinkImage } from '@/lib/clientImage';
import { CardSelect } from '@/components/CardSelect';
import { useOpenParam } from '@/components/useOpenParam';
import { Camera } from 'lucide-react';
import type { SerializedReceipt, SerializedCard } from '@/types';
import { uploadReceipt, updateReceipt, deleteReceipt, addReceiptItemsToLibrary, rescanReceipt, importEmailInbox, archiveReceipt } from './actions';
import { OpenInOneDriveButton } from '@/components/OpenInOneDriveButton';
import { QuickVerify } from './QuickVerify';
import { useJobs } from '@/components/JobsProvider';
import { enqueueRescanReceipts, getBulkAiGuard } from '@/app/jobActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useLocale, useT } from '@/components/LocaleProvider';
import { DuplicatesModal } from './DuplicatesModal';
import { useRouter } from 'next/navigation';
import { formatDate, formatTime, formatDateTime, compareNames } from '@/lib/i18n/format';

function fileUrl(filePath: string) {
  const u = `/api/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  // Email receipts (.html) were briefly served as octet-stream and cached 'immutable'
  // for a year, so they download instead of rendering. A version query is a fresh
  // cache key that escapes that poisoned entry (the route ignores query params).
  return /\.html?$/i.test(filePath) ? `${u}?v=2` : u;
}

// ─── Main component ────────────────────────────────────────────────────────

/** Multi-currency context (P9): the deployment's base currency code + whether the
 *  per-receipt currency/FX controls are switched on at all. One object so the already
 *  long prop lists below grow by a single entry. */
type FxCtx = { base: string; enabled: boolean };

export function ReceiptsClient({
  receipts,
  cards,
  ollamaUp,
  storeNames,
  categories,
  spaces,
  emailInboxCount,
  baseCurrency,
  multiCurrency,
}: {
  receipts: SerializedReceipt[];
  cards: SerializedCard[];
  ollamaUp: boolean;
  storeNames: string[];
  categories: string[]; // P64: expense taxonomy, for the per-line category picker
  spaces: string[]; // P68: per-property ledger tags (AppConfig.spaces), same list the Expenses form uses
  emailInboxCount: number;
  baseCurrency: string;
  multiCurrency: boolean;
}) {
  const locale = useLocale();
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const t = useT();
  const [selected, setSelected] = useState<SerializedReceipt | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { isRunning, refresh } = useJobs();
  const rescanBusy = isRunning('rescan-receipts');
  const router = useRouter();
  const confirm = useConfirm();
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showDupes, setShowDupes] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'parsed' | 'failed' | 'archived'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'total-desc' | 'total-asc' | 'store'>('recent');
  // A receipt is a dated purchase, so "when" and "what kind" are the two questions the
  // list could not answer before: there was only store + status + a substring search.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Ingest the staged Gmail attachments (from scripts/extract-email-receipts.py) as
  // draft receipts. They then appear as "failed" → use "re-scan all" to AI-parse.
  async function handleImportEmail() {
    if (importing) return;
    setImporting(true);
    setImportMsg(t('rc.importing'));
    try {
      const r = await importEmailInbox();
      setImportMsg(
        r.ok
          ? t('rc.importedEmail', { n: r.imported })
          : r.error || t('rc.importFailed')
      );
      router.refresh();
    } catch (e) {
      setImportMsg(t('rc.failedMsg', { m: (e as Error).message.slice(0, 80) }));
    } finally {
      setImporting(false);
    }
  }

  // Re-scan candidates: UNVERIFIED receipts that came out empty (€0 or no items),
  // regardless of whether OCR was tried before — so a re-scan after an OCR
  // improvement (e.g. auto-rotate of sideways receipts) can recover them.
  // "Failed" = genuinely empty (no total AND no items), not verified, not archived.
  // A receipt with a parsed total but no line items (e.g. a Viva payment receipt)
  // counts as "parsed", not failed — re-scanning it would add nothing.
  const failedReceipts = useMemo(
    () => receipts.filter((r) => !r.verified && !r.archived && r.total === 0 && (r.lineItems?.length ?? 0) === 0),
    [receipts]
  );
  const failedCount = failedReceipts.length;

  // Quick-verify queue: parsed (has a total or items) but not yet confirmed.
  const toVerify = useMemo(
    () => receipts.filter((r) => !r.verified && !r.archived && (r.total > 0 || (r.lineItems?.length ?? 0) > 0)),
    [receipts]
  );
  const [quickVerify, setQuickVerify] = useState(false);

  // Re-scan all failed receipts in small server-side batches (each ~a few min) so a
  // single request never times out; loop from the client until none remain.
  // Enqueue a SERVER-SIDE job: the worker (lib/jobRunner) re-scans each failed
  // (unverified + empty) receipt with auto-rotate OCR, independent of this browser.
  // Progress shows in the global widget on every device + survives reloads.
  async function handleRescanFailed() {
    if (rescanBusy || failedReceipts.length === 0) return;
    // Cost guard: confirm before starting a (possibly paid) bulk AI job.
    const g = await getBulkAiGuard();
    if (g.confirm) {
      const ok = await confirm({
        title: t('rc.rescanConfirm', { n: failedReceipts.length }),
        message:
          g.provider === 'anthropic'
            ? t('rc.rescanConfirmCloud', { model: g.model, cost: (failedReceipts.length * 0.02).toFixed(2) })
            : t('rc.rescanConfirmLocal', { model: g.model }),
        confirmLabel: t('common.confirm'),
      });
      if (!ok) return;
    }
    void enqueueRescanReceipts(
      failedReceipts.map((r) => r._id),
      failedReceipts.map((r) => r.store || 'receipt'),
      true
    ).then(refresh);
  }

  // Distinct stores for the per-store filter dropdown. Deduped by FOLDED name: OCR
  // spells one store several ways ("ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ" / "ΑΒ Βασιλόπουλος"), which used
  // to list it two or three times and make each entry select only part of its receipts.
  const stores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of receipts) {
      const name = (r.store || '').trim();
      if (!name) continue;
      const key = fold(name);
      if (!seen.has(key)) seen.set(key, name);
    }
    return [...seen.values()].sort((a, b) => compareNames(a, b, locale));
  }, [receipts]);

  // Line-item categories actually present on the receipts (P64), so the dropdown only
  // ever offers a value that will return something.
  const usedCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of receipts) for (const l of r.lineItems ?? []) if (l.category) seen.add(l.category);
    return [...seen].sort((a, b) => compareNames(a, b, locale));
  }, [receipts]);

  // Same for payment methods.
  const payments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of receipts) {
      const m = (r.paymentMethod || '').trim();
      if (m && !seen.has(fold(m))) seen.set(fold(m), m);
    }
    return [...seen.values()].sort((a, b) => compareNames(a, b, locale));
  }, [receipts]);
  const visible = useMemo(() => {
    const out = receipts.filter((r) => {
      // Archived receipts are hidden everywhere except the explicit "archived" view.
      if (statusFilter === 'archived') {
        if (!r.archived) return false;
      } else if (r.archived) {
        return false;
      }
      // Compare folded, so picking "ΑΒ Βασιλόπουλος" also returns the receipts OCR
      // saved as "ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ".
      if (storeFilter && !sameLabel(r.store, storeFilter)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'archived') {
        const empty = r.total === 0 && (r.lineItems?.length ?? 0) === 0;
        if (statusFilter === 'verified' && !r.verified) return false;
        if (statusFilter === 'failed' && !(!r.verified && empty)) return false;
        if (statusFilter === 'parsed' && !(!r.verified && !empty)) return false;
      }
      // Date range: compare on the YYYY-MM-DD prefix so it is timezone-proof and both
      // ends are inclusive (picking the same day twice shows that day's receipts).
      if (dateFrom || dateTo) {
        const day = (r.date || '').slice(0, 10);
        if (!day) return false;
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      }
      if (categoryFilter && !(r.lineItems ?? []).some((l) => l.category === categoryFilter)) return false;
      if (paymentFilter && !sameLabel(r.paymentMethod || '', paymentFilter)) return false;
      if (search.trim()) {
        // Everything printed on the receipt is searchable, not just the store, the notes
        // and one of the two name fields: BOTH the raw OCR name and the AI-refined one
        // (a receipt says "ΓΑΛΑ ΦΡ 1,5L" while the refined name is "Γάλα φρέσκο"), the
        // per-item category, the payment method, and the total and date as text so
        // "45.20" or "2026-07" find a receipt too.
        const hay = haystack(
          r.store,
          r.notes,
          r.paymentMethod,
          r.space, // P68: "Kalamos" finds every receipt tagged to the summer house
          r.total,
          (r.date || '').slice(0, 10),
          (r.lineItems ?? []).map((l) => haystack(l.name, l.refinedName, l.category))
        );
        if (!matchesQuery(hay, search)) return false;
      }
      return true;
    });
    return [...out].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'total-desc':
          return (b.total || 0) - (a.total || 0);
        case 'total-asc':
          return (a.total || 0) - (b.total || 0);
        case 'store':
          return compareNames(a.store, b.store, locale);
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [receipts, storeFilter, statusFilter, search, sortBy, dateFrom, dateTo, categoryFilter, paymentFilter]);

  // Deep-link from global search
  useOpenParam((id) => {
    const found = receipts.find((r) => r._id === id);
    if (found) setSelected(found);
  });

  const unverified = visible.filter((r) => !r.verified).length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const total = list.length;
    setUploading(true);

    let lastAiError: string | undefined;
    let failed = 0;
    let lastError: string | undefined;
    for (let i = 0; i < total; i++) {
      const base = ollamaUp ? t('rc.aiParsing') : t('rc.savingOffline');
      const tail = failed ? t('rc.failedTail', { n: failed }) : '';
      setUploadMsg(total > 1 ? `${base} ${i + 1}/${total}${tail}...` : `${base}...`);
      const processed = await shrinkImage(list[i]); // downscale big phone photos
      const fd = new FormData();
      fd.set('file', processed);
      try {
        const result = await uploadReceipt(fd);
        if (!result.ok) {
          // One bad receipt must NOT abort the whole batch — log it and continue.
          failed++;
          lastError = result.error;
          continue;
        }
        if (result.aiError) lastAiError = result.aiError;
      } catch (err) {
        failed++;
        lastError = (err as Error).message;
      }
    }

    setUploading(false);
    const okCount = total - failed;
    setUploadMsg(
      failed
        ? // `lastError` used to be collected here and then thrown away, so a failed import
          // said "1 failed" and nothing else — there was no way to find out WHY without
          // reading the server logs. Whatever the server said is the whole point.
          `${t('rc.uploadResult', { ok: okCount, total, failed })}${lastError ? ` ${lastError}` : ''}`
        : lastAiError
          ? t('rc.savedManual', { err: lastAiError })
          : total > 1
            ? t('rc.importedOk', { n: total })
            : null
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const anyRFilter = !!(storeFilter || statusFilter !== 'all' || search || sortBy !== 'recent' || dateFrom || dateTo || categoryFilter || paymentFilter);
  /** One-tap ranges for the two questions people actually ask a receipt archive. */
  const applyDatePreset = (preset: 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const now = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (preset === 'thisYear') {
      setDateFrom(`${now.getFullYear()}-01-01`);
      setDateTo(ymd(now));
      return;
    }
    const offset = preset === 'lastMonth' ? -1 : 0;
    setDateFrom(ymd(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
    // Day 0 of the following month = the last day of this one, leap years included.
    setDateTo(ymd(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)));
  };

  const resetRFilters = () => {
    setStoreFilter('');
    setStatusFilter('all');
    setSearch('');
    setSortBy('recent');
    setDateFrom('');
    setDateTo('');
    setCategoryFilter('');
    setPaymentFilter('');
  };
  const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const selCls =
    'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]';

  // Shared filter controls — left sidebar (desktop) + drawer (mobile)
  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder={t('rc.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.status')}</p>
        <div className="flex flex-col gap-1">
          {(['all', 'verified', 'parsed', 'failed', 'archived'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {v === 'all' ? t('common.all') : v === 'verified' ? t('rc.stVerified') : v === 'parsed' ? t('rc.stParsed') : v === 'failed' ? t('rc.stNeedsScan') : t('rc.stArchived')}
            </button>
          ))}
        </div>
      </div>
      {stores.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('v.fStore')}</p>
          <SearchableSelect value={storeFilter} onChange={setStoreFilter} options={stores} placeholder={t('it.allStores')} clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('rc.fltPeriod')}</p>
        <div className="flex flex-col gap-1.5 min-w-0">
          <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label={t('rc.fltFrom')} className="min-w-0" />
          <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label={t('rc.fltTo')} className="min-w-0" />
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {([
            ['thisMonth', t('rc.fltThisMonth')],
            ['lastMonth', t('rc.fltLastMonth')],
            ['thisYear', t('rc.fltThisYear')],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => applyDatePreset(k)}
              className="text-[10px] px-2 py-1 rounded-md border border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {usedCategories.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('rc.fltCategory')}</p>
          <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={usedCategories} placeholder={t('rc.fltAllCategories')} clearable size="sm" className="w-full" />
        </div>
      )}
      {payments.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('sub.fPayment')}</p>
          <SearchableSelect value={paymentFilter} onChange={setPaymentFilter} options={payments} placeholder={t('rc.fltAllPayments')} clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.sort')}</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selCls} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="recent">{t('rc.sortRecent')}</option>
          <option value="oldest">{t('rc.sortOldest')}</option>
          <option value="total-desc">{t('rc.sortTotalDesc')}</option>
          <option value="total-asc">{t('rc.sortTotalAsc')}</option>
          <option value="store">{t('rc.sortStore')}</option>
        </select>
      </div>
      {anyRFilter && (
        <button onClick={resetRFilters} className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('common.resetFilters')}
        </button>
      )}
    </div>
  );

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {t('nav.receipts')}
            <span
              className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {receipts.length}
            </span>
          </h1>
          <div
            className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs text-[color:var(--color-text-dim)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
              {([
                ['grid', <LayoutGrid key="g" size={14} />],
                ['list', <ListIcon key="l" size={14} />],
              ] as const).map(([v, icon]) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  title={v === 'grid' ? t('v.grid') : t('v.list')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDupes(true)}
              className="text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors"
              title={t('rc.findDupTitle')}
            >
              {t('rc.findDuplicates')}
            </button>
            {toVerify.length > 0 && (
              <button
                onClick={() => setQuickVerify(true)}
                className="flex items-center gap-1.5 text-[color:var(--color-accent)] hover:opacity-80 transition-opacity font-semibold"
                title={t('rc.quickVerifyTitle')}
              >
                <Zap size={13} /> {t('rc.quickVerify', { n: toVerify.length })}
              </button>
            )}
            {failedCount > 0 && (
              <button
                onClick={handleRescanFailed}
                disabled={rescanBusy}
                className="text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)] disabled:opacity-60"
                title={t('rc.rescanTitle')}
              >
                {rescanBusy ? t('rc.rescanning') : t('rc.failedRescan', { n: failedCount })}
              </button>
            )}
            {emailInboxCount > 0 && (
              <button
                onClick={handleImportEmail}
                disabled={importing}
                className="text-[color:var(--color-purple)] hover:text-[color:var(--color-accent)] disabled:opacity-60"
                title={t('rc.importEmailTitle')}
              >
                {importing ? t('rc.importing') : t('rc.importEmail', { n: emailInboxCount })}
              </button>
            )}
            {importMsg && <span className="text-[color:var(--color-text-faint)]">{importMsg}</span>}
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 mb-6 text-center cursor-pointer transition-all',
          dragOver
            ? 'border-[color:var(--color-accent)] bg-[#00ff8808]'
            : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]',
          uploading && 'pointer-events-none opacity-70'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-[color:var(--color-cyan)]">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">{uploadMsg}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[color:var(--color-text-dim)]">
            <Upload size={28} />
            <p className="text-sm font-medium text-[color:var(--color-text)]">
              {t('rc.dropReceipts')}
            </p>
            <p className="text-xs text-[color:var(--color-text-faint)]">
              {ollamaUp
                ? t('rc.aiAutoParse')
                : t('rc.manualEntry')}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"
            >
              <Camera size={14} /> {t('ex.takePhoto')}
            </button>
          </div>
        )}
        {/* Camera capture (opens the camera on mobile); resized client-side */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploadMsg && !uploading && (
        <div className="mb-4 text-sm text-[color:var(--color-red)] flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="break-words">{uploadMsg}</span>
        </div>
      )}

      {/* E-shop body: filter sidebar + receipts */}
      <div className="flex gap-6 items-start">
        <aside className="hidden lg:block w-56 shrink-0 sticky top-4 self-start">{filterControls}</aside>

        <div className="flex-1 min-w-0">
          {/* Mobile filter toggle + drawer */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <SlidersHorizontal size={14} /> {t('ex.filters')} {anyRFilter && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && (
              <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {visible.length} {visible.length === 1 ? t('rc.receiptOne') : t('rc.receiptMany')}
              {visible.length !== receipts.length ? ` / ${receipts.length}` : ''}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">🧾</p>
              <p className="text-sm">{receipts.length === 0 ? t('rc.emptyNone') : t('rc.emptyFiltered')}</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visible.map((r) => (
                <ReceiptCard key={r._id} receipt={r} base={fx.base} onClick={() => setSelected(r)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((r) => (
                <ReceiptRow key={r._id} receipt={r} base={fx.base} onClick={() => setSelected(r)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <ReceiptDetailModal receipt={selected} cards={cards} storeNames={storeNames} categories={categories} spaces={spaces} fx={fx} onClose={() => setSelected(null)} />
      )}

      {/* Duplicate finder + merge */}
      <DuplicatesModal open={showDupes} onClose={() => setShowDupes(false)} />

      {/* Rapid review queue */}
      {quickVerify && (
        <QuickVerify
          receipts={toVerify}
          stores={storeNames}
          base={fx.base}
          onClose={() => setQuickVerify(false)}
          onOpenFull={(r) => { setQuickVerify(false); setSelected(r); }}
          onChanged={() => router.refresh()}
        />
      )}
    </main>
  );
}

// ─── Receipt Card ──────────────────────────────────────────────────────────

// Compact horizontal row for the receipts list layout
function ReceiptRow({ receipt, base, onClick }: { receipt: SerializedReceipt; base: string; onClick: () => void }) {
  const locale = useLocale();
  const t = useT();
  const isImage = receipt.fileType.startsWith('image/');
  const isHtml = receipt.fileType.includes('html');
  const empty = receipt.total === 0 && (receipt.lineItems?.length ?? 0) === 0;
  const status: 'verified' | 'parsed' | 'failed' | 'archived' = receipt.archived
    ? 'archived'
    : receipt.verified
      ? 'verified'
      : empty
        ? 'failed'
        : 'parsed';
  const thumb = isImage ? receipt.filePath : receipt.thumbPath;
  const d = new Date(receipt.date);
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3 py-2.5 text-left hover:border-[color:var(--color-border-light)] transition-all"
    >
      <div className="w-11 h-11 rounded-lg bg-[color:var(--color-surface-2)] overflow-hidden shrink-0 grid place-items-center text-[color:var(--color-text-faint)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(thumb)} alt={receipt.store} loading="lazy" className="w-full h-full object-cover object-top" />
        ) : isHtml ? (
          <Mail size={18} />
        ) : (
          <FileText size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-sm truncate block" style={{ fontFamily: 'var(--font-display)' }}>
          {receipt.store || t('ex.unknown')}
        </span>
        <span className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="truncate">
            {isNaN(d.getTime()) ? '—' : formatDate(d, locale)} · {receipt.lineItems?.length ?? 0} {t('it.items')}
            {receipt.fileType === 'pdf' ? ' · pdf' : isHtml ? ' · email' : ''}
          </span>
          <ReturnBadge days={receipt.returnDaysLeft} />
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <FxBadge doc={receipt} base={base} />
        {receipt.total > 0 && (
          <span className="font-extrabold text-[color:var(--color-accent)] text-base leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {cur()}{receipt.total}
          </span>
        )}
        {status === 'archived' ? (
          <Archive size={15} className="text-[color:var(--color-text-faint)]" />
        ) : status === 'verified' ? (
          <CheckCircle2 size={16} className="text-[color:var(--color-accent)]" />
        ) : status === 'parsed' ? (
          <Sparkles size={15} className="text-[color:var(--color-cyan)]" />
        ) : (
          <AlertTriangle size={15} className="text-[color:var(--color-gold)]" />
        )}
      </div>
    </button>
  );
}

function ReceiptCard({
  receipt,
  base,
  onClick,
}: {
  receipt: SerializedReceipt;
  base: string;
  onClick: () => void;
}) {
  const locale = useLocale();
  const t = useT();
  const isImage = receipt.fileType.startsWith('image/');
  const isHtml = receipt.fileType.includes('html');
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl overflow-hidden hover:border-[color:var(--color-border-light)] hover:-translate-y-0.5 transition-all"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-[color:var(--color-surface-2)] relative overflow-hidden flex items-center justify-center">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl(receipt.filePath)}
            alt={receipt.store}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : receipt.thumbPath ? (
          // Pre-rendered first-page thumbnail (a static JPEG — no live iframe, so no
          // 503 storm). The real PDF still opens only in the detail view.
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(receipt.thumbPath)} alt={receipt.store} loading="lazy" className="w-full h-full object-cover object-top" />
            <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white" style={{ fontFamily: 'var(--font-mono)' }}>
              PDF
            </span>
          </>
        ) : (
          // Fallback placeholder: email receipts (.html) get a mail icon + EMAIL label;
          // everything else (PDF without a thumbnail) keeps the document icon.
          <div className="flex flex-col items-center justify-center gap-2 text-[color:var(--color-text-faint)]">
            {isHtml ? <Mail size={34} strokeWidth={1.5} /> : <FileText size={36} strokeWidth={1.5} />}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white" style={{ fontFamily: 'var(--font-mono)' }}>
              {isHtml ? 'EMAIL' : 'PDF'}
            </span>
          </div>
        )}
        {/* 3-state status so you know what still needs work (don't re-do done ones) */}
        <div className="absolute top-2 right-2">
          {receipt.archived ? (
            <span title={t('rc.tipArchived')} className="flex items-center justify-center w-6 h-6 rounded-full bg-black/50 border border-[color:var(--color-border)]">
              <Archive size={12} className="text-[color:var(--color-text-faint)]" />
            </span>
          ) : receipt.verified ? (
            <span title={t('rc.tipVerified')} className="flex items-center justify-center w-6 h-6 rounded-full bg-[#00ff8820] border border-[#00ff8840]">
              <CheckCircle2 size={13} className="text-[color:var(--color-accent)]" />
            </span>
          ) : receipt.total > 0 || (receipt.lineItems?.length ?? 0) > 0 ? (
            <span title={t('rc.tipParsed')} className="flex items-center justify-center w-6 h-6 rounded-full bg-[#00d4ff20] border border-[#00d4ff40]">
              <Sparkles size={12} className="text-[color:var(--color-cyan)]" />
            </span>
          ) : (
            <span title={t('rc.tipFailed')} className="flex items-center justify-center w-6 h-6 rounded-full bg-[#ffd93d20] border border-[#ffd93d40]">
              <AlertTriangle size={12} className="text-[color:var(--color-gold)]" />
            </span>
          )}
        </div>
      </div>
      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {receipt.store}
          </span>
          <span
            className="text-[color:var(--color-accent)] font-bold text-sm shrink-0"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {cur()}{receipt.total}
          </span>
        </div>
        <div className="mt-1"><FxBadge doc={receipt} base={base} /></div>
        <div
          className="text-[10px] text-[color:var(--color-text-faint)] mt-1 flex items-center gap-1.5 flex-wrap"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>
            {formatDate(receipt.date, locale)}
            {receipt.lineItems.length > 0 && ` · ${receipt.lineItems.length} ${t('it.items')}`}
          </span>
          <ReturnBadge days={receipt.returnDaysLeft} />
        </div>
      </div>
    </button>
  );
}

/** "N days to return" chip — shown while a purchase is inside its store's return
 *  window (PA3). Gold when the window closes within 3 days. */
function ReturnBadge({ days }: { days?: number | null }) {
  const t = useT();
  if (days == null) return null;
  const closing = days <= 3;
  return (
    <span
      title={t('rc.returnTip', { n: days })}
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-px rounded border text-[9px] font-bold shrink-0',
        closing
          ? 'text-[color:var(--color-gold)] border-[#ffd93d40] bg-[#ffd93d14]'
          : 'text-[color:var(--color-cyan)] border-[#00d4ff33] bg-[#00d4ff10]'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <Undo2 size={9} /> {t('rc.returnBadge', { n: days })}
    </span>
  );
}

// ─── Detail / Edit Modal ───────────────────────────────────────────────────

type EditState = {
  store: string;
  date: string;
  total: string;
  subtotal: string;
  vatAmount: string;
  warrantyMonths: string;
  // Multi-currency (P9): `currency` is what the receipt is PRINTED in and every amount
  // in this form is a printed one; the server converts them with `fxRate` on save.
  currency: string;
  fxRate: string;
  paymentMethod: string;
  space: string; // P68: per-property ledger tag for the whole receipt
  notes: string;
  // `price` = unit NET (excl. VAT, the stored value). `grossStr` = the line GROSS
  // (qty × net × (1+rate)), kept as its own editable string so the user can type
  // the with-VAT figure freely; net and gross stay in sync both directions.
  lineItems: { name: string; refinedName: string; qty: string; price: string; vatRate: string; category: string; grossStr: string }[];
};

/** Currency codes for the picker, with the deployment's base one always first even
 *  if it is not one of the built-ins. */
function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}

/** Line gross (with VAT) from the net-side fields, as a 2-decimal string. */
function lineGross(unitNet: string, qty: string, vatRate: string): string {
  const net = (Number(unitNet) || 0) * (Number(qty) || 1);
  return (net * (1 + (Number(vatRate) || 0) / 100)).toFixed(2);
}

/**
 * Multi-currency (P9): shown only while the receipt's currency differs from the base one.
 * Two ways in, because someone reading a card statement knows the charged total but not
 * the rate: type the rate, or type what the account was actually debited and let
 * deriveFxRate() back it out. The preview is the total that will be stored (the net, VAT
 * and line prices convert with the very same rate).
 */
function ReceiptFxFields({
  form,
  setForm,
  base,
}: {
  form: EditState;
  setForm: React.Dispatch<React.SetStateAction<EditState>>;
  base: string;
}) {
  const t = useT();
  const [charged, setCharged] = useState('');
  const printed = Number(form.total) || 0;
  const rate = Number(form.fxRate) || 0;
  const code = normalizeCurrency(form.currency);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end rounded-lg border border-[color:var(--color-purple)]/30 bg-[color:var(--color-surface-2)] p-3">
      <Field label={t('ex.fFxRate', { code, base })}>
        <Input
          type="number"
          step="0.000001"
          value={form.fxRate}
          onChange={(e) => { setCharged(''); setForm((p) => ({ ...p, fxRate: e.target.value })); }}
          placeholder="0.92"
        />
        {/* P9 phase 2: the fixing for the receipt's own date, still the user's to accept. */}
        <div className="mt-1">
          <FxRateButton currency={code} date={form.date} onRate={(r) => { setCharged(''); setForm((p) => ({ ...p, fxRate: String(r) })); }} />
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
            setForm((p) => ({ ...p, fxRate: derived ? String(derived) : '' }));
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

function ReceiptDetailModal({
  receipt,
  cards,
  storeNames,
  categories,
  spaces,
  fx,
  onClose,
}: {
  receipt: SerializedReceipt;
  cards: SerializedCard[];
  storeNames: string[];
  categories: string[];
  spaces: string[];
  fx: FxCtx;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isImage = receipt.fileType.startsWith('image/');
  const confirm = useConfirm();
  const t = useT();

  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  // The form always edits what is PRINTED on the receipt: stored values as-is for an
  // ordinary one, and for a foreign one the exact printed total (`origAmount`) plus the
  // secondary amounts divided back out of base currency. Saving re-converts with the same
  // rate, so re-saving an unchanged receipt cannot double-convert it.
  const buildForm = (r: SerializedReceipt): EditState => {
    const foreign = isForeignCurrency(r.currency, fx.base);
    const rate = foreign ? r.fxRate || 0 : 0;
    const printed = (n: number) => toPrinted(n, rate).toString();
    return {
      store: r.store,
      date: r.date.slice(0, 10),
      total: (foreign ? r.origAmount || r.total : r.total).toString(),
      subtotal: printed(r.subtotal || 0),
      vatAmount: printed(r.vatAmount || 0),
      warrantyMonths: (r.warrantyMonths ?? 24).toString(),
      currency: foreign ? normalizeCurrency(r.currency) : fx.base,
      fxRate: foreign && r.fxRate ? String(r.fxRate) : '',
      paymentMethod: r.paymentMethod,
      space: r.space || '',
      notes: r.notes,
      lineItems: r.lineItems.map((li) => {
        const price = printed(li.price);
        return {
          name: li.name,
          refinedName: li.refinedName || '',
          qty: li.qty.toString(),
          price,
          vatRate: (li.vatRate ?? 24).toString(),
          category: li.category ?? '',
          grossStr: lineGross(price, li.qty.toString(), (li.vatRate ?? 24).toString()),
        };
      }),
    };
  };
  const [form, setForm] = useState<EditState>(() => buildForm(receipt));
  // Live from the select, so picking a foreign code immediately reveals the FX row.
  const foreign = fx.enabled && isForeignCurrency(form.currency, fx.base);

  // Re-run the AI scan on the stored file. The action returns the updated receipt,
  // so we re-sync the form (store/total/items) in place — no reopening needed.
  function handleRescan(useOcr: boolean) {
    setRescanMsg(t('rc.rescanning'));
    startTransition(async () => {
      try {
        const r = await rescanReceipt(receipt._id, useOcr);
        if (r.ok && r.receipt) setForm(buildForm(r.receipt));
        setRescanMsg(
          r.ok && r.aiUsed ? t('rc.rescannedOk', { model: r.model || '' }) : t('rc.rescanFailed', { err: r.aiError || r.error || 'no result' })
        );
      } catch (e) {
        // Catch a failed Server Action (e.g. stale bundle after a redeploy) so it
        // shows here instead of bubbling to the page error boundary ("crash").
        const m = (e as Error).message || 'request failed';
        setRescanMsg(
          /server action|fetch|chunk|deploy/i.test(m)
            ? t('rc.appUpdated')
            : t('rc.failedMsg', { m: m.slice(0, 100) })
        );
      }
    });
  }

  async function save(verified: boolean) {
    const alreadyAdded = (receipt.itemIds?.length ?? 0) > 0;
    let addToInventory = false;
    if (verified && form.lineItems.length > 0 && !alreadyAdded) {
      addToInventory = await confirm({
        title: t('rc.addInvTitle'),
        message: t('rc.addInvMsg', { n: form.lineItems.length }),
        confirmLabel: t('common.add'),
      });
    }
    startTransition(async () => {
      await updateReceipt(receipt._id, {
        store: form.store,
        date: form.date,
        total: Number(form.total),
        subtotal: Number(form.subtotal) || 0,
        vatAmount: Number(form.vatAmount) || 0,
        warrantyMonths: Number(form.warrantyMonths) || 24,
        currency: form.currency,
        fxRate: Number(form.fxRate) || 0,
        paymentMethod: form.paymentMethod,
        space: form.space,
        notes: form.notes,
        verified,
        lineItems: form.lineItems.map((li) => ({
          name: li.name,
          refinedName: li.refinedName,
          qty: Number(li.qty) || 1,
          price: Number(li.price) || 0,
          vatRate: Number(li.vatRate) || 0,
          category: li.category,
        })),
      });
      if (addToInventory) await addReceiptItemsToLibrary(receipt._id);
      onClose();
    });
  }

  function handleAddToItems() {
    startTransition(async () => {
      const r = await addReceiptItemsToLibrary(receipt._id);
      setAddMsg(r.ok ? t('rc.addedToInventory', { created: r.created, linked: r.linked }) : r.error || 'Error');
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t('rc.deleteReceipt'),
      message: t('rc.confirmDeleteReceipt', { store: receipt.store }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteReceipt(receipt._id);
      onClose();
    });
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveReceipt(receipt._id, !receipt.archived);
      onClose();
    });
  }

  // Editing a net-side field (unit net price, qty, VAT%) keeps the NET stable and
  // recomputes the gross — the net is what the user typed, so it must not jump.
  const updateLine = (i: number, k: 'name' | 'refinedName' | 'qty' | 'price' | 'vatRate' | 'category', v: string) =>
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.map((li, idx) => {
        if (idx !== i) return li;
        const next = { ...li, [k]: v };
        if (k === 'price' || k === 'qty' || k === 'vatRate')
          next.grossStr = lineGross(next.price, next.qty, next.vatRate);
        return next;
      }),
    }));

  // Editing the gross (with-VAT) figure derives the unit net back from it.
  const updateLineGross = (i: number, v: string) =>
    setForm((p) => ({
      ...p,
      lineItems: p.lineItems.map((li, idx) => {
        if (idx !== i) return li;
        const qty = Number(li.qty) || 1;
        const rate = Number(li.vatRate) || 0;
        const unitNet = (Number(v) || 0) / qty / (1 + rate / 100);
        return { ...li, grossStr: v, price: unitNet ? unitNet.toFixed(2) : '0' };
      }),
    }));

  const addLine = () =>
    setForm((p) => ({
      ...p,
      lineItems: [
        ...p.lineItems,
        { name: '', refinedName: '', qty: '1', price: '0', vatRate: '24', category: '', grossStr: '0' },
      ],
    }));

  const removeLine = (i: number) =>
    setForm((p) => ({ ...p, lineItems: p.lineItems.filter((_, idx) => idx !== i) }));

  // Fill the totals (gross / net / VAT) from the sum of the line items. The fields
  // stay manually editable — this is just a one-click "∑ from products" helper.
  const fillTotalsFromItems = () =>
    setForm((p) => {
      let net = 0;
      let vat = 0;
      for (const li of p.lineItems) {
        const lineNet = (Number(li.qty) || 0) * (Number(li.price) || 0);
        net += lineNet;
        vat += lineNet * ((Number(li.vatRate) || 0) / 100);
      }
      return { ...p, total: (net + vat).toFixed(2), subtotal: net.toFixed(2), vatAmount: vat.toFixed(2) };
    });

  return (
    <Modal open onClose={onClose} title={receipt.store} size="xl">
      {/* Re-scan bar pinned to the top of the modal — re-run the AI on the stored
          file (with OCR = rasterize PDF / Tesseract → text model, or without =
          embedded PDF text / vision) without scrolling past a tall receipt image. */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[color:var(--color-border)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wide">{t('rc.rescanLabel')}</span>
          <button
            onClick={() => handleRescan(true)}
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] disabled:opacity-50"
          >
            <Sparkles size={10} className="inline mr-0.5" /> {t('rc.ocr')}
          </button>
          <button
            onClick={() => handleRescan(false)}
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            {t('rc.noOcr')}
          </button>
          {rescanMsg && <span className="text-[10px] text-[color:var(--color-text-dim)] truncate max-w-[200px]">{rescanMsg}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <OpenInOneDriveButton filePath={receipt.filePath} />
          {receipt.aiModel && (
            <span className="text-[10px] text-[color:var(--color-text-faint)] flex items-center gap-1">
              <Sparkles size={10} /> {t('rc.parsedBy', { model: receipt.aiModel })}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Image preview */}
        <div className="min-w-0">
          {!receipt.filePath ? (
            <div className="w-full h-[55vh] md:aspect-[3/4] md:h-auto rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] grid place-items-center text-center px-6">
              <div>
                <FileText size={34} strokeWidth={1.5} className="mx-auto mb-3 text-[color:var(--color-text-faint)]" />
                <p className="text-sm font-medium text-[color:var(--color-text-dim)]">No scan file</p>
                <p className="text-[11px] text-[color:var(--color-text-faint)] mt-1">The original was lost (2026-06 reset). The parsed data is kept — re-upload a scan to attach one.</p>
              </div>
            </div>
          ) : isImage ? (
            <a href={fileUrl(receipt.filePath)} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(receipt.filePath)}
                alt={receipt.store}
                className="w-full max-h-[55vh] md:max-h-[70vh] object-contain rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]"
              />
            </a>
          ) : (
            <div className="space-y-2 max-w-full overflow-hidden">
              {/* Mobile: a static thumbnail + tap-to-open (iOS Safari can't render a
                  PDF inside an iframe). Desktop: the live iframe preview. */}
              {receipt.thumbPath ? (
                <a href={fileUrl(receipt.filePath)} target="_blank" rel="noopener noreferrer" className="md:hidden block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(receipt.thumbPath)} alt={receipt.store} className="w-full max-h-[55vh] object-contain rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]" />
                </a>
              ) : (
                <a href={fileUrl(receipt.filePath)} target="_blank" rel="noopener noreferrer" className="md:hidden flex flex-col items-center justify-center gap-2 h-40 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-cyan)]">
                  <FileText size={28} strokeWidth={1.5} /> <span className="text-xs">{t('rc.tapToOpenPdf')}</span>
                </a>
              )}
              <iframe
                src={`${fileUrl(receipt.filePath)}#toolbar=0&navpanes=0`}
                className="hidden md:block w-full md:aspect-[3/4] rounded-xl border border-[color:var(--color-border)] bg-white"
                title={receipt.store}
              />
              <a
                href={fileUrl(receipt.filePath)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--color-cyan)] hover:underline"
              >
                <FileText size={12} /> {t('ex.openNewTab')}
              </a>
            </div>
          )}
        </div>

        {/* Edit form */}
        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('rc.fStore')}>
              <SearchableSelect
                value={form.store}
                onChange={(v) => setForm((p) => ({ ...p, store: v }))}
                options={storeNames}
                placeholder={t('rc.fStorePlaceholder')}
                allowCustom
              />
            </Field>
            <Field label={t('ex.fDate')}>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </Field>
          </div>
          {/* Total — the key number, on its own wide row so it's never cramped */}
          <Field label={t('rc.fTotal', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
            <div className="flex items-center gap-2">
              <Input type="number" step="0.01" value={form.total} onChange={(e) => setForm((p) => ({ ...p, total: e.target.value }))} className="flex-1 min-w-0 text-base font-semibold" />
              {fx.enabled && (
                <select
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  aria-label={t('ex.fCurrency')}
                  className="shrink-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-2 py-2 text-xs focus:outline-none focus:border-[color:var(--color-accent)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {currencyCodes(fx.base).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={fillTotalsFromItems}
                disabled={form.lineItems.length === 0}
                title={t('rc.sumItemsTitle')}
                className="shrink-0 px-2.5 py-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)] text-[11px] leading-none hover:border-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('rc.sumItems')}
              </button>
            </div>
          </Field>
          {foreign && <ReceiptFxFields form={form} setForm={setForm} base={fx.base} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('sub.fPayment')}>
              <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => setForm((p) => ({ ...p, paymentMethod: v }))} />
            </Field>
            <Field label={t('rc.fWarranty')}>
              <Input type="number" min="0" value={form.warrantyMonths} onChange={(e) => setForm((p) => ({ ...p, warrantyMonths: e.target.value }))} placeholder="24" />
            </Field>
          </div>

          {/* P68: per-property ledger tag. Hidden until the user has named at least one
              space in Settings, exactly like the Expenses form — a dormant feature must
              not add a field nobody can fill. */}
          {spaces.length > 0 && (
            <Field label={t('ex.fSpace')}>
              <SearchableSelect value={form.space} onChange={(v) => setForm((p) => ({ ...p, space: v }))} options={spaces} placeholder={t('ex.spaceNone')} allowCustom clearable />
            </Field>
          )}

          {/* VAT breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('rc.fNet')}>
              <Input type="number" step="0.01" value={form.subtotal} onChange={(e) => setForm((p) => ({ ...p, subtotal: e.target.value }))} placeholder="net" />
            </Field>
            <Field label={t('rc.fVat', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
              <Input type="number" step="0.01" value={form.vatAmount} onChange={(e) => setForm((p) => ({ ...p, vatAmount: e.target.value }))} placeholder="VAT" />
            </Field>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('rc.itemsCount', { n: form.lineItems.length })}
              </span>
              <button
                onClick={addLine}
                className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-1 hover:opacity-80"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Plus size={11} /> {t('common.add')}
              </button>
            </div>
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {form.lineItems.map((li, i) => {
                // price is the NET unit price (without VAT); add VAT on top
                const net = (Number(li.qty) || 0) * (Number(li.price) || 0);
                const rate = Number(li.vatRate) || 0;
                const vat = net * (rate / 100);
                return (
                  <div key={i} className="bg-[color:var(--color-surface-2)] rounded-lg p-2 space-y-1.5">
                    {/* Proper (AI-refined) name + qty + price + VAT% */}
                    <div className="flex gap-1.5 items-center">
                      <input
                        value={li.refinedName}
                        onChange={(e) => updateLine(i, 'refinedName', e.target.value)}
                        placeholder={t('rc.itemNamePlaceholder')}
                        className="flex-1 min-w-0 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-[color:var(--color-accent)]"
                      />
                      <input
                        value={li.qty}
                        onChange={(e) => updateLine(i, 'qty', e.target.value)}
                        type="number"
                        title="quantity"
                        className="w-10 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-1 py-1.5 text-xs text-center focus:outline-none focus:border-[color:var(--color-accent)]"
                      />
                      <input
                        value={li.price}
                        onChange={(e) => updateLine(i, 'price', e.target.value)}
                        type="number"
                        step="0.01"
                        title="unit price (excl. VAT)"
                        className="w-16 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:border-[color:var(--color-accent)]"
                      />
                      <select
                        value={li.vatRate}
                        onChange={(e) => updateLine(i, 'vatRate', e.target.value)}
                        title="VAT %"
                        className="w-14 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-1 py-1.5 text-xs focus:outline-none focus:border-[color:var(--color-accent)]"
                      >
                        <option value="24">24%</option>
                        <option value="13">13%</option>
                        <option value="6">6%</option>
                        <option value="0">0%</option>
                      </select>
                      <button
                        onClick={() => removeLine(i)}
                        className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors p-1"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {/* Raw text + computed net/VAT for this item */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <input
                        value={li.name}
                        onChange={(e) => updateLine(i, 'name', e.target.value)}
                        placeholder={t('rc.rawTextPlaceholder')}
                        className="flex-1 min-w-0 bg-transparent border-0 px-2 py-0.5 text-[10px] text-[color:var(--color-text-faint)] focus:outline-none focus:text-[color:var(--color-text-dim)]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      {/* P64: per-line spend category. Empty = untagged (the pre-P64 state),
                          so an untouched receipt keeps behaving exactly as before. */}
                      <select
                        value={li.category}
                        onChange={(e) => updateLine(i, 'category', e.target.value)}
                        title={t('rc.lineCategory')}
                        className="shrink-0 max-w-[9rem] bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-1 py-0.5 text-[10px] text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        <option value="">{t('rc.lineCategoryNone')}</option>
                        {/* A category saved before the taxonomy was edited must stay selectable. */}
                        {(categories.includes(li.category) || !li.category ? categories : [li.category, ...categories]).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <div
                        className="shrink-0 flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)] whitespace-nowrap"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        <span>{t('rc.netVatGross', { net: `${cur()}${net.toFixed(2)}`, vat: `${cur()}${vat.toFixed(2)}` })}</span>
                        <span className="text-[color:var(--color-text-dim)]">{cur()}</span>
                        <input
                          value={li.grossStr}
                          onChange={(e) => updateLineGross(i, e.target.value)}
                          type="number"
                          step="0.01"
                          title="line total WITH VAT (edits the net back)"
                          className="w-16 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-md px-1.5 py-1 text-[11px] text-right text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {form.lineItems.length === 0 && (
                <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">
                  {t('rc.noLineItems')}
                </p>
              )}
            </div>
          </div>

          <Field label={t('v.fNotes')}>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-none"
            />
          </Field>

          {/* Add to items */}
          {form.lineItems.length > 0 && (
            <div className="pt-2 border-t border-[color:var(--color-border)]">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddToItems}
                disabled={pending}
                className="w-full justify-center"
              >
                <PackagePlus size={14} /> {t('rc.addToInventory')}
              </Button>
              {addMsg && (
                <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                  {addMsg}
                </p>
              )}
              <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1 text-center">
                {t('rc.addToInventoryHint')}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[color:var(--color-border)]">
            <Button variant="primary" size="sm" onClick={() => save(true)} disabled={pending}>
              <CheckCircle2 size={13} /> {receipt.verified ? t('common.save') : t('common.confirm')}
            </Button>
            {receipt.verified && (
              <Button variant="secondary" size="sm" onClick={() => save(false)} disabled={pending}>
                {t('rc.unverify')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleArchive} disabled={pending} title={receipt.archived ? t('rc.unarchiveTitle') : t('rc.archiveTitle')}>
              <Archive size={13} /> {receipt.archived ? t('rc.unarchive') : t('rc.notReceipt')}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={pending} className="ml-auto">
              <Trash2 size={13} /> {t('common.delete')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label
        className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
