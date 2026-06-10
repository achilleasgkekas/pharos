'use client';
import { cur } from "@/lib/money";
import { useState, useTransition, useMemo } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Power, Sparkles, Loader2, Search, LayoutGrid, List as ListIcon, SlidersHorizontal } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { CardSelect } from '@/components/CardSelect';
import { useOpenParam } from '@/components/useOpenParam';
import type { SerializedSubscription, SerializedCard } from '@/types';
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  toggleSubscriptionActive,
  suggestSubscriptionInfo,
} from './actions';

const CATEGORIES = [
  { value: 'streaming', label: 'Streaming', hex: '#a55eea' },
  { value: 'cloud', label: 'Cloud', hex: '#00d4ff' },
  { value: 'software', label: 'Software', hex: '#00ff88' },
  { value: 'gaming', label: 'Gaming', hex: '#ff4757' },
  { value: 'news', label: 'News', hex: '#ffd93d' },
  { value: 'fitness', label: 'Fitness', hex: '#00ff88' },
  { value: 'other', label: 'Other', hex: '#666666' },
];

// Built-in labels + an editable category list. SubscriptionsClient sets `_subCats`
// from Settings (getAppSettings.subscriptionCategories); the form dropdown reads it
// via subCategoryOptions so custom categories show up (module-var pattern, like cur()).
const SUB_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
let _subCats: string[] = CATEGORIES.map((c) => c.value);
function subCategoryOptions(current?: string): { value: string; label: string }[] {
  const list = _subCats.slice();
  if (current && !list.includes(current)) list.unshift(current);
  return list.map((v) => ({ value: v, label: SUB_LABELS[v] || v.charAt(0).toUpperCase() + v.slice(1) }));
}

const CYCLES = [
  { value: 'weekly', label: 'Weekly', perMonth: 52 / 12 },
  { value: 'monthly', label: 'Monthly', perMonth: 1 },
  { value: 'quarterly', label: 'Quarterly', perMonth: 1 / 3 },
  { value: 'yearly', label: 'Yearly', perMonth: 1 / 12 },
  { value: 'lifetime', label: 'Lifetime', perMonth: 0 },
];

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

