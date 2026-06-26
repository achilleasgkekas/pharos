'use client';
import { useState, useRef, useTransition, useMemo } from 'react';
import { Camera, Plus, Check, Loader2, Trash2, Sparkles, ShoppingBasket, LayoutGrid, List as ListIcon, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useT } from '@/components/LocaleProvider';
import { shrinkImage } from '@/lib/clientImage';
import {
  addListItem,
  toggleListItem,
  deleteListItem,
  clearChecked,
  scanProductPhoto,
  getListItems,
  type SerializedListItem,
} from './actions';

type Draft = { name: string; quantity: string; category: string; brand: string };
type StatusFilter = 'all' | 'todo' | 'bought';
const mono = { fontFamily: 'var(--font-mono)' };

export function ShoppingListClient({ initialItems }: { initialItems: SerializedListItem[] }) {
  const t = useT();
  const [items, setItems] = useState<SerializedListItem[]>(initialItems);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [, start] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  // E-shop layout state (mirrors the other pages)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const todo = useMemo(() => items.filter((i) => !i.checked), [items]);
  const done = useMemo(() => items.filter((i) => i.checked), [items]);
  const cats = useMemo(
    () => Array.from(new Set(items.map((i) => (i.category || '').trim()).filter(Boolean))).sort(),
    [items]
  );

  const visible = useMemo(() => {
    let list = items;
    if (statusFilter === 'todo') list = list.filter((i) => !i.checked);
    else if (statusFilter === 'bought') list = list.filter((i) => i.checked);
    if (catFilter) list = list.filter((i) => (i.category || '').toLowerCase() === catFilter.toLowerCase());
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || (i.brand || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q));
    // Unchecked first, newest first within each group
    return [...list].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  }, [items, statusFilter, catFilter, search]);

  async function resync() {
    try {
      setItems(await getListItems());
    } catch {
      /* keep optimistic state */
    }
  }

  function quickAdd() {
    const n = name.trim();
    if (!n) return;
    const q = qty.trim();
    setName('');
    setQty('');
    const tmp: SerializedListItem = {
      _id: 'tmp-' + Date.now(), name: n, quantity: q, category: '', brand: '', note: '', checked: false, aiScanned: false, createdAt: new Date().toISOString(),
    };
    setItems((p) => [tmp, ...p]);
    start(async () => {
      await addListItem({ name: n, quantity: q });
      await resync();
    });
  }

  function toggle(it: SerializedListItem) {
    const next = !it.checked;
    setItems((p) => p.map((x) => (x._id === it._id ? { ...x, checked: next } : x)));
    start(() => void toggleListItem(it._id, next));
  }
  function remove(it: SerializedListItem) {
    setItems((p) => p.filter((x) => x._id !== it._id));
    start(() => void deleteListItem(it._id));
  }
  function clearBought() {
    setItems((p) => p.filter((x) => !x.checked));
    start(() => void clearChecked());
  }

  async function onPhoto(file: File | undefined) {
    if (cameraRef.current) cameraRef.current.value = '';
    if (!file) return;
    setScanErr(null);
    setScanning(true);
    try {
      const small = await shrinkImage(file);
      const fd = new FormData();
      fd.set('file', small);
      const r = await scanProductPhoto(fd);
      if (r.ok) {
        setDraft({ name: r.data.name, quantity: r.data.quantity, category: r.data.category, brand: r.data.brand });
      } else {
        setScanErr(r.error);
      }
    } catch (e) {
      setScanErr((e as Error).message.slice(0, 120));
    } finally {
      setScanning(false);
    }
  }

  function addDraft() {
    if (!draft || !draft.name.trim()) return;
    const d = draft;
    setSaving(true);
    const tmp: SerializedListItem = {
      _id: 'tmp-' + Date.now(), name: d.name.trim(), quantity: d.quantity.trim(), category: d.category.trim(), brand: d.brand.trim(), note: '', checked: false, aiScanned: true, createdAt: new Date().toISOString(),
    };
    setItems((p) => [tmp, ...p]);
    setDraft(null);
    start(async () => {
      await addListItem({ ...d, aiScanned: true });
      await resync();
      setSaving(false);
    });
  }

  const fLabel = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const selCls =
    'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]';
  const statusLabel = (v: StatusFilter) => (v === 'all' ? t('common.all') : v === 'todo' ? t('sl.fToBuy') : t('sl.fBought'));
  const anyF = statusFilter !== 'all' || !!catFilter || !!search;

  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={fLabel} style={mono}>{t('common.status')}</p>
        <div className="flex flex-col gap-1">
          {(['all', 'todo', 'bought'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={mono}
            >
              {statusLabel(v)}
            </button>
          ))}
        </div>
      </div>
      {cats.length > 0 && (
        <div>
          <p className={fLabel} style={mono}>{t('common.category')}</p>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className={selCls} style={mono}>
            <option value="">{t('common.all')}</option>
            {cats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      {anyF && (
        <button
          onClick={() => { setStatusFilter('all'); setCatFilter(''); setSearch(''); }}
          className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline"
          style={mono}
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
            {t('nav.shoppingList')}
            {todo.length > 0 && (
              <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={mono}>
                {t('sl.toBuy', { n: todo.length })}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setLayout(v)}
                title={v === 'grid' ? t('v.grid') : t('v.list')}
                className={cn('px-2 py-1.5 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
              >
                {v === 'grid' ? <LayoutGrid size={14} /> : <ListIcon size={14} />}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => cameraRef.current?.click()} disabled={scanning}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} {scanning ? t('sl.scanning') : t('sl.scanProduct')}
          </Button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </div>

      {/* E-shop body: filter sidebar + items */}
      <div className="flex gap-6 items-start">
        <aside className="hidden lg:block w-56 shrink-0 sticky top-4 self-start">{filterControls}</aside>

        <div className="flex-1 min-w-0">
          {/* Mobile filter toggle + drawer */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)]"
              style={mono}
            >
              <SlidersHorizontal size={14} /> Filters {anyF && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>}
          </div>

          {/* Quick add */}
          <div className="flex items-center gap-2 mb-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
              placeholder={t('sl.addPlaceholder')}
              className="flex-1 min-w-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--color-accent)]"
            />
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
              placeholder={t('sl.qty')}
              className="w-16 shrink-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-2 py-2.5 text-sm text-center outline-none focus:border-[color:var(--color-accent)]"
            />
            <button
              onClick={quickAdd}
              disabled={!name.trim()}
              className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-[color:var(--color-accent)] text-black disabled:opacity-40 hover:opacity-90"
              aria-label={t('sl.add')}
            >
              <Plus size={18} />
            </button>
          </div>
          {scanErr && <p className="mb-3 text-xs text-[color:var(--color-red)]">{scanErr}</p>}

          {/* Items */}
          {visible.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <ShoppingBasket size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">{items.length === 0 ? t('sl.empty') : t('sl.noMatch')}</p>
            </div>
          ) : (
            <div className={cn(layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'flex flex-col gap-2')}>
              {visible.map((it) =>
                layout === 'grid' ? (
                  <Card key={it._id} it={it} onToggle={() => toggle(it)} onRemove={() => remove(it)} />
                ) : (
                  <Row key={it._id} it={it} onToggle={() => toggle(it)} onRemove={() => remove(it)} />
                )
              )}
            </div>
          )}

          {done.length > 0 && statusFilter !== 'todo' && (
            <div className="mt-5 text-right">
              <button onClick={clearBought} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" style={mono}>
                {t('sl.clearBought')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verify a scanned product before adding */}
      {draft && (
        <Modal open onClose={() => setDraft(null)} title={t('sl.verifyTitle')} size="sm">
          <div className="space-y-3">
            <p className="text-xs text-[color:var(--color-text-dim)] flex items-center gap-1.5">
              <Sparkles size={13} className="text-[color:var(--color-accent)]" /> {t('sl.verifyHint')}
            </p>
            <Field label={t('sl.name')}>
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('sl.qty')}>
                <input value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} className={inputCls} />
              </Field>
              <Field label={t('sl.category')}>
                <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label={t('sl.brand')}>
              <input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} className={inputCls} />
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={addDraft} disabled={!draft.name.trim() || saving} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold disabled:opacity-50 hover:opacity-90">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {t('sl.addToList')}
              </button>
              <button onClick={() => setDraft(null)} className="text-sm px-3 py-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

const inputCls =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={mono}>{label}</span>
      {children}
    </label>
  );
}

function CheckBox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 grid place-items-center w-6 h-6 rounded-md border transition-colors',
        checked ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black' : 'border-[color:var(--color-border-light)] hover:border-[color:var(--color-accent)]'
      )}
      aria-label="toggle"
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  );
}

