'use client';
import { useState, useTransition, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Copy, Check, Ticket, Search, LayoutGrid, List as ListIcon, SlidersHorizontal, Sparkles, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useOpenParam } from '@/components/useOpenParam';
import { cn } from '@/components/ui/cn';
import { shrinkImage } from '@/lib/clientImage';
import type { SerializedVoucher } from '@/types';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import { createVoucher, updateVoucher, deleteVoucher, toggleVoucherUsed, scanVoucherText, scanVoucherImage } from './actions';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Used', value: 'used' },
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function VouchersClient({ vouchers }: { vouchers: SerializedVoucher[] }) {
  const t = useT();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [sortBy, setSortBy] = useState<'expiry' | 'store' | 'title'>('expiry');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedVoucher | null>(null);

  // Deep-link from global search: /vouchers?open=<id>
  useOpenParam((id) => {
    const v = vouchers.find((x) => x._id === id);
    if (v) setEditing(v);
  });

  const stores = useMemo(() => [...new Set(vouchers.map((v) => v.store).filter(Boolean))].sort(), [vouchers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = vouchers.filter((v) => {
      if (filter === 'active' && v.used) return false;
      if (filter === 'used' && !v.used) return false;
      if (storeFilter && v.store !== storeFilter) return false;
      if (q && !`${v.title} ${v.store} ${v.code} ${v.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...out].sort((a, b) => {
      if (a.used !== b.used) return a.used ? 1 : -1; // active first
      switch (sortBy) {
        case 'store':
          return (a.store || '').localeCompare(b.store || '');
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return (daysUntil(a.expiresAt) ?? 99999) - (daysUntil(b.expiresAt) ?? 99999);
      }
    });
  }, [vouchers, filter, search, storeFilter, sortBy]);

  const anyF = !!(filter !== 'all' || search || storeFilter || sortBy !== 'expiry');
  const fLabel = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const selCls =
    'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]';
  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder={t('v.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Status</p>
        <div className="flex flex-col gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                filter === f.value ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {f.value === 'all' ? t('common.all') : f.value === 'active' ? t('v.fActive') : t('v.fUsed')}
            </button>
          ))}
        </div>
      </div>
      {stores.length > 1 && (
        <div>
          <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Store</p>
          <SearchableSelect value={storeFilter} onChange={setStoreFilter} options={stores} placeholder="All stores" clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Sort</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selCls} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="expiry">{t('v.sortExpiry')}</option>
          <option value="store">{t('v.sortStore')}</option>
          <option value="title">{t('v.sortTitle')}</option>
        </select>
      </div>
      {anyF && (
        <button
          onClick={() => { setFilter('all'); setSearch(''); setStoreFilter(''); setSortBy('expiry'); }}
          className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          reset filters
        </button>
      )}
    </div>
  );

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {t('nav.vouchers')}
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('v.activeCount', { n: vouchers.filter((v) => !v.used).length })}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
            {([['grid', <LayoutGrid key="g" size={14} />], ['list', <ListIcon key="l" size={14} />]] as const).map(([v, icon]) => (
              <button
                key={v}
                onClick={() => setLayout(v)}
                title={v === 'grid' ? t('v.grid') : t('v.list')}
                className={cn('px-2 py-1.5 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
              >
                {icon}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} strokeWidth={2.5} /> {t('v.newVoucher')}
          </Button>
        </div>
      </div>

      {/* E-shop body: filter sidebar + vouchers */}
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
              <SlidersHorizontal size={14} /> Filters {anyF && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>}
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">🎟️</p>
              <p className="text-sm">{vouchers.length === 0 ? 'No vouchers here. Hit + to save a coupon or promo code.' : 'No vouchers match these filters.'}</p>
            </div>
          ) : (
            <div className={cn(layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'flex flex-col gap-2')}>
              {visible.map((v) => (
                <VoucherCard key={v._id} voucher={v} onEdit={() => setEditing(v)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('v.newVoucher')} size="xl">
        <VoucherForm onSuccess={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.title} size="xl">
          <VoucherForm voucher={editing} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

function VoucherCard({ voucher, onEdit }: { voucher: SerializedVoucher; onEdit: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  const d = daysUntil(voucher.expiresAt);
  const expired = d !== null && d < 0;

  function copy() {
    if (!voucher.code) return;
    navigator.clipboard?.writeText(voucher.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function handleDelete() {
    const ok = await confirm({ title: t('v.deleteVoucher'), message: t('v.confirmDelete', { title: voucher.title }), confirmLabel: t('common.delete'), danger: true });
    if (ok) startTransition(() => deleteVoucher(voucher._id));
  }

  return (
    <div className={cn('group bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4 transition-all', voucher.used && 'opacity-50')}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
            {voucher.title}
          </h3>
          {voucher.store && <p className="text-xs text-[color:var(--color-text-faint)] truncate">{voucher.store}</p>}
        </div>
        {voucher.discount && (
          <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-md bg-[#00ff8820] text-[color:var(--color-accent)] border border-[#00ff8840]" style={{ fontFamily: 'var(--font-mono)' }}>
            {voucher.discount}
          </span>
        )}
      </div>

      {voucher.code && (
        <button
          onClick={copy}
          className="w-full flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] border border-dashed border-[color:var(--color-border-light)] rounded-lg px-3 py-2 mb-2 hover:border-[color:var(--color-accent)] transition-colors"
        >
          <span className="text-sm font-bold tracking-wider truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {voucher.code}
          </span>
          {copied ? <Check size={14} className="text-[color:var(--color-accent)] shrink-0" /> : <Copy size={13} className="text-[color:var(--color-text-faint)] shrink-0" />}
        </button>
      )}

      <div className="flex items-center gap-2 text-[10px] mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
        {voucher.expiresAt ? (
          <span className={cn(expired ? 'text-[color:var(--color-red)]' : d! <= 7 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text-faint)]')}>
            {expired ? t('v.expired') : t('v.expiresInD', { d: d ?? 0 })}
          </span>
        ) : (
          <span className="text-[color:var(--color-text-faint)]">{t('v.noExpiry')}</span>
        )}
        {voucher.used && <span className="text-[color:var(--color-text-faint)]">· {t('v.usedTag')}</span>}
      </div>

      <div className="flex items-center gap-1 pt-2 border-t border-[color:var(--color-border)]">
        <button
          onClick={() => startTransition(() => toggleVoucherUsed(voucher._id, !voucher.used))}
          disabled={pending}
          className={cn('flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors', voucher.used ? 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]' : 'text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]')}
        >
          <Check size={12} /> {voucher.used ? t('v.markUnused') : t('v.markUsed')}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]" aria-label="Edit">
          <Pencil size={13} />
        </button>
        {voucher.url && (
          <a href={voucher.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] hover:bg-[color:var(--color-surface-2)]" aria-label="Open">
            <ExternalLink size={13} />
          </a>
        )}
        <button onClick={handleDelete} disabled={pending} className="ml-auto p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 transition-all" aria-label="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function VoucherForm({ voucher, onSuccess, onDeleted }: { voucher?: SerializedVoucher; onSuccess: () => void; onDeleted?: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    title: voucher?.title ?? '',
    code: voucher?.code ?? '',
    store: voucher?.store ?? '',
    discount: voucher?.discount ?? '',
    expiresAt: voucher?.expiresAt ? voucher.expiresAt.slice(0, 10) : '',
    url: voucher?.url ?? '',
    notes: voucher?.notes ?? '',
  });

  async function handleDelete() {
    if (!voucher) return;
    const ok = await confirm({ title: t('v.deleteVoucher'), message: t('v.confirmDelete', { title: voucher.title }), confirmLabel: t('common.delete'), danger: true });
    if (ok) startTransition(async () => { await deleteVoucher(voucher._id); onDeleted?.(); });
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  // ── AI scan: paste text or upload a coupon image → prefill the form ──
  const [aiText, setAiText] = useState('');
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  function applyParsed(d: { title: string; code: string; store: string; discount: string; expiresAt: string; url: string; notes: string }) {
    setForm((p) => ({
      title: d.title || p.title,
      code: d.code || p.code,
      store: d.store || p.store,
      discount: d.discount || p.discount,
      expiresAt: /^\d{4}-\d{2}-\d{2}/.test(d.expiresAt) ? d.expiresAt.slice(0, 10) : p.expiresAt,
      url: d.url || p.url,
      notes: d.notes || p.notes,
    }));
    setAiMsg('Filled from AI ✓ — review & save');
  }
  function scanText() {
    setAiMsg('Reading…');
    startTransition(async () => {
      const r = await scanVoucherText(aiText);
      if (r.ok) applyParsed(r.data);
      else setAiMsg(r.error);
    });
  }
  function scanImage(file: File | undefined) {
    if (!file) return;
    setAiMsg('Reading image…');
    startTransition(async () => {
      let f = file;
      try {
        f = await shrinkImage(file);
      } catch {
        /* use original */
      }
      const fd = new FormData();
      fd.set('file', f);
      const r = await scanVoucherImage(fd);
      if (r.ok) applyParsed(r.data);
      else setAiMsg(r.error);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      if (voucher) await updateVoucher(voucher._id, fd);
      else await createVoucher(fd);
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!voucher && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-cyan)] flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            <Sparkles size={12} /> {t('v.fillAi')}
          </p>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={2}
            placeholder={t('v.aiPlaceholder')}
            className="w-full bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[color:var(--color-accent)]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={scanText} disabled={pending || !aiText.trim()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {t('v.scanText')}
            </button>
            <button type="button" onClick={() => aiFileRef.current?.click()} disabled={pending} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)] disabled:opacity-50">
              <Upload size={13} /> {t('v.scanImage')}
            </button>
            <input ref={aiFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanImage(e.target.files?.[0])} />
            {aiMsg && <span className="text-[11px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{aiMsg}</span>}
          </div>
        </div>
      )}
      <Field label={t('v.fTitle')}>
        <Input value={form.title} onChange={set('title')} required placeholder={t('v.fTitlePlaceholder')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('v.fCode')}>
          <Input value={form.code} onChange={set('code')} placeholder="SAVE10" style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <Field label={t('v.fDiscount')}>
          <Input value={form.discount} onChange={set('discount')} placeholder={t('v.fDiscountPlaceholder')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('v.fStore')}>
          <Input value={form.store} onChange={set('store')} placeholder={t('v.fStorePlaceholder')} />
        </Field>
        <Field label={t('v.fExpires')}>
          <Input type="date" value={form.expiresAt} onChange={set('expiresAt')} />
        </Field>
      </div>
      <Field label="URL">
        <Input value={form.url} onChange={set('url')} placeholder="https://..." />
      </Field>
      <Field label={t('v.fNotes')}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-none"
        />
      </Field>
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('v.saving') : voucher ? t('common.save') : t('v.create')}
        </Button>
        {voucher && onDeleted && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={handleDelete} disabled={pending}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
