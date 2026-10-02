'use client';
import { useState, useTransition, useMemo, useRef } from 'react';
import { Pencil, Trash2, ExternalLink, Copy, Check, Search, Sparkles, Upload, Loader2, Ticket } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { DateInput } from '@/components/ui/DateInput';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PAGE_MAIN, PageHeader, ViewToggle, PrimaryAction, FilterLayout, FilterSection, FilterOptions } from '@/components/ui/PageHeader';
import { Input, compactControlClass, controlClass, filterControlClass } from '@/components/ui/Input';
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
import { compareNames } from '@/lib/i18n/format';
import { useLocale } from '@/components/LocaleProvider';

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
  const locale = useLocale();
  const t = useT();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [sortBy, setSortBy] = useState<'expiry' | 'store' | 'title'>('expiry');
  const [layout, setLayout] = useState<'grid' | 'list'>('list');
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
          return compareNames(a.store, b.store, locale);
        case 'title':
          return compareNames(a.title, b.title, locale);
        default:
          return (daysUntil(a.expiresAt) ?? 99999) - (daysUntil(b.expiresAt) ?? 99999);
      }
    });
  }, [vouchers, filter, search, storeFilter, sortBy]);

  const anyF = !!(filter !== 'all' || search || storeFilter || sortBy !== 'expiry');
  const searchBox = <Input icon={<Search size={15} />} type="search" placeholder={t('v.searchPlaceholder')} aria-label={t('v.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />;
  const statusSwitch = (
    <FilterOptions
      variant="segmented"
      value={filter}
      onChange={setFilter}
      options={FILTERS.map((f) => ({ value: f.value, label: f.value === 'all' ? t('common.all') : f.value === 'active' ? t('v.fActive') : t('v.fUsed') }))}
    />
  );
  const filterControls = (
    <div>
      {stores.length > 1 && (
        <FilterSection label={t('v.fStore')}>
          <SearchableSelect value={storeFilter} onChange={setStoreFilter} options={stores} placeholder={t('it.allStores')} clearable size="sm" className="w-full" />
        </FilterSection>
      )}
      <FilterSection label={t('common.sort')}>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={filterControlClass} aria-label={t('common.sort')}>
          <option value="expiry">{t('v.sortExpiry')}</option>
          <option value="store">{t('v.sortStore')}</option>
          <option value="title">{t('v.sortTitle')}</option>
        </select>
      </FilterSection>
      {anyF && (
        <div className="self-end">
          <button
            onClick={() => { setFilter('all'); setSearch(''); setStoreFilter(''); setSortBy('expiry'); }}
            className="h-10 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] underline"
          >
            {t('common.resetFilters')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.vouchers')} count={t('v.activeCount', { n: vouchers.filter((v) => !v.used).length })}>
        <ViewToggle value={layout} onChange={setLayout} />
        <PrimaryAction onClick={() => setShowCreate(true)} />
      </PageHeader>

      <FilterLayout search={searchBox} quick={statusSwitch} filters={filterControls} active={anyF}>
          {visible.length === 0 ? (
            <EmptyState icon={<Ticket />} title={vouchers.length === 0 ? t('v.empty') : t('ex.emptyFiltered')} />
          ) : (
            <div className={cn(layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden divide-y divide-[color:var(--color-border)]')}>
              {visible.map((v) =>
                layout === 'grid' ? (
                  <VoucherCard key={v._id} voucher={v} onEdit={() => setEditing(v)} />
                ) : (
                  <VoucherRow key={v._id} voucher={v} onEdit={() => setEditing(v)} />
                )
              )}
            </div>
          )}
      </FilterLayout>

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

/** What the card and the list row both need, so the two layouts cannot drift apart on
 *  what "copy", "delete" or the expiry countdown do. */
function useVoucherRow(voucher: SerializedVoucher) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  const d = daysUntil(voucher.expiresAt);

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
  return { pending, startTransition, copied, copy, handleDelete, d, expired: d !== null && d < 0 };
}

function expiryTone(expired: boolean, d: number | null) {
  return expired ? 'text-[color:var(--color-red)]' : d !== null && d <= 7 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text-faint)]';
}

function VoucherCard({ voucher, onEdit }: { voucher: SerializedVoucher; onEdit: () => void }) {
  const t = useT();
  const { pending, startTransition, copied, copy, handleDelete, d, expired } = useVoucherRow(voucher);

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
          <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-md bg-[color:var(--color-accent)]/13 text-[color:var(--color-accent)] border border-[color:var(--color-accent)]/25" style={{ fontFamily: 'var(--font-mono)' }}>
            {voucher.discount}
          </span>
        )}
      </div>

      {voucher.code && (
        <button
          onClick={copy}
          className="w-full flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] border border-dashed border-[color:var(--color-border-light)] rounded-lg px-3 py-2 mb-2 hover:border-[color:var(--color-accent)] transition-colors"
        >
          <span className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {voucher.code}
          </span>
          {copied ? <Check size={14} className="text-[color:var(--color-accent)] shrink-0" /> : <Copy size={13} className="text-[color:var(--color-text-faint)] shrink-0" />}
        </button>
      )}

      <div className="flex items-center gap-2 text-[11px] mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
        {voucher.expiresAt ? (
          <span className={expiryTone(expired, d)}>
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
          className={cn('flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors', voucher.used ? 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]' : 'text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]')}
        >
          <Check size={12} /> {voucher.used ? t('v.markUnused') : t('v.markUsed')}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]" aria-label={t('common.edit')}>
          <Pencil size={13} />
        </button>
        {voucher.url && (
          <a href={voucher.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] hover:bg-[color:var(--color-surface-2)]" aria-label="Open">
            <ExternalLink size={13} />
          </a>
        )}
        <button onClick={handleDelete} disabled={pending} className="ml-auto p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-all" aria-label="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/** The list layout used to render VoucherCard in one column — on a phone, where the grid is
 *  one column too, the toggle changed nothing (same bug Subscriptions had, #310). A row is the
 *  scan view: which voucher, when it lapses, how much it is worth, and the code one tap away
 *  from the clipboard — the thing you actually need at a till. The whole title opens the editor. */
function VoucherRow({ voucher, onEdit }: { voucher: SerializedVoucher; onEdit: () => void }) {
  const t = useT();
  const { pending, startTransition, copied, copy, handleDelete, d, expired } = useVoucherRow(voucher);
  const mono = { fontFamily: 'var(--font-mono)' };

  return (
    <div className={cn('group flex items-center gap-3 hover:bg-[color:var(--color-surface-2)] px-3 sm:px-4 py-2.5 transition-colors', voucher.used && 'opacity-50')}>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" aria-label={`${t('common.edit')}: ${voucher.title}`}>
        <span className="block text-[15px] font-semibold truncate">
          {voucher.title}
          {voucher.store && <span className="text-[color:var(--color-text-faint)] font-normal"> · {voucher.store}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs">
          {voucher.discount && <span className="font-bold text-[color:var(--color-accent)]">{voucher.discount}</span>}
          <span className={voucher.expiresAt ? expiryTone(expired, d) : 'text-[color:var(--color-text-faint)]'}>
            {voucher.expiresAt ? (expired ? t('v.expired') : t('v.expiresInD', { d: d ?? 0 })) : t('v.noExpiry')}
          </span>
          {voucher.used && <span className="text-[color:var(--color-text-faint)]">{t('v.usedTag')}</span>}
        </span>
      </button>
      {voucher.code && (
        <button
          type="button"
          onClick={copy}
          title={voucher.code}
          className="shrink-0 max-w-[7.5rem] flex items-center gap-1.5 border border-dashed border-[color:var(--color-border-light)] bg-[color:var(--color-surface-2)] rounded-md px-2 py-1 hover:border-[color:var(--color-accent)] transition-colors"
        >
          <span className="text-xs font-bold truncate" style={mono}>{voucher.code}</span>
          {copied ? <Check size={12} className="text-[color:var(--color-accent)] shrink-0" /> : <Copy size={11} className="text-[color:var(--color-text-faint)] shrink-0" />}
        </button>
      )}
      <div className="flex shrink-0">
        <button
          onClick={() => startTransition(() => toggleVoucherUsed(voucher._id, !voucher.used))}
          disabled={pending}
          title={voucher.used ? t('v.markUnused') : t('v.markUsed')}
          aria-label={voucher.used ? t('v.markUnused') : t('v.markUsed')}
          className={cn('p-1.5 rounded-md transition-colors', voucher.used ? 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]' : 'text-[color:var(--color-accent)]')}
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100"
          aria-label={t('common.delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function VoucherForm({ voucher, onSuccess, onDeleted }: { voucher?: SerializedVoucher; onSuccess: () => void; onDeleted?: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [error, setError] = useState('');
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
    setError('');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      try {
        if (voucher) await updateVoucher(voucher._id, fd);
        else await createVoucher(fd);
        onSuccess();
      } catch (err) {
        setError((err as Error).message || 'Save failed');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!voucher && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 space-y-2">
          <p className="text-[11px] text-[color:var(--color-cyan)] flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            <Sparkles size={12} /> {t('v.fillAi')}
          </p>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={2}
            placeholder={t('v.aiPlaceholder')}
            className={cn(compactControlClass, 'w-full resize-y')}
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
          <Input value={form.code} onChange={set('code')} placeholder="SAVE10" style={{ fontFamily: 'var(--font-code)' }} />
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
          <DateInput value={form.expiresAt} onValueChange={(v) => setForm((p) => ({ ...p, expiresAt: v }))} />
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
          className={cn(controlClass, 'w-full resize-none')}
        />
      </Field>
      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('v.saving') : voucher ? t('common.save') : t('v.create')}
        </Button>
        {voucher && onDeleted && (
          <Button type="button" variant="danger" className="ml-auto" onClick={handleDelete} disabled={pending}>
            <Trash2 size={15} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

