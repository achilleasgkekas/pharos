'use client';
import { useState, useRef, useTransition, useMemo } from 'react';
import { Camera, Plus, Check, X, Loader2, Trash2, Sparkles, ShoppingBasket } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/components/LocaleProvider';
import { shrinkImage } from '@/lib/clientImage';
import {
  addListItem,
  updateListItem,
  toggleListItem,
  deleteListItem,
  clearChecked,
  scanProductPhoto,
  getListItems,
  type SerializedListItem,
} from './actions';

type Draft = { name: string; quantity: string; category: string; brand: string };

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

  const todo = useMemo(() => items.filter((i) => !i.checked), [items]);
  const done = useMemo(() => items.filter((i) => i.checked), [items]);

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <ShoppingBasket size={26} className="text-[color:var(--color-accent)]" />
          {t('nav.shoppingList')}
          {todo.length > 0 && <span className="text-base font-normal text-[color:var(--color-text-faint)]">· {t('sl.toBuy', { n: todo.length })}</span>}
        </h1>
      </div>

      {/* Quick add + scan — sticky on mobile so it's always reachable */}
      <div className="sticky top-16 z-10 -mx-4 px-4 py-2 bg-[color:var(--color-bg)]/85 backdrop-blur-sm border-b border-[color:var(--color-border)] mb-3">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
            placeholder={t('sl.addPlaceholder')}
            className="flex-1 min-w-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3.5 py-2.5 text-base outline-none focus:border-[color:var(--color-accent)]"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
            placeholder={t('sl.qty')}
            inputMode="text"
            className="w-16 shrink-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-2 py-2.5 text-base text-center outline-none focus:border-[color:var(--color-accent)]"
          />
          <button
            onClick={quickAdd}
            disabled={!name.trim()}
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-[color:var(--color-accent)] text-black disabled:opacity-40 hover:opacity-90"
            aria-label={t('sl.add')}
          >
            <Plus size={20} />
          </button>
        </div>
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={scanning}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors disabled:opacity-60"
        >
          {scanning ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
          <span className="font-medium">{scanning ? t('sl.scanning') : t('sl.scanProduct')}</span>
          <Sparkles size={13} className="text-[color:var(--color-accent)]" />
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {scanErr && <p className="mt-1.5 text-xs text-[color:var(--color-red)]">{scanErr}</p>}
      </div>

      {/* To-buy */}
      {todo.length === 0 && done.length === 0 ? (
        <div className="text-center py-16 text-[color:var(--color-text-faint)]">
          <ShoppingBasket size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('sl.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {todo.map((it) => (
            <Row key={it._id} it={it} onToggle={() => toggle(it)} onRemove={() => remove(it)} />
          ))}
        </ul>
      )}

      {/* Bought */}
      {done.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('sl.bought', { n: done.length })}
            </span>
            <button onClick={clearBought} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]">
              {t('sl.clearBought')}
            </button>
          </div>
          <ul className="space-y-1.5 opacity-60">
            {done.map((it) => (
              <Row key={it._id} it={it} onToggle={() => toggle(it)} onRemove={() => remove(it)} />
            ))}
          </ul>
        </div>
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
      <span className="block text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ it, onToggle, onRemove }: { it: SerializedListItem; onToggle: () => void; onRemove: () => void }) {
  return (
    <li className="group flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-3 py-2.5">
      <button
        onClick={onToggle}
        className={cn(
          'shrink-0 grid place-items-center w-6 h-6 rounded-md border transition-colors',
          it.checked ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black' : 'border-[color:var(--color-border-light)] hover:border-[color:var(--color-accent)]'
        )}
        aria-label="toggle"
      >
        {it.checked && <Check size={15} strokeWidth={3} />}
      </button>
      <button onClick={onToggle} className="min-w-0 flex-1 text-left">
        <span className={cn('block text-sm font-medium truncate', it.checked && 'line-through')}>
          {it.name}
          {it.brand && <span className="text-[color:var(--color-text-faint)] font-normal"> · {it.brand}</span>}
        </span>
        {(it.quantity || it.category) && (
          <span className="flex items-center gap-1.5 mt-0.5">
            {it.quantity && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{it.quantity}</span>}
            {it.category && <span className="text-[10px] text-[color:var(--color-text-faint)]">{it.category}</span>}
          </span>
        )}
      </button>
      <button onClick={onRemove} className="shrink-0 p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" aria-label="remove">
        <Trash2 size={15} />
      </button>
    </li>
  );
}