function Chips({ it }: { it: SerializedListItem }) {
  if (!it.quantity && !it.category && !it.aiScanned) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {it.quantity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]" style={mono}>{it.quantity}</span>}
      {it.category && <span className="text-[10px] text-[color:var(--color-text-faint)]">{it.category}</span>}
      {it.aiScanned && <span className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-0.5" style={mono}><Sparkles size={9} /> AI</span>}
    </div>
  );
}

/** Grid card — mirrors the product-card surface used across the app. */
function Card({ it, onToggle, onRemove }: { it: SerializedListItem; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className={cn('group relative flex items-start gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4 transition-colors hover:border-[color:var(--color-border-light)]', it.checked && 'opacity-60')}>
      <CheckBox checked={it.checked} onClick={onToggle} />
      <button onClick={onToggle} className="min-w-0 flex-1 text-left">
        <span className={cn('block text-sm font-medium leading-snug break-words', it.checked && 'line-through')}>
          {it.name}
        </span>
        {it.brand && <span className="block text-xs text-[color:var(--color-text-faint)] mt-0.5 truncate">{it.brand}</span>}
        <Chips it={it} />
      </button>
      <button onClick={onRemove} className="shrink-0 p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" aria-label="remove">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** List row — compact full-width line. */
function Row({ it, onToggle, onRemove }: { it: SerializedListItem; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className={cn('group flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3 py-2.5', it.checked && 'opacity-60')}>
      <CheckBox checked={it.checked} onClick={onToggle} />
      <button onClick={onToggle} className="min-w-0 flex-1 text-left">
        <span className={cn('block text-sm font-medium truncate', it.checked && 'line-through')}>
          {it.name}
          {it.brand && <span className="text-[color:var(--color-text-faint)] font-normal"> · {it.brand}</span>}
        </span>
        {(it.quantity || it.category) && (
          <span className="flex items-center gap-1.5 mt-0.5">
            {it.quantity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]" style={mono}>{it.quantity}</span>}
            {it.category && <span className="text-[10px] text-[color:var(--color-text-faint)]">{it.category}</span>}
          </span>
        )}
      </button>
      <button onClick={onRemove} className="shrink-0 p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" aria-label="remove">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