function monthlyEquivalent(amount: number, cycle: string): number {
  const c = CYCLES.find((x) => x.value === cycle);
  return amount * (c?.perMonth ?? 1);
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Main component ────────────────────────────────────────────────────────

export function SubscriptionsClient({
  subscriptions,
  cards,
  categoryList = [],
}: {
  subscriptions: SerializedSubscription[];
  cards: SerializedCard[];
  categoryList?: string[];
}) {
  if (categoryList.length) _subCats = categoryList;
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedSubscription | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'renewal'>('name');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  const active = subscriptions.filter((s) => s.active);
  const categories = useMemo(() => [...new Set(subscriptions.map((s) => s.category).filter(Boolean))].sort(), [subscriptions]);

  // Deep-link from global search
  useOpenParam((id) => {
    const found = subscriptions.find((s) => s._id === id);
    if (found) setEditing(found);
  });

  const monthlyTotal = useMemo(
    () => active.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.billingCycle), 0),
    [active]
  );
  const yearlyTotal = monthlyTotal * 12;

  // Upcoming renewals within 30 days
  const upcoming = useMemo(
    () =>
      active
        .filter((s) => {
          const d = daysUntil(s.nextRenewal);
          return d !== null && d >= 0 && d <= 30;
        })
        .sort((a, b) => (daysUntil(a.nextRenewal)! - daysUntil(b.nextRenewal)!)),
    [active]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = subscriptions.filter((s) => {
      if (statusFilter === 'active' && !s.active) return false;
      if (statusFilter === 'cancelled' && s.active) return false;
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (q && !`${s.name} ${s.provider} ${s.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...out].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1; // active first
      switch (sortBy) {
        case 'amount':
          return monthlyEquivalent(b.amount, b.billingCycle) - monthlyEquivalent(a.amount, a.billingCycle);
        case 'renewal':
          return (daysUntil(a.nextRenewal) ?? 9999) - (daysUntil(b.nextRenewal) ?? 9999);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [subscriptions, search, categoryFilter, statusFilter, sortBy]);

  const anyF = !!(search || categoryFilter || statusFilter !== 'all' || sortBy !== 'name');
  const fLabel = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5';
  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder="Search name, provider..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Status</p>
        <div className="flex flex-col gap-1">
          {([['all', 'All'], ['active', 'Active'], ['cancelled', 'Cancelled']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {categories.length > 1 && (
        <div>
          <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Category</p>
          <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} placeholder="All categories" clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>Sort</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selectClass} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="name">Name A→Z</option>
          <option value="amount">Cost high→low</option>
          <option value="renewal">Next renewal</option>
        </select>
      </div>
      {anyF && (
        <button
          onClick={() => { setSearch(''); setCategoryFilter(''); setStatusFilter('all'); setSortBy('name'); }}
          className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          reset filters
        </button>
      )}
    </div>
  );

  return (
    <main className="max-w-[1500px] mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Subscriptions
            <span
              className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {active.length} active
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <div
              className="flex gap-4 text-xs text-[color:var(--color-text-dim)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span>
                monthly{' '}
                <span className="text-[color:var(--color-accent)] font-semibold">
                  {cur()}{monthlyTotal.toFixed(2)}
                </span>
              </span>
              <span>
                yearly{' '}
                <span className="text-[color:var(--color-gold)] font-semibold">
                  {cur()}{yearlyTotal.toFixed(0)}
                </span>
              </span>
            </div>
            <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
              {([['grid', <LayoutGrid key="g" size={14} />], ['list', <ListIcon key="l" size={14} />]] as const).map(([v, icon]) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  title={v === 'grid' ? 'Grid' : 'List'}
                  className={cn('px-2 py-1.5 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
                >
                  {icon}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} strokeWidth={2.5} /> New
            </Button>
          </div>
        </div>
      </div>

      {/* Upcoming renewals strip */}
      {upcoming.length > 0 && (
        <div className="mb-6 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl p-4">
          <h3
            className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Upcoming renewals (30 days)
          </h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {upcoming.map((s) => {
              const d = daysUntil(s.nextRenewal)!;
              return (
                <button
                  key={s._id}
                  onClick={() => setEditing(s)}
                  className="shrink-0 flex flex-col items-start gap-1 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 min-w-[120px] hover:border-[color:var(--color-border-light)] transition-colors text-left"
                >
                  <span className="text-sm font-semibold truncate max-w-[140px]">{s.name}</span>
                  <span
                    className={cn(
                      'text-[10px]',
                      d <= 3 ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-gold)]'
                    )}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`} · {cur()}{s.amount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* E-shop body: filter sidebar + subscriptions */}
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
              <p className="text-5xl mb-4">🔄</p>
              <p className="text-sm">{subscriptions.length === 0 ? 'No subscriptions yet. Hit + to add one.' : 'No subscriptions match these filters.'}</p>
            </div>
          ) : (
            <div className={cn(layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'flex flex-col gap-2')}>
              {visible.map((s) => (
                <div key={s._id} className={cn(!s.active && 'opacity-60')}>
                  <SubCard sub={s} onEdit={() => setEditing(s)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Subscription" size="xl">
        <SubForm cards={cards} onSuccess={() => setShowCreate(false)} />
      </Modal>

      {/* Edit */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.name} size="xl">
          <SubForm cards={cards} sub={editing} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

// ─── Sub Card ──────────────────────────────────────────────────────────────

function SubCard({ sub, onEdit }: { sub: SerializedSubscription; onEdit: () => void }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const meta = categoryMeta(sub.category);

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete subscription',
      message: `Delete "${sub.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) startTransition(() => deleteSubscription(sub._id));
  }
  const d = daysUntil(sub.nextRenewal);
  const cycleLabel = CYCLES.find((c) => c.value === sub.billingCycle)?.label ?? sub.billingCycle;

  return (
    <div className="group bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4 hover:border-[color:var(--color-border-light)] transition-all">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {sub.name}
          </h3>
          {sub.provider && (
            <p className="text-xs text-[color:var(--color-text-faint)] truncate">{sub.provider}</p>
          )}
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0"
          style={{
            fontFamily: 'var(--font-mono)',
            background: `${meta.hex}20`,
            color: meta.hex,
            border: `1px solid ${meta.hex}40`,
          }}
        >
          {meta.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-2xl font-bold text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-display)' }}>
          {cur()}{sub.amount}
        </span>
        <span className="text-xs text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          / {cycleLabel.toLowerCase()}
        </span>
      </div>

      {sub.active && d !== null && (
        <div
          className={cn(
            'text-xs mb-3',
            d <= 3 ? 'text-[color:var(--color-red)]' : d <= 7 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text-dim)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          renews {d < 0 ? 'overdue' : d === 0 ? 'today' : `in ${d}d`}
        </div>
      )}

      <div className="flex items-center gap-1 pt-2 border-t border-[color:var(--color-border)]">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors"
          aria-label="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => startTransition(() => toggleSubscriptionActive(sub._id, !sub.active))}
          disabled={pending}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            sub.active
              ? 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-gold)]'
              : 'text-[color:var(--color-accent)]'
          )}
          aria-label={sub.active ? 'Cancel' : 'Activate'}
        >
          <Power size={13} />
        </button>
        {sub.url && (
          <a
            href={sub.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] hover:bg-[color:var(--color-surface-2)] transition-colors"
            aria-label="Open"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="ml-auto p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Sub Form ──────────────────────────────────────────────────────────────

function SubForm({ sub, cards, onSuccess, onDeleted }: { sub?: SerializedSubscription; cards: SerializedCard[]; onSuccess: () => void; onDeleted?: () => void }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: sub?.name ?? '',
    provider: sub?.provider ?? '',
    category: sub?.category ?? 'other',
    amount: (sub?.amount ?? '').toString(),
    currency: sub?.currency ?? 'EUR',
    billingCycle: sub?.billingCycle ?? 'monthly',
    startDate: sub?.startDate ? sub.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    paymentMethod: sub?.paymentMethod ?? '',
    url: sub?.url ?? '',
    notes: sub?.notes ?? '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const [aiPending, startAi] = useTransition();
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  function handleAiFill() {
    if (!form.name.trim()) return;
    setAiMsg(null);
    startAi(async () => {
      const r = await suggestSubscriptionInfo(form.name);
      if (!r.ok) {
        setAiMsg(r.error);
        return;
      }
      const d = r.data;
      setForm((p) => ({
        ...p,
        provider: d.provider || p.provider,
        category: d.category || p.category,
        amount: d.amount ? String(d.amount) : p.amount,
        currency: d.currency || p.currency,
        billingCycle: d.billingCycle || p.billingCycle,
        url: d.url || p.url,
        notes: d.notes || p.notes,
      }));
      setAiMsg('✓ Filled by AI — check the details');
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      if (sub) await updateSubscription(sub._id, fd);
      else await createSubscription(fd);
      onSuccess();
    });
  }

  async function handleDelete() {
    if (!sub) return;
    const ok = await confirm({ title: 'Delete subscription', message: `Delete "${sub.name}"?`, confirmLabel: 'Delete', danger: true });
    if (ok) startTransition(async () => { await deleteSubscription(sub._id); onDeleted?.(); });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Name *">
        <div className="flex gap-2">
          <Input
            value={form.name}
            onChange={set('name')}
            required
            placeholder="e.g. YouTube Premium, Netflix, iCloud+"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAiFill();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAiFill}
            disabled={aiPending || !form.name.trim()}
            className="shrink-0"
          >
            {aiPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI fill
          </Button>
        </div>
        {aiMsg && (
          <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {aiMsg}
          </p>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider">
          <Input value={form.provider} onChange={set('provider')} placeholder="Apple, Google..." />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={set('category')} className={selectClass}>
            {subCategoryOptions(form.category).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${cur()}) *`}>
          <Input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} required placeholder="9.99" />
        </Field>
        <Field label="Billing cycle">
          <select value={form.billingCycle} onChange={set('billingCycle')} className={selectClass}>
            {CYCLES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input type="date" value={form.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="Payment">
          <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => setForm((p) => ({ ...p, paymentMethod: v }))} />
        </Field>
      </div>
      <Field label="URL">
        <Input value={form.url} onChange={set('url')} placeholder="https://..." />
      </Field>
      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-none"
        />
      </Field>
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving...' : sub ? 'Save' : 'Create'}
        </Button>
        {sub && onDeleted && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={handleDelete} disabled={pending}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
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
