'use client';
import { useState, useRef, useTransition, useMemo } from 'react';
import { Camera, Plus, Check, Loader2, Trash2, Sparkles, ShoppingBasket, Search, CheckSquare, Repeat2 } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PAGE_MAIN, PageHeader, HeaderButton, ViewToggle, PrimaryAction, FilterLayout } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { useT } from '@/components/LocaleProvider';
import { shrinkImage } from '@/lib/clientImage';
import { compareNames } from '@/lib/i18n/format';
import { useLocale } from '@/components/LocaleProvider';
import {
  addListItem,
  toggleListItem,
  deleteListItem,
  clearChecked,
  scanProductPhoto,
  getListItems,
  updateListItem,
  type SerializedListItem,
} from './actions';

type Draft = { name: string; quantity: string; category: string; brand: string; restockIntervalDays: string };
type StatusFilter = 'all' | 'todo' | 'bought';
type SortKey = 'recent' | 'name' | 'category';
const mono = { fontFamily: 'var(--font-mono)' };
const display = { fontFamily: 'var(--font-display)' }; // titles match every other page's cards
const emptyDraft: Draft = { name: '', quantity: '', category: '', brand: '', restockIntervalDays: '' };

// Deterministic category accent — gives each category a stable colour (like the product cards' eyebrows).
const PALETTE = ['var(--color-accent)', 'var(--color-cyan)', 'var(--color-purple)', 'var(--color-gold)', 'var(--color-red)'];
function catColor(cat: string): string | null {
  const c = cat.trim();
  if (!c) return null;
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function ShoppingListClient({ initialItems }: { initialItems: SerializedListItem[] }) {
  const locale = useLocale();
  const t = useT();
  const [items, setItems] = useState<SerializedListItem[]>(initialItems);
  const [, start] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const idSeq = useRef(0); // collision-free temp ids for optimistic rows

  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Add modal (matches the "+ New" → modal pattern of the other pages)
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Draft>(emptyDraft);
  const [restockItem, setRestockItem] = useState<SerializedListItem | null>(null);
  const [restockDays, setRestockDays] = useState('');

  // E-shop layout state
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    return [...list].sort((a, b) => {
      const c = (a.checked ? 1 : 0) - (b.checked ? 1 : 0); // unchecked first
      if (c) return c;
      if (sortBy === 'name') return compareNames(a.name, b.name, locale);
      if (sortBy === 'category') return compareNames(a.category, b.category, locale) || compareNames(a.name, b.name, locale);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [items, statusFilter, catFilter, search, sortBy]);

  async function resync() {
    try {
      setItems(await getListItems());
    } catch {
      /* keep optimistic state */
    }
  }

  function addItem(d: Draft, aiScanned = false) {
    const n = d.name.trim();
    if (!n) return;
    const clean = { name: n, quantity: d.quantity.trim(), category: d.category.trim(), brand: d.brand.trim(), aiScanned, restockIntervalDays: d.restockIntervalDays ? Number(d.restockIntervalDays) : undefined };
    // Make sure the new row is actually visible (a stale status/category filter would
    // otherwise hide it → it looks like "I added it but it disappeared").
    setStatusFilter('all');
    setCatFilter('');
    setScanErr(null);
    const tmpId = 'tmp-' + Date.now() + '-' + idSeq.current++;
    const tmp: SerializedListItem = {
      _id: tmpId, ...clean, restockIntervalDays: clean.restockIntervalDays ?? null, note: '', checked: false, createdAt: new Date().toISOString(),
      lastRestockedAt: null,
    };
    setItems((p) => [tmp, ...p]);
    start(async () => {
      try {
        const r = await addListItem(clean);
        if (!r.ok) throw new Error(r.error || 'Could not save');
        await resync(); // replace the optimistic row with the saved one
      } catch (e) {
        // Roll the optimistic row back and surface the error instead of leaving a
        // phantom that vanishes on the next load.
        setItems((p) => p.filter((x) => x._id !== tmpId));
        setScanErr((e as Error).message.slice(0, 140));
      }
    });
  }

  function submitAdd() {
    if (!addForm.name.trim()) return;
    addItem(addForm);
    setShowAdd(false);
    setAddForm(emptyDraft);
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

  function saveRestock() {
    if (!restockItem) return;
    const value = restockDays ? Number(restockDays) : null;
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 3650)) return;
    const id = restockItem._id;
    setItems((p) => p.map((x) => x._id === id ? { ...x, restockIntervalDays: value } : x));
    setRestockItem(null);
    start(() => void updateListItem(id, { restockIntervalDays: value }));
  }

  // Bulk select
  function toggleSelect(id: string) {
    setSelectedIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }
  function bulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setItems((p) => p.filter((x) => !selectedIds.has(x._id)));
    exitSelect();
    start(async () => {
      for (const id of ids) await deleteListItem(id);
      await resync();
    });
  }
  function bulkBought() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setItems((p) => p.map((x) => (selectedIds.has(x._id) ? { ...x, checked: true } : x)));
    exitSelect();
    start(async () => {
      for (const id of ids) await toggleListItem(id, true);
      await resync();
    });
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
      if (r.ok) setDraft({ name: r.data.name, quantity: r.data.quantity, category: r.data.category, brand: r.data.brand, restockIntervalDays: '' });
      else setScanErr(r.error);
    } catch (e) {
      setScanErr((e as Error).message.slice(0, 120));
    } finally {
      setScanning(false);
    }
  }

  function addDraft() {
    if (!draft || !draft.name.trim()) return;
    const d = draft;
    setDraft(null);
    addItem(d, true); // optimistic + persist + rollback-on-failure, marked AI-scanned
  }

  const fLabel = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const selCls =
    'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]';
  const statusLabel = (v: StatusFilter) => (v === 'all' ? t('common.all') : v === 'todo' ? t('sl.fToBuy') : t('sl.fBought'));
  const anyF = statusFilter !== 'all' || !!catFilter || !!search || sortBy !== 'recent';

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
      <div>
        <p className={fLabel} style={mono}>{t('common.sort')}</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={selCls} style={mono}>
          <option value="recent">{t('sl.sortRecent')}</option>
          <option value="name">{t('sl.sortName')}</option>
          <option value="category">{t('common.category')}</option>
        </select>
      </div>
      {anyF && (
        <button
          onClick={() => { setStatusFilter('all'); setCatFilter(''); setSearch(''); setSortBy('recent'); }}
          className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline"
          style={mono}
        >
          reset filters
        </button>
      )}
    </div>
  );

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.shoppingList')} count={todo.length > 0 ? t('sl.toBuy', { n: todo.length }) : undefined}>
        {selectMode ? (
          <>
            <span className="text-xs text-[color:var(--color-text-dim)]">{t('sl.selected', { n: selectedIds.size })}</span>
            <HeaderButton tone="accent" icon={<Check size={14} />} onClick={bulkBought} disabled={!selectedIds.size}>
              {t('sl.markBought')}
            </HeaderButton>
            <HeaderButton className="!border-[color:var(--color-red)] !text-[color:var(--color-red)]" icon={<Trash2 size={14} />} onClick={bulkDelete} disabled={!selectedIds.size}>
              {t('common.delete')}
            </HeaderButton>
            <button onClick={exitSelect} className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-2">
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            {items.length > 0 && (
              <HeaderButton icon={<CheckSquare size={14} />} onClick={() => setSelectMode(true)}>{t('sl.select')}</HeaderButton>
            )}
            <HeaderButton icon={scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} onClick={() => cameraRef.current?.click()} disabled={scanning}>
              {scanning ? t('sl.scanning') : t('sl.scanProduct')}
            </HeaderButton>
            <ViewToggle value={layout} onChange={setLayout} />
            <PrimaryAction onClick={() => { setAddForm(emptyDraft); setShowAdd(true); }} />
          </>
        )}
      </PageHeader>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />

      <FilterLayout filters={filterControls} active={anyF}>
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
                  <Card key={it._id} it={it} color={catColor(it.category)} selectMode={selectMode} selected={selectedIds.has(it._id)} onSelect={() => toggleSelect(it._id)} onToggle={() => toggle(it)} onRemove={() => remove(it)} onRestock={() => { setRestockItem(it); setRestockDays(it.restockIntervalDays?.toString() ?? ''); }} />
                ) : (
                  <Row key={it._id} it={it} color={catColor(it.category)} selectMode={selectMode} selected={selectedIds.has(it._id)} onSelect={() => toggleSelect(it._id)} onToggle={() => toggle(it)} onRemove={() => remove(it)} onRestock={() => { setRestockItem(it); setRestockDays(it.restockIntervalDays?.toString() ?? ''); }} />
                )
              )}
            </div>
          )}

          {done.length > 0 && statusFilter !== 'todo' && !selectMode && (
            <div className="mt-5 text-right">
              <button onClick={clearBought} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" style={mono}>
                {t('sl.clearBought')}
              </button>
            </div>
          )}
      </FilterLayout>

      {/* Add an item (matches the other pages' "+ New" modal) */}
      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title={t('sl.addTitle')} size="sm">
          <div className="space-y-3">
            <Field label={t('sl.name')}>
              <input autoFocus value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('sl.qty')}>
                <input value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} className={inputCls} />
              </Field>
              <Field label={t('sl.category')}>
                <input value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} className={inputCls} />
              </Field>
            </div>
            <Field label={t('sl.brand')}>
              <input value={addForm.brand} onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} className={inputCls} />
            </Field>
            <Field label={t('sl.restockDays')}>
              <input type="number" min="1" max="3650" step="1" placeholder={t('sl.restockPlaceholder')} value={addForm.restockIntervalDays} onChange={(e) => setAddForm({ ...addForm, restockIntervalDays: e.target.value })} className={inputCls} />
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" onClick={submitAdd} disabled={!addForm.name.trim()}>
                <Plus size={15} /> {t('common.add')}
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </Modal>
      )}

      {restockItem && (
        <Modal open onClose={() => setRestockItem(null)} title={t('sl.restockTitle')} size="sm">
          <div className="space-y-3">
            <p className="text-xs text-[color:var(--color-text-dim)]">{t('sl.restockHint')}</p>
            <Field label={t('sl.restockDays')}>
              <input autoFocus type="number" min="1" max="3650" step="1" placeholder={t('sl.restockPlaceholder')} value={restockDays} onChange={(e) => setRestockDays(e.target.value)} className={inputCls} />
            </Field>
            <div className="flex gap-2"><Button variant="primary" onClick={saveRestock}>{t('common.save')}</Button><Button variant="ghost" onClick={() => setRestockItem(null)}>{t('common.cancel')}</Button></div>
          </div>
        </Modal>
      )}

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
              <Button variant="primary" onClick={addDraft} disabled={!draft.name.trim()}>
                <Check size={15} /> {t('sl.addToList')}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
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

