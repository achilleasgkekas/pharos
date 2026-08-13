'use client';
import { cur, currencySymbol, CURRENCIES } from "@/lib/money";
import { isForeignCurrency, normalizeCurrency, convertToBase, deriveFxRate, formatMoney, toPrinted } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { useState, useTransition, useMemo } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Power, Sparkles, Loader2, Search, LayoutGrid, List as ListIcon, SlidersHorizontal, Radar, X, Split as SplitIcon, CheckCircle2 } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { CardSelect } from '@/components/CardSelect';
import { useOpenParam } from '@/components/useOpenParam';
import type { SerializedSubscription, SerializedCard } from '@/types';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import type { RecurringCandidate } from '@/lib/recurringDiscovery';
import { equalSplit, splitTotals, type SplitEntry } from '@/lib/split';
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  toggleSubscriptionActive,
  suggestSubscriptionInfo,
  trackDiscoveredSubscription,
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

/** P9: the base code always comes first, even when it is not one of the built-ins. */
function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}

function monthlyEquivalent(amount: number, cycle: string): number {
  const c = CYCLES.find((x) => x.value === cycle);
  return amount * (c?.perMonth ?? 1);
}

const money = (n: number) => `${cur()}${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Multi-currency context (P9): the deployment's base currency code + whether the per-entry
 *  currency/FX controls are switched on at all. One object, so prop lists grow by one entry. */
type FxCtx = { base: string; enabled: boolean };

// ─── Main component ────────────────────────────────────────────────────────

export function SubscriptionsClient({
  subscriptions,
  cards,
  categoryList = [],
  candidates = [],
  baseCurrency = 'EUR',
  multiCurrency = false,
}: {
  subscriptions: SerializedSubscription[];
  cards: SerializedCard[];
  categoryList?: string[];
  candidates?: RecurringCandidate[];
  baseCurrency?: string;
  multiCurrency?: boolean;
}) {
  if (categoryList.length) _subCats = categoryList;
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedSubscription | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const t = useT();
  // Discovered untracked recurring charges (P7). Ephemeral hide list — "dismiss" is
  // per-session only (no persisted ignore list yet); "track" removes it via the
  // vendorKey now existing as a real Subscription on next page load too.
  const [hiddenCandidates, setHiddenCandidates] = useState<Set<string>>(new Set());
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
  const visibleCandidates = candidates.filter((c) => !hiddenCandidates.has(c.vendorKey));
  const handleTrack = async (c: RecurringCandidate) => {
    setTrackingKey(c.vendorKey);
    try {
      await trackDiscoveredSubscription({ vendor: c.vendor, amount: c.lastAmount, cycle: c.cycle, firstDate: c.firstDate });
      setHiddenCandidates((prev) => new Set(prev).add(c.vendorKey));
    } finally {
      setTrackingKey(null);
    }
  };
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
      <Input icon={<Search size={14} />} placeholder={t('sub.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.status')}</p>
        <div className="flex flex-col gap-1">
          {([['all', 'All'], ['active', 'Active'], ['cancelled', 'Cancelled']] as const).map(([v]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                statusFilter === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {v === 'all' ? t('common.all') : v === 'active' ? t('v.fActive') : t('sub.fCancelled')}
            </button>
          ))}
        </div>
      </div>
      {categories.length > 1 && (
        <div>
          <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.category')}</p>
          <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} placeholder={t('sub.allCategories')} clearable size="sm" className="w-full" />
        </div>
      )}
      <div>
        <p className={fLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('common.sort')}</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selectClass} style={{ fontFamily: 'var(--font-mono)' }}>
          <option value="name">{t('sub.sortName')}</option>
          <option value="amount">{t('sub.sortCost')}</option>
          <option value="renewal">{t('sub.sortRenewal')}</option>
        </select>
      </div>
      {anyF && (
        <button
          onClick={() => { setSearch(''); setCategoryFilter(''); setStatusFilter('all'); setSortBy('name'); }}
          className="text-[0.65rem] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] underline"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
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
            {t('nav.subscriptions')}
            <span
              className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {t('v.activeCount', { n: active.length })}
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <div
              className="flex gap-4 text-xs text-[color:var(--color-text-dim)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span>
                {t('sub.monthly')}{' '}
                <span className="text-[color:var(--color-accent)] font-semibold">
                  {cur()}{monthlyTotal.toFixed(2)}
                </span>
              </span>
              <span>
                {t('sub.yearly')}{' '}
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
                  title={v === 'grid' ? t('v.grid') : t('v.list')}
                  className={cn('px-2 py-1.5 rounded-md transition-colors', layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]')}
                >
                  {icon}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} strokeWidth={2.5} /> {t('common.new')}
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
            {t('sub.upcoming')}
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

      {/* Discovered untracked recurring charges (P7) */}
      {visibleCandidates.length > 0 && (
        <div className="mb-6 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl p-4">
          <h3
            className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Radar size={12} /> {t('sub.discoveredTitle', { n: visibleCandidates.length })}
          </h3>
          <div className="flex flex-col gap-2">
            {visibleCandidates.map((c) => (
              <div
                key={c.vendorKey}
                className="flex items-center gap-3 flex-wrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2"
              >
                <span className="text-sm font-semibold flex-1 min-w-[100px] truncate">{c.vendor || c.vendorKey}</span>
                <span className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  ~{cur()}{c.avgAmount.toFixed(2)} · {t(`sub.${c.cycle}` as TKey)} · {t('sub.discoveredOccurrences', { n: c.occurrences })}
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleTrack(c)}
                    disabled={trackingKey === c.vendorKey}
                  >
                    {trackingKey === c.vendorKey ? <Loader2 size={13} className="animate-spin" /> : null}
                    {t('sub.discoveredTrack')}
                  </Button>
                  <button
                    onClick={() => setHiddenCandidates((prev) => new Set(prev).add(c.vendorKey))}
                    title={t('sub.discoveredDismiss')}
                    className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-3)] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
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
                  <SubCard sub={s} base={fx.base} onEdit={() => setEditing(s)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('sub.newSubscription')} size="xl">
        <SubForm cards={cards} fx={fx} onSuccess={() => setShowCreate(false)} />
      </Modal>

      {/* Edit */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.name} size="xl">
          <SubForm cards={cards} fx={fx} sub={editing} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

/** Cyan chip: this subscription is split with household members — shows what's still
 *  owed to you (or ✓ when settled). Same idiom as Expenses' SplitBadge (P35/P73). */
function SplitBadge({ split }: { split?: SplitEntry[] }) {
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

// ─── Sub Card ──────────────────────────────────────────────────────────────

function SubCard({ sub, base, onEdit }: { sub: SerializedSubscription; base: string; onEdit: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const meta = categoryMeta(sub.category);

  async function handleDelete() {
    const ok = await confirm({
      title: t('sub.deleteSubscription'),
      message: t('sub.confirmDelete', { name: sub.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) startTransition(() => deleteSubscription(sub._id));
  }
  const d = daysUntil(sub.nextRenewal);
  const cycleLabel = CYCLES.find((c) => c.value === sub.billingCycle) ? t(`cyc.${sub.billingCycle}` as TKey) : sub.billingCycle;

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
        {/* P9: what the invoice actually says, when it is not in the base currency. */}
        <FxBadge doc={sub} base={base} />
        <SplitBadge split={sub.split} />
      </div>

      {sub.active && d !== null && (
        <div
          className={cn(
            'text-xs mb-3',
            d <= 3 ? 'text-[color:var(--color-red)]' : d <= 7 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text-dim)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('sub.renews')} {d < 0 ? t('sub.overdue') : d === 0 ? t('sub.today') : t('sub.inD', { d })}
        </div>
      )}

      <div className="flex items-center gap-1 pt-2 border-t border-[color:var(--color-border)]">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors"
          aria-label={t('common.edit')}
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
            aria-label={t('common.open')}
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="ml-auto p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors opacity-0 group-hover:opacity-100"
          aria-label={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Sub Form ──────────────────────────────────────────────────────────────

function SubForm({ sub, cards, fx, onSuccess, onDeleted }: { sub?: SerializedSubscription; cards: SerializedCard[]; fx: FxCtx; onSuccess: () => void; onDeleted?: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  // P9: the form always holds PRINTED figures (what the invoice says), never the stored
  // base-currency ones. The server converts on save, so re-saving an unchanged foreign
  // subscription can never double-convert it.
  const wasForeign = isForeignCurrency(sub?.currency, fx.base);
  const storedRate = wasForeign ? sub?.fxRate || 0 : 0;
  const [form, setForm] = useState({
    name: sub?.name ?? '',
    provider: sub?.provider ?? '',
    category: sub?.category ?? 'other',
    amount: String((wasForeign ? sub?.origAmount || sub?.amount : sub?.amount) ?? ''),
    currency: wasForeign ? normalizeCurrency(sub?.currency) : normalizeCurrency(fx.base) || 'EUR',
    fxRate: wasForeign && sub?.fxRate ? String(sub.fxRate) : '',
    billingCycle: sub?.billingCycle ?? 'monthly',
    startDate: sub?.startDate ? sub.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.slice(0, 10) : '',
    firstChargeAmount: (sub?.firstChargeAmount ?? '') ? String(toPrinted(sub?.firstChargeAmount ?? 0, storedRate)) : '',
    paymentMethod: sub?.paymentMethod ?? '',
    url: sub?.url ?? '',
    notes: sub?.notes ?? '',
  });
  // Household cost-split (P73): kept outside `form` (which is flat strings mirrored 1:1
  // into FormData fields) and serialized as JSON into its own field on submit.
  const [split, setSplit] = useState<SplitEntry[]>(sub?.split ?? []);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const foreign = fx.enabled && isForeignCurrency(form.currency, fx.base);
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
        // A currency guessed by the AI is only honoured when multi-currency is switched on;
        // otherwise it would silently mark the entry foreign on a single-currency deployment.
        currency: (fx.enabled && d.currency) || p.currency,
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
    fd.set('split', JSON.stringify(split));
    startTransition(async () => {
      if (sub) await updateSubscription(sub._id, fd);
      else await createSubscription(fd);
      onSuccess();
    });
  }

  async function handleDelete() {
    if (!sub) return;
    const ok = await confirm({ title: t('sub.deleteSubscription'), message: t('sub.confirmDelete', { name: sub.name }), confirmLabel: t('common.delete'), danger: true });
    if (ok) startTransition(async () => { await deleteSubscription(sub._id); onDeleted?.(); });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label={t('sub.fName')}>
        <div className="flex gap-2">
          <Input
            value={form.name}
            onChange={set('name')}
            required
            placeholder={t('sub.fNamePlaceholder')}
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
            {t('v.fillAi')}
          </Button>
        </div>
        {aiMsg && (
          <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {aiMsg}
          </p>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('sub.fProvider')}>
          <Input value={form.provider} onChange={set('provider')} placeholder={t('sub.fProviderPlaceholder')} />
        </Field>
        <Field label={t('sub.fCategory')}>
          <select value={form.category} onChange={set('category')} className={selectClass}>
            {subCategoryOptions(form.category).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className={cn('grid grid-cols-2 gap-3', fx.enabled && 'sm:grid-cols-3')}>
        <Field label={t('sub.fAmount', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} required placeholder="9.99" />
        </Field>
        {fx.enabled && (
          <Field label={t('ex.fCurrency')}>
            <select value={form.currency} onChange={set('currency')} className={selectClass}>
              {currencyCodes(fx.base).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('sub.fBillingCycle')}>
          <select value={form.billingCycle} onChange={set('billingCycle')} className={selectClass}>
            {CYCLES.map((c) => (
              <option key={c.value} value={c.value}>{t(`cyc.${c.value}` as TKey)}</option>
            ))}
          </select>
        </Field>
      </div>
      {foreign && <SubFxFields form={form} setRate={(v) => setForm((p) => ({ ...p, fxRate: v }))} base={fx.base} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('sub.fStartDate')}>
          <Input type="date" value={form.startDate} onChange={set('startDate')} />
        </Field>
        <Field label={t('sub.fPayment')}>
          <CardSelect cards={cards} value={form.paymentMethod} onChange={(v) => setForm((p) => ({ ...p, paymentMethod: v }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('sub.fTrialEnds')}>
          <Input type="date" value={form.trialEndsAt} onChange={set('trialEndsAt')} />
        </Field>
        <Field label={t('sub.fFirstCharge', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" min="0" value={form.firstChargeAmount} onChange={set('firstChargeAmount')} placeholder={form.amount || '9.99'} />
        </Field>
      </div>
      {form.trialEndsAt && (
        <p className="text-[10px] text-[color:var(--color-purple)] -mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('sub.trialHint')}
        </p>
      )}
      <SplitEditor split={split} amount={Number(form.amount) || 0} onChange={setSplit} />
      <Field label="URL">
        <Input value={form.url} onChange={set('url')} placeholder="https://..." />
      </Field>
      <Field label={t('sub.fNotes')}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-none"
        />
      </Field>
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('v.saving') : sub ? t('common.save') : t('v.create')}
        </Button>
        {sub && onDeleted && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={handleDelete} disabled={pending}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Multi-currency (P9): shown only when the subscription's currency differs from the base one.
 *  Two ways in, because someone reading a card statement knows what was charged but not the
 *  rate: type the rate, or type the amount actually debited and let deriveFxRate() back it out.
 *  The preview is the number that will be stored (and summed in the monthly total). */
function SubFxFields({
  form,
  setRate,
  base,
}: {
  form: { amount: string; currency: string; fxRate: string };
  /** Only the rate is editable here, so the parent's full form type stays out of this component. */
  setRate: (v: string) => void;
  base: string;
}) {
  const t = useT();
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
          onChange={(e) => {
            setCharged('');
            setRate(e.target.value);
          }}
          placeholder="0.92"
        />
        {/* P9 phase 2: latest fixing — a subscription is a standing charge, it has no
            single document date the way an expense or a receipt does. */}
        <div className="mt-1">
          <FxRateButton currency={code} onRate={(r) => { setCharged(''); setRate(String(r)); }} />
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
            setRate(derived ? String(derived) : '');
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

/** Household cost-split (P73): who owes a share of this subscription each cycle. The
 *  split is static (one amount per person, "until you change it" — no per-cycle
 *  history) — same UI idiom and pure helpers (equalSplit/splitTotals) as Expenses'
 *  SplitEditor (P35), reused as-is; the component itself is duplicated rather than
 *  shared because the two forms don't share a form-state shape. */
function SplitEditor({ split, amount, onChange }: { split: SplitEntry[]; amount: number; onChange: (s: SplitEntry[]) => void }) {
  const t = useT();
  const [includeSelf, setIncludeSelf] = useState(false);
  const totals = splitTotals(split);
  const yourShare = Math.round((amount - split.reduce((s, e) => s + (e.share || 0), 0)) * 100) / 100;

  function setRow(i: number, p: Partial<SplitEntry>) {
    onChange(split.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() { onChange([...split, { name: '', share: 0, settled: false }]); }
  function removeRow(i: number) { onChange(split.filter((_, idx) => idx !== i)); }
  function splitEqually() {
    const names = split.map((r) => r.name);
    const fresh = equalSplit(amount, names, includeSelf);
    onChange(fresh.map((f) => ({ ...f, settled: split.find((r) => r.name.trim().toLowerCase() === f.name.toLowerCase())?.settled ?? false })));
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1.5"><SplitIcon size={13} className="text-[color:var(--color-cyan)]" /> {t('ex.splitTitle')}</span>
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
            <div key={i} className="flex items-center gap-1.5">
              <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={t('ex.splitName')} className="flex-1" />
              <Input type="number" step="0.01" min="0" value={String(r.share)} onChange={(e) => setRow(i, { share: Number(e.target.value) || 0 })} className="w-24" />
              <button type="button" onClick={() => setRow(i, { settled: !r.settled })} title={t('ex.splitMarkPaid')} className={cn('shrink-0 rounded-md p-1.5 border transition-colors', r.settled ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]')}><CheckCircle2 size={14} /></button>
              <button type="button" onClick={() => removeRow(i)} className="shrink-0 p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px]">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-[color:var(--color-accent)] hover:opacity-80"><Plus size={12} /> {t('ex.splitAddPerson')}</button>
        {split.some((r) => r.name.trim()) && (
          <>
            <button type="button" onClick={splitEqually} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:opacity-80"><SplitIcon size={12} /> {t('ex.splitEqually')}</button>
            <label className="flex items-center gap-1 text-[color:var(--color-text-faint)]">
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
