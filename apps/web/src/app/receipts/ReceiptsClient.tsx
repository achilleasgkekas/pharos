'use client';
import { cur } from "@/lib/money";
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
import { QuickVerify } from './QuickVerify';
import { useJobs } from '@/components/JobsProvider';
import { enqueueRescanReceipts, getBulkAiGuard } from '@/app/jobActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DuplicatesModal } from './DuplicatesModal';
import { useRouter } from 'next/navigation';

function fileUrl(filePath: string) {
  const u = `/api/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  // Email receipts (.html) were briefly served as octet-stream and cached 'immutable'
  // for a year, so they download instead of rendering. A version query is a fresh
  // cache key that escapes that poisoned entry (the route ignores query params).
  return /\.html?$/i.test(filePath) ? `${u}?v=2` : u;
}

// ─── Main component ────────────────────────────────────────────────────────

export function ReceiptsClient({
  receipts,
  cards,
  ollamaUp,
  storeNames,
  emailInboxCount,
}: {
  receipts: SerializedReceipt[];
  cards: SerializedCard[];
  ollamaUp: boolean;
  storeNames: string[];
  emailInboxCount: number;
}) {
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
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Ingest the staged Gmail attachments (from scripts/extract-email-receipts.py) as
  // draft receipts. They then appear as "failed" → use "re-scan all" to AI-parse.
  async function handleImportEmail() {
    if (importing) return;
    setImporting(true);
    setImportMsg('Importing from email…');
    try {
      const r = await importEmailInbox();
      setImportMsg(
        r.ok
          ? `Imported ${r.imported}${r.skipped ? `, ${r.skipped} skipped` : ''}. Now click “re-scan all (OCR)” to parse them.`
          : r.error || 'Import failed'
      );
      router.refresh();
    } catch (e) {
      setImportMsg(`Failed: ${(e as Error).message.slice(0, 80)}`);
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
        title: `Re-scan ${failedReceipts.length} receipt${failedReceipts.length === 1 ? '' : 's'} with AI?`,
        message:
          g.provider === 'anthropic'
            ? `Cloud · ${g.model}. Rough cost ~$${(failedReceipts.length * 0.02).toFixed(2)} (≈$0.02/receipt). Background job.`
            : `Local · ${g.model}. Free, but slow. Background job.`,
        confirmLabel: 'Re-scan',
      });
      if (!ok) return;
    }
    void enqueueRescanReceipts(
      failedReceipts.map((r) => r._id),
      failedReceipts.map((r) => r.store || 'receipt'),
      true
    ).then(refresh);
  }

  // Distinct stores for the per-store filter dropdown
  const stores = useMemo(
    () => [...new Set(receipts.map((r) => r.store).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [receipts]
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = receipts.filter((r) => {
      // Archived receipts are hidden everywhere except the explicit "archived" view.
      if (statusFilter === 'archived') {
        if (!r.archived) return false;
      } else if (r.archived) {
        return false;
      }
      if (storeFilter && r.store !== storeFilter) return false;
      if (statusFilter !== 'all' && statusFilter !== 'archived') {
        const empty = r.total === 0 && (r.lineItems?.length ?? 0) === 0;
        if (statusFilter === 'verified' && !r.verified) return false;
        if (statusFilter === 'failed' && !(!r.verified && empty)) return false;
        if (statusFilter === 'parsed' && !(!r.verified && !empty)) return false;
      }
      if (q) {
        const hay = `${r.store} ${r.notes} ${(r.lineItems ?? []).map((l) => l.name || l.refinedName).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
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
          return (a.store || '').localeCompare(b.store || '');
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [receipts, storeFilter, statusFilter, search, sortBy]);

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
      const base = ollamaUp ? 'AI parsing' : 'Saving (AI offline)';
      const tail = failed ? ` · ${failed} failed` : '';
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
        ? `Imported ${okCount}/${total}. ${failed} failed${lastError ? `: ${lastError}` : ''}.`
        : lastAiError
          ? `${lastAiError}. Saved for manual entry.`
          : total > 1
            ? `Imported ${total} receipts ✓`
            : null
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const anyRFilter = !!(storeFilter || statusFilter !== 'all' || search || sortBy !== 'recent');
  const resetRFilters = () => {
    setStoreFilter('');
    setStatusFilter('all');
    setSearch('');
    setSortBy('recent');
  };
  const labelCls = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const selCls =
    'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]';

  // Shared filter controls — left sidebar (desktop) + drawer (mobile)
  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder="Search store, item, notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Status</p>
        <div className="flex flex-col gap-1">
          {([
            ['all', 'All'],
            ['verified', '✓ Verified'],
            ['parsed', '✨ Parsed'],
            ['failed', '⚠ Needs scan'],
            ['archived', '🗄 Archived'],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {stores.length > 0 && (
        <div>
          <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Store</p>
          <SearchableSelect value={storeFilter} onChange={setStoreFilter} options={stores} placeholder="All stores" clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Sort</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selCls} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total-desc">Total high→low</option>
          <option value="total-asc">Total low→high</option>
          <option value="store">Store A→Z</option>
        </select>
      </div>
      {anyRFilter && (
        <button onClick={resetRFilters} className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline" style={{ fontFamily: 'var(--font-mono)' }}>
          reset all filters
        </button>
      )}
    </div>
  );

  return (
    <main className="max-w-[1500px] mx-auto px-4 py-6 pb-16">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Receipts
            <span
              className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {receipts.length}
            </span>
          </h1>
          <div
            className="flex items-center gap-4 text-xs text-[color:var(--color-text-dim)]"
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
                  title={v === 'grid' ? 'Grid' : 'List'}
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
              title="Scan for duplicate receipts (same store, day and total) and merge them"
            >
              find duplicates
            </button>
            {toVerify.length > 0 && (
              <button
                onClick={() => setQuickVerify(true)}
                className="flex items-center gap-1.5 text-[color:var(--color-accent)] hover:opacity-80 transition-opacity font-semibold"
                title="Rapidly review and confirm the parsed receipts, one at a time"
              >
                <Zap size={13} /> Quick verify ({toVerify.length})
              </button>
            )}
            {failedCount > 0 && (
              <button
                onClick={handleRescanFailed}
                disabled={rescanBusy}
                className="text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)] disabled:opacity-60"
                title="Re-scan every unverified receipt that came out empty (€0 / no items), with auto-rotate OCR. Runs in the background."
              >
                {rescanBusy ? 'Re-scanning…' : `${failedCount} failed · re-scan all (OCR)`}
              </button>
            )}
            {emailInboxCount > 0 && (
              <button
                onClick={handleImportEmail}
                disabled={importing}
                className="text-[color:var(--color-purple)] hover:text-[color:var(--color-accent)] disabled:opacity-60"
                title="Import the receipt attachments extracted from your Gmail Takeout (scripts/extract-email-receipts.py) as draft receipts"
              >
                {importing ? 'Importing…' : `📧 import ${emailInboxCount} from email`}
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
              Drop receipts here or click
            </p>
            <p className="text-xs text-[color:var(--color-text-faint)]">
              {ollamaUp
                ? 'JPG/PNG/PDF · AI auto-parse (vendor, items, total)'
                : 'JPG/PNG/PDF · manual entry (AI offline)'}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"
            >
              <Camera size={14} /> Take photo
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
        <div className="mb-4 text-sm text-[color:var(--color-red)] flex items-center gap-2">
          <AlertTriangle size={14} /> {uploadMsg}
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
              <SlidersHorizontal size={14} /> Filters {anyRFilter && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && (
              <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {visible.length} {visible.length === 1 ? 'receipt' : 'receipts'}
              {visible.length !== receipts.length ? ` / ${receipts.length}` : ''}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">🧾</p>
              <p className="text-sm">{receipts.length === 0 ? 'No receipts yet.' : 'No receipts match these filters.'}</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visible.map((r) => (
                <ReceiptCard key={r._id} receipt={r} onClick={() => setSelected(r)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((r) => (
                <ReceiptRow key={r._id} receipt={r} onClick={() => setSelected(r)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <ReceiptDetailModal receipt={selected} cards={cards} storeNames={storeNames} onClose={() => setSelected(null)} />
      )}

      {/* Duplicate finder + merge */}
      <DuplicatesModal open={showDupes} onClose={() => setShowDupes(false)} />

      {/* Rapid review queue */}
      {quickVerify && (
        <QuickVerify
          receipts={toVerify}
          stores={storeNames}
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
function ReceiptRow({ receipt, onClick }: { receipt: SerializedReceipt; onClick: () => void }) {
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
          {receipt.store || 'Unknown store'}
        </span>
        <span className="text-[10px] text-[color:var(--color-text-faint)] block mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB')} · {receipt.lineItems?.length ?? 0} items
          {receipt.fileType === 'pdf' ? ' · pdf' : isHtml ? ' · email' : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
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
  onClick,
}: {
  receipt: SerializedReceipt;
  onClick: () => void;
}) {
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
            <span title="Archived — not a real receipt" className="flex items-center justify-center w-6 h-6 rounded-full bg-black/50 border border-[color:var(--color-border)]">
              <Archive size={12} className="text-[color:var(--color-text-faint)]" />
            </span>
          ) : receipt.verified ? (
            <span title="Verified — done" className="flex items-center justify-center w-6 h-6 rounded-full bg-[#00ff8820] border border-[#00ff8840]">
              <CheckCircle2 size={13} className="text-[color:var(--color-accent)]" />
            </span>
          ) : receipt.total > 0 || (receipt.lineItems?.length ?? 0) > 0 ? (
            <span title="AI-parsed — needs your review" className="flex items-center justify-center w-6 h-6 rounded-full bg-[#00d4ff20] border border-[#00d4ff40]">
              <Sparkles size={12} className="text-[color:var(--color-cyan)]" />
            </span>
          ) : (
            <span title="Empty / failed — needs re-scan" className="flex items-center justify-center w-6 h-6 rounded-full bg-[#ffd93d20] border border-[#ffd93d40]">
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
        <div
          className="text-[10px] text-[color:var(--color-text-faint)] mt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {new Date(receipt.date).toLocaleDateString('en-GB')}
          {receipt.lineItems.length > 0 && ` · ${receipt.lineItems.length} items`}
        </div>
      </div>
    </button>
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
  currency: string;
  paymentMethod: string;
  notes: string;
  // `price` = unit NET (excl. VAT, the stored value). `grossStr` = the line GROSS
  // (qty × net × (1+rate)), kept as its own editable string so the user can type
  // the with-VAT figure freely; net and gross stay in sync both directions.
  lineItems: { name: string; refinedName: string; qty: string; price: string; vatRate: string; grossStr: string }[];
};

/** Line gross (with VAT) from the net-side fields, as a 2-decimal string. */
function lineGross(unitNet: string, qty: string, vatRate: string): string {
  const net = (Number(unitNet) || 0) * (Number(qty) || 1);
  return (net * (1 + (Number(vatRate) || 0) / 100)).toFixed(2);
}

function ReceiptDetailModal({
  receipt,
  cards,
  storeNames,
  onClose,
}: {
  receipt: SerializedReceipt;
  cards: SerializedCard[];
  storeNames: string[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isImage = receipt.fileType.startsWith('image/');
  const confirm = useConfirm();

  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const buildForm = (r: SerializedReceipt): EditState => ({
    store: r.store,
    date: r.date.slice(0, 10),
    total: r.total.toString(),
    subtotal: (r.subtotal || 0).toString(),
    vatAmount: (r.vatAmount || 0).toString(),
    warrantyMonths: (r.warrantyMonths ?? 24).toString(),
    currency: r.currency,
    paymentMethod: r.paymentMethod,
    notes: r.notes,
    lineItems: r.lineItems.map((li) => ({
      name: li.name,
      refinedName: li.refinedName || '',
      qty: li.qty.toString(),
      price: li.price.toString(),
      vatRate: (li.vatRate ?? 24).toString(),
      grossStr: lineGross(li.price.toString(), li.qty.toString(), (li.vatRate ?? 24).toString()),
    })),
  });
  const [form, setForm] = useState<EditState>(() => buildForm(receipt));

  // Re-run the AI scan on the stored file. The action returns the updated receipt,
  // so we re-sync the form (store/total/items) in place — no reopening needed.
  function handleRescan(useOcr: boolean) {
    setRescanMsg(useOcr ? 'Re-scanning with OCR…' : 'Re-scanning…');
    startTransition(async () => {
      try {
        const r = await rescanReceipt(receipt._id, useOcr);
        if (r.ok && r.receipt) setForm(buildForm(r.receipt));
        setRescanMsg(
          r.ok && r.aiUsed ? `Re-scanned ✓ (${r.model})` : `Failed: ${r.aiError || r.error || 'no result'}`
        );
      } catch (e) {
        // Catch a failed Server Action (e.g. stale bundle after a redeploy) so it
        // shows here instead of bubbling to the page error boundary ("crash").
        const m = (e as Error).message || 'request failed';
        setRescanMsg(
          /server action|fetch|chunk|deploy/i.test(m)
            ? 'App was updated — reload the page (⌘/Ctrl+Shift+R) and try again.'
            : `Failed: ${m.slice(0, 100)}`
        );
      }
    });
  }

  async function save(verified: boolean) {
    const alreadyAdded = (receipt.itemIds?.length ?? 0) > 0;
    let addToInventory = false;
    if (verified && form.lineItems.length > 0 && !alreadyAdded) {
      addToInventory = await confirm({
        title: 'Add to Inventory?',
        message: `Add the ${form.lineItems.length} items to the Inventory (with their proper names)?`,
        confirmLabel: 'Add',
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
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        verified,
        lineItems: form.lineItems.map((li) => ({
          name: li.name,
          refinedName: li.refinedName,
          qty: Number(li.qty) || 1,
          price: Number(li.price) || 0,
          vatRate: Number(li.vatRate) || 0,
        })),
      });
      if (addToInventory) await addReceiptItemsToLibrary(receipt._id);
      onClose();
    });
  }

  function handleAddToItems() {
    startTransition(async () => {
      const r = await addReceiptItemsToLibrary(receipt._id);
      setAddMsg(r.ok ? `✓ ${r.created} new, ${r.linked} linked to Inventory` : r.error || 'Error');
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete receipt',
      message: `Delete receipt "${receipt.store}"?`,
      confirmLabel: 'Delete',
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
  const updateLine = (i: number, k: 'name' | 'refinedName' | 'qty' | 'price' | 'vatRate', v: string) =>
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
        { name: '', refinedName: '', qty: '1', price: '0', vatRate: '24', grossStr: '0' },
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
          <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wide">Re-scan:</span>
          <button
            onClick={() => handleRescan(true)}
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] disabled:opacity-50"
          >
            <Sparkles size={10} className="inline mr-0.5" /> OCR
          </button>
          <button
            onClick={() => handleRescan(false)}
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            no OCR
          </button>
          {rescanMsg && <span className="text-[10px] text-[color:var(--color-text-dim)] truncate max-w-[200px]">{rescanMsg}</span>}
        </div>
        {receipt.aiModel && (
          <span className="text-[10px] text-[color:var(--color-text-faint)] flex items-center gap-1 shrink-0">
            <Sparkles size={10} /> parsed by {receipt.aiModel}
          </span>
        )}
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
                  <FileText size={28} strokeWidth={1.5} /> <span className="text-xs">Tap to open the PDF</span>
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
                <FileText size={12} /> Open in new tab
              </a>
            </div>
          )}
        </div>

        {/* Edit form */}
        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Store">
              <SearchableSelect
                value={form.store}
                onChange={(v) => setForm((p) => ({ ...p, store: v }))}
                options={storeNames}
                placeholder="pick or type a store"
                allowCustom
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </Field>
          </div>
          {/* Total — the key number, on its own wide row so it's never cramped */}
          <Field label={`Total incl. VAT (${cur()})`}>
            <div className="flex items-center gap-2">
              <Input type="number" step="0.01" value={form.total} onChange={(e) => setForm((p) => ({ ...p, total: e.target.value }))} className="flex-1 min-w-0 text-base font-semibold" />
              <button
                type="button"
                onClick={fillTotalsFromItems}
                disabled={form.lineItems.length === 0}
                title="Fill total / net / VAT from the sum of the line items below"
                className="shrink-0 px-2.5 py-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)] text-[11px] leading-none hover:border-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                ∑ items
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment">
              <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => setForm((p) => ({ ...p, paymentMethod: v }))} />
            </Field>
            <Field label="Warranty (months)">
              <Input type="number" min="0" value={form.warrantyMonths} onChange={(e) => setForm((p) => ({ ...p, warrantyMonths: e.target.value }))} placeholder="24" />
            </Field>
          </div>

          {/* VAT breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Net (excl. VAT)">
              <Input type="number" step="0.01" value={form.subtotal} onChange={(e) => setForm((p) => ({ ...p, subtotal: e.target.value }))} placeholder="net" />
            </Field>
            <Field label={`VAT (${cur()})`}>
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
                Items ({form.lineItems.length})
              </span>
              <button
                onClick={addLine}
                className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-1 hover:opacity-80"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Plus size={11} /> add
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
                        placeholder="Proper product name (AI)"
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
                        placeholder="raw receipt text"
                        className="flex-1 min-w-0 bg-transparent border-0 px-2 py-0.5 text-[10px] text-[color:var(--color-text-faint)] focus:outline-none focus:text-[color:var(--color-text-dim)]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <div
                        className="shrink-0 flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)] whitespace-nowrap"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        <span>net {cur()}{net.toFixed(2)} · VAT {cur()}{vat.toFixed(2)} · gross</span>
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
                  No line items
                </p>
              )}
            </div>
          </div>

          <Field label="Notes">
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
                <PackagePlus size={14} /> Add items to the Inventory
              </Button>
              {addMsg && (
                <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                  {addMsg}
                </p>
              )}
              <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1 text-center">
                Creates/links Inventory items with proper names + links back to the receipt
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[color:var(--color-border)]">
            <Button variant="primary" size="sm" onClick={() => save(true)} disabled={pending}>
              <CheckCircle2 size={13} /> {receipt.verified ? 'Save' : 'Confirm'}
            </Button>
            {receipt.verified && (
              <Button variant="secondary" size="sm" onClick={() => save(false)} disabled={pending}>
                Unverify
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleArchive} disabled={pending} title={receipt.archived ? 'Restore — treat as a real receipt again' : 'Not a real receipt (shipping/order email) — hide it'}>
              <Archive size={13} /> {receipt.archived ? 'Unarchive' : 'Not a receipt'}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={pending} className="ml-auto">
              <Trash2 size={13} /> Delete
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