function Box({ checked, accent, onClick }: { checked: boolean; accent: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 grid place-items-center w-6 h-6 rounded-md border transition-colors',
        checked ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black' : accent ? 'border-[color:var(--color-accent)]' : 'border-[color:var(--color-border-light)] hover:border-[color:var(--color-accent)]'
      )}
      aria-label="toggle"
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  );
}

/** Mono uppercase category eyebrow — the same treatment as the inventory cards' eyebrow. */
function Eyebrow({ category, color }: { category: string; color: string | null }) {
  if (!category) return null;
  return (
    <span className="block text-[11px] uppercase tracking-[0.08em] mb-0.5 truncate" style={{ ...mono, color: color || 'var(--color-text-faint)' }}>
      {category}
    </span>
  );
}

function Meta({ it }: { it: SerializedListItem }) {
  if (!it.quantity && !it.aiScanned && !it.restockIntervalDays) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {it.quantity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]" style={mono}>{it.quantity}</span>}
      {it.aiScanned && <span className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-0.5" style={mono}><Sparkles size={9} /> AI</span>}
      {it.restockIntervalDays && <span className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>↻ {it.restockIntervalDays}d</span>}
    </div>
  );
}

type CardProps = {
  it: SerializedListItem;
  color: string | null;
  selectMode: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onRestock?: () => void;
};

/** Grid card — colour-coded by category, mirroring the product-card surface used across the app. */
function Card({ it, color, selectMode, selected, onSelect, onToggle, onRemove, onRestock }: CardProps) {
  const struck = it.checked && !selectMode;
  return (
    <div
      onClick={selectMode ? onSelect : undefined}
      className={cn(
        'group relative flex items-start gap-3 bg-[color:var(--color-surface)] border rounded-2xl p-4 pl-5 min-h-[84px] overflow-hidden transition-colors',
        selectMode && 'cursor-pointer',
        selected ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]',
        it.checked && !selected && 'opacity-60'
      )}
    >
      {color && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />}
      <Box checked={selectMode ? selected : it.checked} accent={selectMode && selected} onClick={selectMode ? undefined : (e) => { e.stopPropagation(); onToggle(); }} />
      <div className={cn('min-w-0 flex-1', !selectMode && 'cursor-pointer')} onClick={selectMode ? undefined : onToggle}>
        <Eyebrow category={it.category} color={color} />
        <span className={cn('block text-sm font-semibold leading-snug break-words', struck && 'line-through')} style={display}>{it.name}</span>
        {it.brand && <span className="block text-xs text-[color:var(--color-text-faint)] mt-0.5 truncate">{it.brand}</span>}
        <Meta it={it} />
      </div>
      {!selectMode && (
        <div className="flex flex-col"><button onClick={(e) => { e.stopPropagation(); onRestock?.(); }} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100" aria-label="restock"><Repeat2 size={14} /></button><button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100" aria-label="remove"><Trash2 size={14} /></button></div>
      )}
    </div>
  );
}

/** List row — compact full-width line, same behaviour as the card. */
function Row({ it, color, selectMode, selected, onSelect, onToggle, onRemove, onRestock }: CardProps) {
  const struck = it.checked && !selectMode;
  return (
    <div
      onClick={selectMode ? onSelect : undefined}
      className={cn(
        'group relative flex items-center gap-3 bg-[color:var(--color-surface)] border rounded-xl pl-4 pr-3 py-2.5 overflow-hidden transition-colors',
        selectMode && 'cursor-pointer',
        selected ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]',
        it.checked && !selected && 'opacity-60'
      )}
    >
      {color && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />}
      <Box checked={selectMode ? selected : it.checked} accent={selectMode && selected} onClick={selectMode ? undefined : (e) => { e.stopPropagation(); onToggle(); }} />
      <div className={cn('min-w-0 flex-1', !selectMode && 'cursor-pointer')} onClick={selectMode ? undefined : onToggle}>
        <span className={cn('block text-sm font-semibold truncate', struck && 'line-through')} style={display}>
          {it.name}
          {it.brand && <span className="text-[color:var(--color-text-faint)] font-normal"> · {it.brand}</span>}
        </span>
        {(it.quantity || it.category) && (
          <span className="flex items-center gap-2 mt-0.5">
            {it.category && <span className="text-[10px] uppercase tracking-[0.08em]" style={{ ...mono, color: color || 'var(--color-text-faint)' }}>{it.category}</span>}
            {it.quantity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]" style={mono}>{it.quantity}</span>}
          </span>
        )}
      </div>
      {!selectMode && (
        <div className="flex"><button onClick={(e) => { e.stopPropagation(); onRestock?.(); }} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100" aria-label="restock"><Repeat2 size={15} /></button><button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 focus:opacity-100" aria-label="remove"><Trash2 size={15} /></button></div>
      )}
    </div>
  );
}
