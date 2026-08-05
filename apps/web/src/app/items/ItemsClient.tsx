'use client';
import { cur } from "@/lib/money";
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Trash2,
  X,
  Loader2,
  Sparkles,
  Link2,
  ExternalLink,
  Wand2,
  ListPlus,
  Check,
  FileText,
  TrendingDown,
  TrendingUp,
  Target,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
  Merge,
  ImagePlus,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PricePanel } from '@/components/PricePanel';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { Layers, Receipt as ReceiptIcon, CreditCard } from 'lucide-react';
import { CURRENCIES, currencySymbol } from '@/lib/money';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import { convertToBase, deriveFxRate, formatMoney, isForeignCurrency, normalizeCurrency, toPrinted } from '@/lib/fx';
import type { SerializedItem } from '@/types';
import { VIEW_CONFIG, type ItemView } from '@/lib/itemStatus';
import { type InstallmentPlan } from '@/lib/installments';
import { useT } from '@/components/LocaleProvider';
import type { TKey, TFunc } from '@/lib/i18n';

// value → i18n key maps (so the const arrays stay untouched)
const IT_STATUS_KEY: Record<string, TKey> = { researching: 'it.stResearching', decided: 'it.stDecided', ordered: 'it.stOrdered', received: 'it.stReceived', installed: 'it.stInstalled', deferred: 'it.stDeferred', sold: 'it.stSold', broken: 'it.stBroken' };
const IT_SORT_KEY: Record<string, TKey> = { default: 'it.sortDefault', recent: 'it.sortRecent', 'price-desc': 'it.sortPriceDesc', 'price-asc': 'it.sortPriceAsc', name: 'it.sortName' };
const IT_FLAG_KEY: Record<string, TKey> = { deal: 'it.fDeals', photo: 'it.fPhoto', ai: 'it.fAi', links: 'it.fLinks', warranty: 'it.fWarranty' };
import { InstallmentPlanCard } from '@/components/InstallmentPlanCard';
import { useOpenParam } from '@/components/useOpenParam';
import { ItemPhotoGallery } from './ItemPhotoGallery';
import { ItemDocuments } from './ItemDocuments';
import { createItem, updateItem, deleteItem, previewItemFromUrl, confirmImportItem, aiFillItem, aiFillInfo, fetchItemPhotos, mergeItems, bulkUpdateItems, convertItemToTask, type DupItem } from './actions';
import { useJobs } from '@/components/JobsProvider';
import { enqueueAiFillItems, getBulkAiGuard } from '@/app/jobActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { linkPlanToItem, unlinkPlanByKey } from '../statements/actions';
import { ItemDuplicatesModal, MergeItemsPicker } from './ItemDuplicatesModal';
import { PriceSearchPanel } from '@/components/PriceSearchPanel';

const CATEGORIES = [
  { value: 'network', label: 'Network' },
  { value: 'storage', label: 'Storage' },
  { value: 'compute', label: 'Compute' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'peripheral', label: 'Peripheral' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'other', label: 'Other' },
];

// Built-in labels + an editable category list. ItemsClient sets `_itemCats` from
// Settings (getAppSettings.itemCategories) so custom categories show in the form
// dropdown; ItemForm reads it via itemCategoryOptions (module-var pattern, like cur()).
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
let _itemCats: string[] = CATEGORIES.map((c) => c.value);
function itemCategoryOptions(current?: string): { value: string; label: string }[] {
  const list = _itemCats.slice();
  if (current && !list.includes(current)) list.unshift(current);
  return list.map((v) => ({ value: v, label: CATEGORY_LABELS[v] || v.charAt(0).toUpperCase() + v.slice(1) }));
}

const STATUSES = [
  { value: 'researching', label: 'Researching' },
  { value: 'decided', label: 'Decided' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'received', label: 'Received' },
  { value: 'installed', label: 'Installed' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'sold', label: 'Sold' },
  { value: 'broken', label: 'Broken' },
];

type SortKey = 'default' | 'recent' | 'price-desc' | 'price-asc' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Sort: default' },
  { value: 'recent', label: 'Newest first' },
  { value: 'price-desc', label: 'Price high→low' },
  { value: 'price-asc', label: 'Price low→high' },
  { value: 'name', label: 'Name A→Z' },
];

// Quick boolean filters (chips). Each is a predicate over an item. `shoppingOnly`
// chips are hidden in the inventory view.
const FLAG_DEFS: { key: string; label: string; test: (i: SerializedItem) => boolean; shoppingOnly?: boolean }[] = [
  { key: 'deal', label: '🎯 deals only', test: (i) => isDeal(i), shoppingOnly: true },
  { key: 'photo', label: 'has photo', test: (i) => i.photos.length > 0 },
  { key: 'ai', label: 'AI filled', test: (i) => !!i.aiFilledAt },
  { key: 'links', label: 'has links', test: (i) => i.links.length > 0 },
  {
    key: 'warranty',
    label: 'under warranty',
    test: (i) => {
      const t = i.warrantyUntil ? new Date(i.warrantyUntil).getTime() : 0;
      return !!t && t > Date.now();
    },
  },
];

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

const textareaClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors resize-none';

/** Warranty status → label + color for the list badge. */
function warrantyState(until: string | null, t: TFunc): { label: string; color: string } | null {
  if (!until) return null;
  const days = Math.ceil((new Date(until).getTime() - Date.now()) / 86400000);
  if (isNaN(days)) return null;
  if (days < 0) return { label: t('it.wExpired'), color: 'var(--color-red)' };
  const months = Math.max(1, Math.round(days / 30));
  if (days <= 90) return { label: t('it.wLeft', { n: months }), color: 'var(--color-gold)' };
  return { label: t('it.wUnder', { n: months }), color: 'var(--color-accent)' };
}

// ─── Main page component ───────────────────────────────────────────────────

export type ReceiptRef = {
  _id: string;
  store: string;
  date: string;
  total: number;
  filePath: string;
  fileType: string;
};

/** Multi-currency context (P9): the deployment's base currency code + whether the per-item
 *  currency/FX controls are switched on at all. One object, so prop lists grow by one entry. */
type FxCtx = { base: string; enabled: boolean };

/** P9: the base code always comes first, even when it is not one of the built-ins. */
function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}

export function ItemsClient({
  items,
  view = 'inventory',
  plans = [],
  unlinkedPlans = [],
  receipts = [],
  defaultView = 'grid',
  categoryList = [],
  baseCurrency = 'EUR',
  multiCurrency = false,
}: {
  items: SerializedItem[];
  view?: ItemView;
  plans?: InstallmentPlan[];
  unlinkedPlans?: InstallmentPlan[];
  receipts?: ReceiptRef[];
  defaultView?: 'grid' | 'list';
  categoryList?: string[];
  baseCurrency?: string;
  multiCurrency?: boolean;
}) {
  if (categoryList.length) _itemCats = categoryList;
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const t = useT();
  const cfg = VIEW_CONFIG[view];
  const viewName = view === 'shopping' ? t('nav.shopping') : t('nav.inventory');
  const [filter, setFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const toggleFlag = (f: string) =>
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>(defaultView);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };
  const [selectedItem, setSelectedItem] = useState<SerializedItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  const [showMerge, setShowMerge] = useState(false); // manual merge of the selected items
  const [mergeKeep, setMergeKeep] = useState('');
  const [merging, startMerge] = useTransition();
  // P78: bulk field-edit (category/status/tags) over the selected items
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [applyingBulk, startBulkEdit] = useTransition();
  const { refresh } = useJobs();
  const confirm = useConfirm();

  const stores = useMemo(
    () => [...new Set(items.map((i) => i.purchasedFrom).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  );
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  );

  // Installment plans grouped by each product they're linked to (a plan can list several)
  const plansByItem = useMemo(() => {
    const m = new Map<string, InstallmentPlan[]>();
    for (const p of plans) {
      for (const id of p.itemIds) {
        const list = m.get(id) ?? [];
        list.push(p);
        m.set(id, list);
      }
    }
    return m;
  }, [plans]);

  // Receipts by id, so a product can open its actual attachment
  const receiptMap = useMemo(() => new Map(receipts.map((r) => [r._id, r])), [receipts]);

  // Deep-link from global search: open the matching product
  useOpenParam((id) => {
    const found = items.find((i) => i._id === id);
    if (found) setSelectedItem(found);
  });

  const filtered = useMemo(() => {
    const activeFlags = FLAG_DEFS.filter((f) => flags.has(f.key));
    const out = items.filter((item) => {
      if (filter && item.status !== filter) return false;
      if (storeFilter && item.purchasedFrom !== storeFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (activeFlags.some((f) => !f.test(item))) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !item.specs.toLowerCase().includes(q) &&
          !item.notes.toLowerCase().includes(q) &&
          !item.tags.some((t) => t.toLowerCase().includes(q))
        )
          return false;
      }
      return true;
    });
    if (sortBy === 'default') return out;
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'price-desc':
          return (b.currentPrice || 0) - (a.currentPrice || 0);
        case 'price-asc':
          return (a.currentPrice || 0) - (b.currentPrice || 0);
        case 'name':
          return a.title.localeCompare(b.title);
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });
    return sorted;
  }, [items, filter, storeFilter, categoryFilter, flags, search, sortBy]);

  // Bulk "AI fill from web" over the current filtered view. Chunks of 5 (the server
  // action also caps at 5) run sequentially so we never hammer Ollama/SearXNG; one
  // bad item can't abort the run.
  // Enqueue a SERVER-SIDE job for the SELECTED items (the worker AI-enriches each
  // from the web, independent of this browser, with progress in the global widget).
  async function handleBulkAi() {
    const sel = items.filter((i) => selectedIds.has(i._id));
    if (sel.length === 0) return;
    // Cost guard: confirm before starting a (possibly paid) bulk AI job.
    const g = await getBulkAiGuard();
    if (g.confirm) {
      const ok = await confirm({
        title: `Run AI on ${sel.length} item${sel.length === 1 ? '' : 's'}?`,
        message:
          g.provider === 'anthropic'
            ? `Cloud · ${g.model}. Rough cost ~$${(sel.length * 0.02).toFixed(2)} (≈$0.02/item). Starts a background job.`
            : `Local · ${g.model}. Free, but slow. Starts a background job.`,
        confirmLabel: 'Run AI',
      });
      if (!ok) return;
    }
    void enqueueAiFillItems(
      sel.map((i) => i._id),
      sel.map((i) => i.title),
      // The inventory view lives at /items (not /inventory) — the widget's open
      // arrow 404'd when it used `/${view}` verbatim.
      view === 'shopping' ? '/shopping' : '/items',
      `AI fill · ${cfg.title}`
    ).then(() => {
      exitSelectMode();
      refresh();
    });
  }
  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map((i) => i._id)));

  // Manual merge of the selected items — covers different-title dupes that the
  // auto "find duplicates" (grouped by title) would miss.
  const mergeCandidates: DupItem[] = useMemo(
    () =>
      items
        .filter((i) => selectedIds.has(i._id))
        .map((i) => ({
          _id: i._id,
          title: i.title,
          num: i.num ?? '',
          status: i.status,
          currentPrice: i.currentPrice || 0,
          links: i.links?.length ?? 0,
          photos: i.photos?.length ?? 0,
          receipts: i.receiptIds?.length ?? 0,
          thumbPath: i.photos?.[0] ?? '',
        })),
    [items, selectedIds]
  );
  function openMerge() {
    if (selectedIds.size < 2) return;
    setMergeKeep(mergeCandidates[0]?._id ?? '');
    setShowMerge(true);
  }
  function handleManualMerge() {
    const keep = mergeKeep || mergeCandidates[0]?._id;
    if (!keep) return;
    const drops = [...selectedIds].filter((id) => id !== keep);
    if (drops.length === 0) return;
    startMerge(async () => {
      const r = await mergeItems(keep, drops);
      if (r.ok) {
        setShowMerge(false);
        exitSelectMode();
        refresh();
      }
    });
  }

  // P78: bulk field-edit (category/status/add-tags) over the selected items.
  function openBulkEdit() {
    if (selectedIds.size === 0) return;
    setBulkCategory('');
    setBulkStatus('');
    setBulkTags('');
    setShowBulkEdit(true);
  }
  const bulkEditReady = !!bulkCategory || !!bulkStatus || bulkTags.trim().length > 0;
  function handleBulkEditApply() {
    if (!bulkEditReady) return;
    const addTags = bulkTags.split(',').map((t) => t.trim()).filter(Boolean);
    startBulkEdit(async () => {
      const r = await bulkUpdateItems([...selectedIds], {
        category: bulkCategory || undefined,
        status: bulkStatus || undefined,
        addTags,
      });
      if (r.ok) {
        setShowBulkEdit(false);
        exitSelectMode();
      }
    });
  }

  // Shopping est. cost (active items only) — inventory shows no totals.
  const shoppingBudget = items
    .filter((i) => i.status !== 'deferred')
    .reduce((s, i) => s + (i.currentPrice || 0), 0);
  const dealsCount = view === 'shopping' ? items.filter(isDeal).length : 0;

  const anyFilterActive = !!(filter || storeFilter || categoryFilter || flags.size > 0 || search || sortBy !== 'default');
  const resetFilters = () => {
    setFilter('');
    setStoreFilter('');
    setCategoryFilter('');
    setFlags(new Set());
    setSearch('');
    setSortBy('default');
  };

  // Shared filter controls — rendered in the left sidebar (desktop) and a drawer (mobile)
  const filterControls = (
    <div className="space-y-4">
      <Input icon={<Search size={14} />} placeholder={t('it.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <FilterGroup label={t('common.status')}>
        <div className="flex flex-col gap-1">
          {cfg.statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'text-left px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-[0.06em] transition-all',
                filter === f.value
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {f.value === '' ? t('common.all') : IT_STATUS_KEY[f.value] ? t(IT_STATUS_KEY[f.value]) : f.label}
            </button>
          ))}
        </div>
      </FilterGroup>
      {stores.length > 0 && (
        <FilterGroup label={t('v.fStore')}>
          <SearchableSelect value={storeFilter} onChange={setStoreFilter} options={stores} placeholder={t('it.allStores')} clearable size="sm" className="w-full" />
        </FilterGroup>
      )}
      {categories.length > 1 && (
        <FilterGroup label={t('common.category')}>
          <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} placeholder={t('sub.allCategories')} clearable size="sm" className="w-full" />
        </FilterGroup>
      )}
      <FilterGroup label={t('common.sort')}>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-dim)] focus:outline-none focus:border-[color:var(--color-accent)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {IT_SORT_KEY[s.value] ? t(IT_SORT_KEY[s.value]) : s.label}
            </option>
          ))}
        </select>
      </FilterGroup>
      <FilterGroup label={t('it.showOnly')}>
        <div className="flex flex-wrap gap-1.5">
          {FLAG_DEFS.filter((f) => !f.shoppingOnly || view === 'shopping').map((f) => {
            const on = flags.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggleFlag(f.key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[0.6rem] font-semibold uppercase tracking-[0.06em] border transition-all',
                  on
                    ? 'bg-[color:var(--color-cyan)] text-black border-[color:var(--color-cyan)]'
                    : 'bg-[color:var(--color-surface)] text-[color:var(--color-text-faint)] border-[color:var(--color-border)] hover:text-[color:var(--color-text-dim)]'
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {IT_FLAG_KEY[f.key] ? t(IT_FLAG_KEY[f.key]) : f.label}
              </button>
            );
          })}
        </div>
      </FilterGroup>
      {anyFilterActive && (
        <button
          onClick={resetFilters}
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
      {/* Page header */}
      <div className="mb-6 pb-4 border-b border-[color:var(--color-border)]">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1
              className="text-2xl md:text-3xl font-bold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {viewName}
            </h1>
            <span
              className="text-xs text-[color:var(--color-text-faint)] tracking-[0.1em]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {items.length} {items.length === 1 ? t('it.item') : t('it.items')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && view === 'shopping' && (
              <div className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('it.cost')}{' '}
                <span className="text-[color:var(--color-cyan)] font-semibold">{cur()}{shoppingBudget.toFixed(0)}</span>
              </div>
            )}
            {dealsCount > 0 && (
              <button
                onClick={() => setFlags(new Set(['deal']))}
                title={t('it.dealsTitle')}
                className="flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:opacity-80"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Target size={13} /> {dealsCount} {dealsCount === 1 ? t('it.deal') : t('it.deals')}
              </button>
            )}
            {filtered.length > 0 && (
              <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
                {selectMode ? (
                  <>
                    {selectedIds.size > 0 && (
                      <button
                        onClick={handleBulkAi}
                        title={t('it.aiFillTitle')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:opacity-80 transition-colors"
                      >
                        <Sparkles size={14} /> {t('it.aiFillAll', { n: selectedIds.size })}
                      </button>
                    )}
                    {selectedIds.size >= 2 && (
                      <button
                        onClick={openMerge}
                        title={t('it.mergeTitle')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-purple)] text-[color:var(--color-purple)] hover:opacity-80 transition-colors"
                      >
                        <Merge size={14} /> {t('it.mergeN', { n: selectedIds.size })}
                      </button>
                    )}
                    {selectedIds.size > 0 && (
                      <button
                        onClick={openBulkEdit}
                        title={t('it.bulkEditTitle')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] hover:opacity-80 transition-colors"
                      >
                        <Pencil size={14} /> {t('it.editN', { n: selectedIds.size })}
                      </button>
                    )}
                    <button
                      onClick={selectedIds.size === filtered.length ? clearSelection : selectAllFiltered}
                      className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors"
                    >
                      {selectedIds.size === filtered.length ? t('common.deselectAll') : t('trash.selectAllN', { n: filtered.length })}
                    </button>
                    <button onClick={exitSelectMode} className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-2">
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectMode(true)}
                    title={t('it.selectTitle')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors"
                  >
                    <Check size={14} /> {t('it.select')}
                  </button>
                )}
              </div>
            )}
            {items.length > 1 && !selectMode && (
              <button
                onClick={() => setShowDupes(true)}
                title={t('it.findDupTitle')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-purple)] hover:border-[color:var(--color-purple)] transition-colors"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Merge size={14} /> {t('it.duplicates')}
              </button>
            )}
            {/* Grid / list toggle */}
            <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
              {([
                ['grid', <LayoutGrid key="g" size={15} />],
                ['list', <ListIcon key="l" size={15} />],
              ] as const).map(([v, icon]) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  title={v === 'grid' ? t('v.grid') : t('v.list')}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md transition-colors',
                    layout === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                  )}
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

      {/* E-shop body: left filter sidebar + product area */}
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
              <SlidersHorizontal size={14} /> {t('ex.filters')} {anyFilterActive && <span className="text-[color:var(--color-accent)]">•</span>}
            </button>
            {showFilters && (
              <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">{filterControls}</div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-24 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">{cfg.emptyEmoji}</p>
              <p className="text-sm">{items.length === 0 ? cfg.emptyText : t('it.noResults')}</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <ItemCard
                  key={item._id}
                  item={item}
                  view={view}
                  base={fx.base}
                  plan={plansByItem.get(item._id)?.[0]}
                  onClick={() => setSelectedItem(item)}
                  selected={selectedIds.has(item._id)}
                  onToggleSelect={() => toggleSelect(item._id)}
                  selectMode={selectMode}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((item) => (
                <ItemRow
                  key={item._id}
                  item={item}
                  view={view}
                  base={fx.base}
                  plan={plansByItem.get(item._id)?.[0]}
                  onClick={() => setSelectedItem(item)}
                  selected={selectedIds.has(item._id)}
                  onToggleSelect={() => toggleSelect(item._id)}
                  selectMode={selectMode}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          view={view}
          fx={fx}
          plans={plansByItem.get(selectedItem._id) ?? []}
          unlinkedPlans={unlinkedPlans}
          receipts={selectedItem.receiptIds.map((id) => receiptMap.get(id)).filter((r): r is ReceiptRef => !!r)}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={(it) => setSelectedItem(it)}
        />
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('it.newItem', { view: viewName })} size="lg">
        <UrlImport view={view} onImported={() => setShowCreate(false)} />
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[color:var(--color-border)]" />
          <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
            or add manually
          </span>
          <div className="flex-1 h-px bg-[color:var(--color-border)]" />
        </div>
        <ItemForm defaultStatus={cfg.defaultStatus} fx={fx} onSuccess={() => setShowCreate(false)} />
      </Modal>

      {/* Find duplicate products (auto-grouped by title) */}
      <ItemDuplicatesModal open={showDupes} onClose={() => setShowDupes(false)} />

      {/* Manual merge of the selected products */}
      <Modal open={showMerge} onClose={() => setShowMerge(false)} title={`Merge ${mergeCandidates.length} products`} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('it.dupPick')}
          </p>
          <MergeItemsPicker items={mergeCandidates} keepId={mergeKeep} onKeep={setMergeKeep} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowMerge(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleManualMerge} disabled={merging || mergeCandidates.length < 2}>
              {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />} Merge {mergeCandidates.length} → 1
            </Button>
          </div>
        </div>
      </Modal>

      {/* P78: bulk field-edit (category/status/add-tags) over the selected items */}
      <Modal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} title={t('it.editN', { n: selectedIds.size })} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('it.bulkEditHint')}
          </p>
          <Field label={t('common.category')}>
            <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className={selectClass}>
              <option value="">{t('common.noChange')}</option>
              {itemCategoryOptions().map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.status')}>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={selectClass}>
              <option value="">{t('common.noChange')}</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {IT_STATUS_KEY[s.value] ? t(IT_STATUS_KEY[s.value]) : s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('it.bulkAddTags')}>
            <Input value={bulkTags} onChange={(e) => setBulkTags(e.target.value)} placeholder={t('it.fTagsPlaceholder')} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowBulkEdit(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleBulkEditApply} disabled={applyingBulk || !bulkEditReady}>
              {applyingBulk ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} {t('common.apply')}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

// ─── Import from URL (AI autofill) ─────────────────────────────────────────

type PreviewData = {
  title: string;
  price: number;
  store: string;
  specs: string;
  category: string;
  /** P9: set only when the page quotes a currency foreign to this deployment. */
  currency: string;
  existing: { id: string; title: string } | null;
};

function UrlImport({ view, onImported }: { view: ItemView; onImported: () => void }) {
  const t = useT();
  const [url, setUrl] = useState('');
  const [pending, startTransition] = useTransition(); // preview fetch
  const [approving, startApprove] = useTransition(); // save
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  function handlePreview() {
    const u = url.trim();
    if (!u) return;
    setMsg(null);
    setOkMsg(null);
    setWarnMsg(null);
    setPreview(null);
    startTransition(async () => {
      const r = await previewItemFromUrl(u);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setPreview({
        title: r.title,
        price: r.price,
        store: r.store,
        specs: r.specs,
        category: r.category,
        currency: r.currency,
        existing: r.existing,
      });
    });
  }

  function handleApprove() {
    if (!preview) return;
    setMsg(null);
    startApprove(async () => {
      const r = await confirmImportItem(
        {
          url: url.trim(),
          title: preview.title,
          price: preview.price,
          store: preview.store,
          specs: preview.specs,
          category: preview.category,
          currency: preview.currency,
        },
        view
      );
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setOkMsg(r.updated ? t('it.updatedExisting', { title: r.title }) : t('it.added', { title: r.title }));
      // P9: the price was left out because the page quotes another currency than the item.
      setWarnMsg(r.priceSkippedCurrency ? t('it.priceSkippedCurrency', { code: r.priceSkippedCurrency }) : null);
      setPreview(null);
      setUrl('');
      setTimeout(() => onImported(), 1200);
    });
  }

  return (
    <div>
      <label
        className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <Sparkles size={11} className="text-[color:var(--color-accent)]" /> {t('it.importUrlHint')}
      </label>
      <div className="flex gap-2">
        <Input
          icon={<Link2 size={14} />}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (preview) setPreview(null);
          }}
          placeholder={t('it.urlPlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handlePreview())}
          disabled={pending || approving}
        />
        <Button variant="primary" onClick={handlePreview} disabled={pending || approving || !url.trim()} className="shrink-0">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {pending ? t('it.reading') : t('it.preview')}
        </Button>
      </div>
      {pending && (
        <p className="text-[10px] text-[color:var(--color-cyan)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('it.fetchingProduct')}
        </p>
      )}
      {msg && <p className="text-[10px] text-[color:var(--color-red)] mt-1.5">{msg}</p>}
      {okMsg && (
        <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {okMsg}
        </p>
      )}
      {warnMsg && (
        <p className="text-[10px] text-[color:var(--color-gold)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {warnMsg}
        </p>
      )}

      {/* Preview card — approve to save */}
      {preview && (
        <div className="mt-3 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] p-3">
          {preview.existing && (
            <p className="text-[10px] text-[color:var(--color-gold)] mb-2 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('it.matchesExisting', { title: preview.existing.title })}
            </p>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                {preview.title}
              </p>
              <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                {preview.category} · {preview.store}
              </p>
              {preview.specs && <p className="text-xs text-[color:var(--color-text-dim)] line-clamp-3 mt-1.5">{preview.specs}</p>}
            </div>
            {preview.price > 0 && (
              <span className="text-[color:var(--color-accent)] font-extrabold text-xl leading-none shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                {/* P9: show the price in the currency the page actually prints it in. */}
                {preview.currency ? formatMoney(preview.price, preview.currency) : `${cur()}${preview.price}`}
              </span>
            )}
          </div>
          {preview.currency && (
            <p className="text-[10px] text-[color:var(--color-gold)] mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
              {t(preview.existing ? 'it.foreignPagePriceExisting' : 'it.foreignPagePriceNew', { code: preview.currency })}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Button variant="primary" onClick={handleApprove} disabled={approving} className="shrink-0">
              {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {approving ? t('it.adding') : preview.existing ? t('it.approveUpdate') : t('it.approveAdd')}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={approving}>
              {t('it.discard')}
            </Button>
            <span className="text-[10px] text-[color:var(--color-text-faint)] ml-auto" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('it.photosOnApprove')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Item Card ─────────────────────────────────────────────────────────────

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Price to show next to a store-link: its own stored price, else the most recent
 *  price-history point recorded for that exact URL (scraper / import). */
function latestPriceForUrl(history: { url: string; price: number; date: string }[], url: string): number | null {
  let best: { price: number; t: number } | null = null;
  for (const h of history) {
    if (h.url === url && typeof h.price === 'number' && h.price > 0) {
      const t = new Date(h.date).getTime();
      if (!best || t > best.t) best = { price: h.price, t };
    }
  }
  return best ? best.price : null;
}

// ─── Price-tracker helpers (shopping) ───────────────────────────────────────

/** Cheapest store-link price (the "best price across stores" badge). */
function bestLinkPrice(item: SerializedItem): { price: number; store: string } | null {
  let best: { price: number; store: string } | null = null;
  for (const l of item.links ?? []) {
    if (l.price && l.price > 0 && (!best || l.price < best.price)) {
      best = { price: l.price, store: l.label || linkHost(l.url) };
    }
  }
  return best;
}

/** Lowest known price across the current price + every store-link. */
function lowestKnown(item: SerializedItem): number | null {
  let lo = item.currentPrice > 0 ? item.currentPrice : Infinity;
  for (const l of item.links ?? []) if (l.price && l.price > 0) lo = Math.min(lo, l.price);
  return lo < Infinity ? lo : null;
}

/** Signed change between the two most recent price-history points (latest − prev). */
function priceTrend(item: SerializedItem): number | null {
  const hist = [...(item.priceHistory ?? [])]
    .filter((h) => h.price > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1].price;
  const prev = hist[hist.length - 2].price;
  return latest === prev ? null : latest - prev;
}

/** True when a target is set and the lowest known price has reached it. */
function isDeal(item: SerializedItem): boolean {
  if (!item.targetPrice || item.targetPrice <= 0) return false;
  const lo = lowestKnown(item);
  return lo != null && lo <= item.targetPrice;
}

// Labelled group for the filter sidebar
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

type ItemCardProps = {
  item: SerializedItem;
  view: ItemView;
  /** P9: deployment base currency, so the card can show what a foreign item's receipt said. */
  base: string;
  plan?: InstallmentPlan;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  selectMode: boolean;
};

// Compact horizontal row for the list layout
function ItemRow({ item, view, base, plan, onClick, selected, onToggleSelect, selectMode }: ItemCardProps) {
  const t = useT();
  const cover = item.photos[0];
  const best = view === 'shopping' ? bestLinkPrice(item) : null;
  const deal = view === 'shopping' && isDeal(item);
  const w = warrantyState(item.warrantyUntil, t);
  const mainClick = selectMode ? onToggleSelect : onClick;
  return (
    <div
      className={cn(
        'group flex items-center gap-3 bg-[color:var(--color-surface)] border rounded-xl px-3 py-2.5 transition-all',
        selected ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]'
      )}
    >
      {(selectMode || selected) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            'shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
            selected
              ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black'
              : 'border-[color:var(--color-border)] text-transparent hover:text-[color:var(--color-text-faint)] hover:border-[color:var(--color-accent)]'
          )}
        >
          <Check size={13} strokeWidth={3} />
        </button>
      )}
      <button onClick={mainClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="w-11 h-11 rounded-lg bg-[color:var(--color-surface-2)] overflow-hidden shrink-0 grid place-items-center">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(cover)} alt={item.title} loading="lazy" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[9px] uppercase text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {(item.category || '?').slice(0, 3)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {item.title}
            </span>
            {item.aiFilledAt && <Sparkles size={10} className="text-[color:var(--color-accent)] shrink-0" />}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
            <span className="uppercase tracking-wider">{item.num ? `${item.num} / ` : ''}{item.category}</span>
            {w && <span style={{ color: w.color }}>{w.label}</span>}
            {plan && <span className="text-[color:var(--color-purple)]">{t('it.installmentsXY', { paid: plan.paidInstallments, total: plan.totalInstallments })}</span>}
            {best && (
              <span className="text-[color:var(--color-text-dim)]">
                {best.price !== item.currentPrice ? (
                  <>{t('it.best')} <span className="text-[color:var(--color-accent)]">{cur()}{best.price}</span></>
                ) : (
                  <>{t('it.at')} <span className="text-[color:var(--color-text-faint)]">{best.store}</span></>
                )}
              </span>
            )}
            {deal && <span className="text-[color:var(--color-accent)]">🎯 {t('it.deal')}</span>}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-3 shrink-0">
        {item.currentPrice > 0 && (
          <span className="font-extrabold text-[color:var(--color-accent)] text-lg leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {cur()}{item.currentPrice}
          </span>
        )}
        {/* P9: what the receipt actually said, when the item was not bought in base currency. */}
        <FxBadge doc={item} base={base} />
        <Badge status={item.status} />
      </div>
    </div>
  );
}

function ItemCard({
  item,
  view,
  base,
  plan,
  onClick,
  selected,
  onToggleSelect,
  selectMode,
}: ItemCardProps) {
  const t = useT();
  const cover = item.photos[0];
  const links = (item.links ?? []).slice(0, 3);
  const best = view === 'shopping' ? bestLinkPrice(item) : null;
  const trend = view === 'shopping' ? priceTrend(item) : null;
  const deal = view === 'shopping' && isDeal(item);
  // In select mode, a click anywhere on the card toggles selection (the user asked
  // not to be forced to hit the tiny top-left checkbox). Otherwise it opens detail.
  const mainClick = selectMode ? onToggleSelect : onClick;
  return (
    <div
      className={cn(
        'group relative flex flex-col bg-[color:var(--color-surface)] border rounded-2xl overflow-hidden hover:-translate-y-0.5 transition-all',
        selected
          ? 'border-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]'
          : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]'
      )}
    >
      {/* Selection toggle — visible only in select mode (or when already selected) */}
      {(selectMode || selected) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          title={selected ? t('it.deselect') : t('it.selectForAi')}
          className={cn(
            'absolute top-2 left-2 z-10 w-6 h-6 rounded-md border flex items-center justify-center transition-colors',
            selected
              ? 'bg-[color:var(--color-accent)] border-[color:var(--color-accent)] text-black'
              : 'bg-[color:var(--color-surface-2)]/90 border-[color:var(--color-border)] text-transparent hover:text-[color:var(--color-text-faint)] hover:border-[color:var(--color-accent)]'
          )}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      )}
      <button onClick={mainClick} className="w-full text-left flex flex-col flex-1 cursor-pointer">
        {cover && (
          <div className="aspect-[16/10] w-full bg-[color:var(--color-surface-2)] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(cover)} alt={item.title} loading="lazy" className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform" />
          </div>
        )}
        <div className={cn('p-4 flex flex-col flex-1', cover && 'pt-3')}>
          {/* Eyebrow: num / category + AI-enriched status (so you don't re-fill it) */}
          <div
            className="flex items-center justify-between gap-2 text-[0.7rem] text-[color:var(--color-text-faint)] uppercase tracking-[0.1em] mb-1.5"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span className="truncate">{item.num ? `${item.num} / ` : ''}{item.category}</span>
            {item.aiFilledAt && (
              <span
                className="flex items-center gap-0.5 text-[color:var(--color-accent)] shrink-0"
                title={t('it.aiEnriched', { date: new Date(item.aiFilledAt).toLocaleDateString('en-GB') })}
              >
                <Sparkles size={9} /> AI
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="font-semibold text-sm leading-snug flex-1" style={{ fontFamily: 'var(--font-display)' }}>
              {item.title}
            </span>
            <Badge status={item.status} />
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            {item.currentPrice > 0 && (
              <span
                className="text-[color:var(--color-accent)] font-extrabold text-2xl tracking-tight leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {cur()}{item.currentPrice}
              </span>
            )}
            {item.purchasedPrice && item.purchasedPrice !== item.currentPrice && (
              <span className="text-[color:var(--color-text-faint)] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('it.paid')} {cur()}{item.purchasedPrice}
              </span>
            )}
            {/* P9: what the receipt actually said, when the item was not bought in base currency. */}
            <FxBadge doc={item} base={base} />
            {trend != null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] font-semibold',
                  trend < 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'
                )}
                title={t('it.lastChange', { dir: trend < 0 ? t('pp.down') : t('pp.up'), x: `${cur()}${Math.abs(trend).toFixed(2)}` })}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {trend < 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}{cur()}{Math.abs(trend).toFixed(0)}
              </span>
            )}
          </div>

          {/* Price-tracker row (shopping): best store price + target/deal */}
          {view === 'shopping' && (best || item.targetPrice) && (
            <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
              {best && (
                <span className="text-[color:var(--color-text-dim)]">
                  {best.price !== item.currentPrice ? (
                    <>
                      {t('it.best')} <span className="text-[color:var(--color-accent)] font-semibold">{cur()}{best.price}</span>
                      <span className="text-[color:var(--color-text-faint)]"> · {best.store}</span>
                    </>
                  ) : (
                    <span className="text-[color:var(--color-text-faint)]">{t('it.at')} {best.store}</span>
                  )}
                </span>
              )}
              {item.targetPrice ? (
                deal ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#00ff881a] text-[color:var(--color-accent)] border border-[#00ff8840] font-semibold uppercase tracking-wide">
                    <Target size={9} /> {t('it.deal')} ≤{cur()}{item.targetPrice}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[color:var(--color-text-faint)]">
                    <Target size={9} /> {t('it.targetWord')} {cur()}{item.targetPrice}
                  </span>
                )
              ) : null}
            </div>
          )}

          {item.specs && (
            <p className="text-xs text-[color:var(--color-text-dim)] mt-2 leading-relaxed line-clamp-2">
              {item.specs}
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {(() => {
              const w = warrantyState(item.warrantyUntil, t);
              return w ? (
                <span
                  className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)', background: `${w.color}1a`, color: w.color, border: `1px solid ${w.color}40` }}
                >
                  {w.label}
                </span>
              ) : null;
            })()}
            {plan && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider border',
                  plan.done
                    ? 'bg-[#00ff881a] text-[color:var(--color-accent)] border-[#00ff8840]'
                    : 'bg-[#a55eea1a] text-[color:var(--color-purple)] border-[#a55eea40]'
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Layers size={9} />
                {plan.done ? t('it.paidOff') : t('it.installmentsXY', { paid: plan.paidInstallments, total: plan.totalInstallments })}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Link pills (like reference .item-links). Siblings of the button, not nested,
          so the markup stays valid and clicks open the URL instead of the modal. */}
      {links.length > 0 && (
        <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3 border-t border-[color:var(--color-border)]">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-[0.7rem] text-[color:var(--color-cyan)] bg-[color:var(--color-surface-2)] hover:bg-[color:var(--color-surface-3)] hover:text-[color:var(--color-accent)] rounded-md px-2.5 py-1.5 transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span className="shrink-0">→</span>
              {l.label && (
                <span className="shrink-0 text-[0.6rem] uppercase tracking-wider text-[color:var(--color-text-faint)]">{l.label}</span>
              )}
              <span className="truncate">{linkHost(l.url)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Item Detail Modal ─────────────────────────────────────────────────────

function fileUrl(filePath: string) {
  return `/api/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

function ItemDetailModal({
  item,
  view,
  fx,
  plans,
  unlinkedPlans,
  receipts,
  onClose,
  onItemUpdated,
}: {
  item: SerializedItem;
  view: ItemView;
  fx: FxCtx;
  plans: InstallmentPlan[];
  unlinkedPlans: InstallmentPlan[];
  receipts: ReceiptRef[];
  onClose: () => void;
  onItemUpdated: (item: SerializedItem) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [aiAllFilling, setAiAllFilling] = useState(false);
  const [infoFilling, setInfoFilling] = useState(false);
  const [photoFetching, setPhotoFetching] = useState(false);
  const [showPriceSearch, setShowPriceSearch] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; href?: string; tone: 'ok' | 'err' } | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const busy = pending || aiAllFilling || infoFilling || photoFetching;

  // Combined "AI fill all" — info + prices + photos in one shot.
  function handleAiFill() {
    setActionMsg(null);
    setAiAllFilling(true);
    startTransition(async () => {
      const r = await aiFillItem(item._id);
      setAiAllFilling(false);
      if (!r.ok || !r.item) {
        setActionMsg({ text: r.error ?? t('it.aiFillFailed'), tone: 'err' });
        return;
      }
      onItemUpdated(r.item); // re-seeds the form + gallery (keyed by updatedAt)
      router.refresh(); // refresh the underlying list too
      const what = r.filled.length ? r.filled.join(', ') : 'nothing new';
      setActionMsg({ text: `✓ Read ${r.checked} link${r.checked === 1 ? '' : 's'} · filled: ${what}`, tone: 'ok' });
    });
  }

  // Info only — specs / category / tags (additive). Never touches prices or photos.
  function handleAiFillInfo() {
    setActionMsg(null);
    setInfoFilling(true);
    startTransition(async () => {
      const r = await aiFillInfo(item._id);
      setInfoFilling(false);
      if (!r.ok || !r.item) {
        setActionMsg({ text: r.error ?? 'Could not fill info', tone: 'err' });
        return;
      }
      onItemUpdated(r.item); // re-seeds the form (keyed by updatedAt)
      router.refresh();
      const what = r.filled.length ? r.filled.join(', ') : 'nothing new';
      setActionMsg({ text: `✓ Info filled: ${what}`, tone: 'ok' });
    });
  }

  // Photos only.
  function handlePhotoFetch() {
    setActionMsg(null);
    setPhotoFetching(true);
    startTransition(async () => {
      const r = await fetchItemPhotos(item._id);
      setPhotoFetching(false);
      if (!r.ok) {
        setActionMsg({ text: r.error ?? 'No photos found', tone: 'err' });
        return;
      }
      onItemUpdated({ ...item, photos: r.photos, updatedAt: new Date().toISOString() }); // re-key the gallery
      router.refresh();
      setActionMsg({ text: `✓ Fetched ${r.added} photo${r.added === 1 ? '' : 's'}`, tone: 'ok' });
    });
  }

  function handleConvertToTask() {
    setActionMsg(null);
    startTransition(async () => {
      const r = await convertItemToTask(item._id);
      if (!r.ok) {
        setActionMsg({ text: r.error ?? 'Could not create task', tone: 'err' });
        return;
      }
      setActionMsg({ text: '✓ Task created with the product links', href: '/tasks', tone: 'ok' });
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t('it.deleteItem'),
      message: t('it.confirmDeleteItem', { title: item.title }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteItem(item._id);
      onClose();
    });
  }

  const warranty = warrantyState(item.warrantyUntil, t);
  const hasPayment = plans.length > 0 || item.receiptIds.length > 0 || unlinkedPlans.length > 0;
  // Headline price: what you paid (owned) or the cheapest REAL store link (shopping).
  // Falls back to currentPrice only when there are no priced links — so a stale/seeded
  // currentPrice (e.g. €475 with no store) never shows over the actual store prices.
  const headlinePrice = item.purchasedPrice ? item.purchasedPrice : (bestLinkPrice(item)?.price ?? (item.currentPrice || 0));

  return (
    <>
    <Modal open onClose={onClose} title={item.title} size="2xl">
      {/* Hero: product photos + key facts at a glance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <ItemPhotoGallery key={`g-${item._id}-${item.updatedAt}`} itemId={item._id} photos={item.photos} canFetch={false} />

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge status={item.status} />
            <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
              {item.category}
            </span>
            {item.num && (
              <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                #{item.num}
              </span>
            )}
          </div>

          {/* Price — top-right of the product (paid for owned, current for wishlist) */}
          <div className="bg-[color:var(--color-surface-2)] rounded-xl p-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {item.purchasedPrice ? t('it.paidLabel') : t('it.currentPriceLabel')}
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-bold text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {headlinePrice > 0 ? `${cur()}${headlinePrice}` : '—'}
                </span>
                {/* P9: the printed figure behind the converted one above. */}
                <FxBadge doc={item} base={fx.base} />
              </div>
              {item.purchasedFrom && (
                <div className="text-xs text-[color:var(--color-text-dim)] mt-0.5">
                  from {item.purchasedFrom}
                  {item.purchasedAt && ` · ${new Date(item.purchasedAt).toLocaleDateString('en-GB')}`}
                </div>
              )}
            </div>
            {item.purchasedPrice && item.currentPrice > 0 && item.currentPrice !== item.purchasedPrice && (
              <div className="text-right">
                <div className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>{t('it.priceNow')}</div>
                <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{cur()}{item.currentPrice}</div>
              </div>
            )}
          </div>

          {/* Price-tracker target / deal */}
          {item.targetPrice ? (
            <div
              className={cn(
                'flex items-center gap-2 text-xs rounded-lg px-3 py-2',
                isDeal(item)
                  ? 'bg-[#00ff881a] text-[color:var(--color-accent)] border border-[#00ff8840]'
                  : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <Target size={13} className="shrink-0" />
              {isDeal(item)
                ? t('it.dealReached', { x: `${cur()}${item.targetPrice}` })
                : `${t('it.targetX', { x: `${cur()}${item.targetPrice}` })}${lowestKnown(item) != null ? ` · ${t('it.bestKnown', { y: `${cur()}${lowestKnown(item)}` })}` : ''}`}
            </div>
          ) : null}

          {/* Separate enrichment actions: photos / info / prices — plus a combined "fill all" */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePhotoFetch}
              disabled={busy}
              title={t('it.fetchPhotosTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors disabled:opacity-50"
            >
              {photoFetching ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {photoFetching ? t('it.photosShort') : t('it.fetchPhotos')}
            </button>
            <button
              type="button"
              onClick={handleAiFillInfo}
              disabled={busy}
              title={t('it.aiFillInfoTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-gold)] hover:border-[color:var(--color-gold)] transition-colors disabled:opacity-50"
            >
              {infoFilling ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              {infoFilling ? t('it.infoShort') : t('it.aiFillInfo')}
            </button>
            <button
              type="button"
              onClick={() => setShowPriceSearch(true)}
              disabled={busy}
              title={t('it.searchPricesTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
            >
              <Search size={13} /> {t('it.searchPrices')}
            </button>
            <button
              type="button"
              onClick={handleAiFill}
              disabled={busy}
              title={t('it.aiFillAllTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-purple)] hover:border-[color:var(--color-purple)] transition-colors disabled:opacity-50"
            >
              {aiAllFilling ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {aiAllFilling ? t('it.filling') : t('it.aiFillAllBtn')}
            </button>
            <button
              type="button"
              onClick={handleConvertToTask}
              disabled={busy}
              title={t('it.convertTaskTitle')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)] transition-colors disabled:opacity-50"
            >
              <ListPlus size={13} /> {t('it.convertTask')}
            </button>
          </div>
          {(aiAllFilling || infoFilling) && (
            <p className="text-[10px] text-[color:var(--color-cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {item.links.length === 0
                ? t('it.searchingWeb')
                : t('it.readingLinks', { n: item.links.length })}{' '}
              {t('it.aiExtracting')}
            </p>
          )}
          {actionMsg && (
            <p
              className={cn('text-[11px]', actionMsg.tone === 'ok' ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span className="inline-flex items-center gap-1">
                {actionMsg.tone === 'ok' && <Check size={11} />}
                {actionMsg.text}
              </span>
              {actionMsg.href && (
                <a href={actionMsg.href} className="underline ml-1.5 text-[color:var(--color-cyan)]">
                  {t('it.openArrow')}
                </a>
              )}
            </p>
          )}

          {/* Warranty + serial */}
          <div className="flex items-center gap-2 flex-wrap">
            {warranty && (
              <span
                className="inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded uppercase tracking-wider border"
                style={{ fontFamily: 'var(--font-mono)', color: warranty.color, borderColor: warranty.color, background: 'transparent' }}
              >
                {warranty.label}
              </span>
            )}
            {item.serialNumber && (
              <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                S/N {item.serialNumber}
              </span>
            )}
          </div>

          {/* Where to buy (owned items only — wishlist shows store links in the PricePanel below) */}
          {view === 'inventory' && item.links.length > 0 && (
            <div>
              <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('it.whereToBuy')}
              </p>
              <div className="flex flex-wrap gap-2">
              {item.links.map((link, i) => {
                const p = link.price ?? latestPriceForUrl(item.priceHistory, link.url);
                return (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.url}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors"
                  >
                    <ExternalLink size={11} />
                    {link.label}
                    {p != null && (
                      <span className="font-bold text-[color:var(--color-accent)] ml-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                        {cur()}{p}
                      </span>
                    )}
                  </a>
                );
              })}
              </div>
            </div>
          )}

          {/* Purchase & payment — right column, under the AI buttons */}
          {hasPayment && (
            <div className="pt-3 mt-1 border-t border-[color:var(--color-border)]">
          <h4 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('it.purchasePayment')}
          </h4>
          <div className="flex flex-wrap gap-2 mb-3">
            {/* Each linked receipt opens its actual file (image/PDF) directly */}
            {receipts.map((r) =>
              r.filePath ? (
                <a
                  key={r._id}
                  href={fileUrl(r.filePath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('it.openReceipt', { store: r.store })}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors"
                >
                  <ReceiptIcon size={12} />
                  {r.store || t('it.receiptFallback')}
                  {r.total > 0 && <span className="text-[color:var(--color-text-faint)]">· {cur()}{r.total}</span>}
                  {r.fileType === 'pdf' && <span className="text-[9px] uppercase text-[color:var(--color-text-faint)]">pdf</span>}
                </a>
              ) : (
                <span
                  key={r._id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-[color:var(--color-text-dim)]"
                >
                  <ReceiptIcon size={12} /> {r.store || t('it.receiptFallback')} {r.total > 0 && `· ${cur()}${r.total}`}
                </span>
              )
            )}
            {/* Fallback: linked receipts whose details we couldn't load */}
            {receipts.length === 0 && item.receiptIds.length > 0 && (
              <a
                href="/receipts"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors"
              >
                <ReceiptIcon size={12} /> {t('it.receiptsN', { n: item.receiptIds.length })}
              </a>
            )}
            {plans.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-[color:var(--color-purple)]">
                <CreditCard size={12} />
                {t('it.installmentPlans', { n: plans.length })}
              </span>
            )}
          </div>
          {plans.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {plans.map((p) => (
                <div key={p.key} className="relative group/plan">
                  <InstallmentPlanCard plan={p} itemTitles={[item.title]} />
                  <button
                    onClick={() => startTransition(() => { unlinkPlanByKey(p.signature); })}
                    disabled={pending}
                    title={t('it.unlinkPlan')}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md grid place-items-center bg-[color:var(--color-surface-3)] text-[color:var(--color-text-faint)] opacity-0 group-hover/plan:opacity-100 hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface)] transition-all disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Link with installment — collapsed by default, opens a clean picker */}
          {unlinkedPlans.length > 0 && (
            <div className="mt-3">
              {!showLinkPicker ? (
                <button
                  onClick={() => setShowLinkPicker(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-dashed border-[color:var(--color-border-light)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                >
                  <Link2 size={13} /> {t('it.linkPlan')}
                  <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t('it.available', { n: unlinkedPlans.length })}
                  </span>
                </button>
              ) : (
                <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--color-border)]">
                    <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
                      <Link2 size={11} className="text-[color:var(--color-cyan)]" /> {t('it.pickPlan')}
                    </span>
                    <button onClick={() => setShowLinkPicker(false)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]" title={t('common.close')}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5 flex flex-col gap-1">
                    {unlinkedPlans.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => startTransition(() => { linkPlanToItem(p.signature, item._id); setShowLinkPicker(false); })}
                        disabled={pending}
                        className="flex items-center justify-between gap-3 text-left px-2.5 py-2 rounded-lg hover:bg-[color:var(--color-surface-3)] transition-colors disabled:opacity-50"
                      >
                        <span className="truncate flex items-center gap-2 text-xs">
                          <Layers size={12} className="text-[color:var(--color-purple)] shrink-0" />
                          <span className="truncate">{p.label}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                            {p.paidInstallments}/{p.totalInstallments} · {cur()}{p.perAmount.toFixed(2)}/mo
                          </span>
                          <Plus size={13} className="text-[color:var(--color-accent)]" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
            </div>
          )}
        </div>
      </div>

      {/* Price: ONE home — summary + verdict + log + (folded) full per-store history.
          Shopping gets the full summary; an owned item only shows its history if any. */}
      {(view === 'shopping' || item.priceHistory.length > 0) && (
        <div className="mb-4">
          <PricePanel item={item} summary={view === 'shopping'} onChanged={() => router.refresh()} onSearchOnline={() => setShowPriceSearch(true)} />
        </div>
      )}

      {/* Documents / manual vault (P21) — manuals, warranty certs, serial photos.
          `?? []` guards items saved before this field existed (lean() reads skip
          schema defaults, so an untouched legacy doc has no `attachments` at all). */}
      <div className="mb-4">
        <ItemDocuments key={`docs-${item._id}-${item.updatedAt}`} itemId={item._id} attachments={item.attachments ?? []} />
      </div>

      <ItemForm key={`f-${item._id}-${item.updatedAt}`} item={item} fx={fx} onSuccess={onClose} onDelete={handleDelete} deletePending={pending} />
    </Modal>
    {showPriceSearch && (
      <PriceSearchPanel
        item={item}
        open={showPriceSearch}
        onClose={() => setShowPriceSearch(false)}
        onAdded={(it) => onItemUpdated(it)}
      />
    )}
    </>
  );
}

// ─── Item Form ─────────────────────────────────────────────────────────────

type ItemFormState = {
  title: string;
  num: string;
  category: string;
  status: string;
  currentPrice: string;
  purchasedPrice: string;
  targetPrice: string;
  /** P9: ISO code the prices above are typed in, and the rate to the base currency. */
  currency: string;
  fxRate: string;
  purchasedFrom: string;
  specs: string;
  notes: string;
  tags: string;
  serialNumber: string;
  location: string;
};

function ItemForm({
  item,
  fx,
  defaultStatus = 'researching',
  onSuccess,
  onCancel,
  onDelete,
  deletePending,
}: {
  item?: SerializedItem;
  fx: FxCtx;
  defaultStatus?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  // P9: the stored prices are base currency, but the form edits PRINTED figures — otherwise
  // re-saving an unchanged foreign item would convert an already-converted number. So an
  // existing foreign item is un-converted back to what its receipt said; base-currency items
  // (and foreign ones with no rate yet) pass through untouched.
  const wasForeign = isForeignCurrency(item?.currency, fx.base);
  const storedRate = wasForeign ? item?.fxRate || 0 : 0;
  const printedPrice = (v: number | null | undefined): number | null =>
    v == null ? null : storedRate > 0 ? toPrinted(v, storedRate) : v;
  const [form, setForm] = useState<ItemFormState>({
    title: item?.title ?? '',
    num: item?.num ?? '',
    category: item?.category ?? 'other',
    status: item?.status ?? defaultStatus,
    currentPrice: (printedPrice(item?.currentPrice ?? 0) ?? 0).toString(),
    purchasedPrice: printedPrice(item?.purchasedPrice)?.toString() ?? '',
    targetPrice: printedPrice(item?.targetPrice)?.toString() ?? '',
    currency: wasForeign ? normalizeCurrency(item?.currency) : normalizeCurrency(fx.base) || 'EUR',
    fxRate: wasForeign && item?.fxRate ? String(item.fxRate) : '',
    purchasedFrom: item?.purchasedFrom ?? '',
    specs: item?.specs ?? '',
    notes: item?.notes ?? '',
    tags: (item?.tags ?? []).join(', '),
    serialNumber: item?.serialNumber ?? '',
    location: item?.location ?? '',
  });
  const [links, setLinks] = useState<{ label: string; url: string; price: string }[]>(
    item?.links?.length
      ? item.links.map((l) => ({ label: l.label, url: l.url, price: l.price != null ? String(l.price) : '' }))
      : []
  );

  const updateLink = (i: number, k: 'label' | 'url' | 'price', v: string) =>
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLink = () => setLinks((prev) => [...prev, { label: '', url: '', price: '' }]);
  const removeLink = (i: number) => setLinks((prev) => prev.filter((_, idx) => idx !== i));

  const set =
    (k: keyof ItemFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    fd.set('links', JSON.stringify(links.filter((l) => l.url.trim())));
    startTransition(async () => {
      if (item) {
        await updateItem(item._id, fd);
      } else {
        await createItem(fd);
      }
      onSuccess();
    });
  }

  // Owned (received/installed) → "Paid" is what matters. Shopping → a single
  // "Price"; the target + store comparison live in the PricePanel above.
  const owned = ['received', 'installed'].includes(form.status);
  // When the item has priced store links, the price is DERIVED (cheapest link), so
  // the manual price field is redundant — show it read-only.
  const linkPrices = links.map((l) => Number(l.price)).filter((p) => p > 0);
  const cheapestLink = linkPrices.length ? Math.min(...linkPrices) : null;
  // P9: price labels follow the currency being typed in, and the FX row only appears
  // when that differs from the deployment's base currency.
  const foreign = fx.enabled && isForeignCurrency(form.currency, fx.base);
  const priceCur = fx.enabled ? currencySymbol(form.currency).trim() : cur();
  // The anchor drives the conversion preview: what you paid (owned) else the asking price,
  // matching resolveItemPrices() on the server.
  const paid = Number(form.purchasedPrice) || 0;
  const anchorPrice = paid > 0 ? paid : Number(form.currentPrice) || 0;

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
      {/* Title */}
      <Field label={t('it.fTitle')} className="md:col-span-2">
        <Input
          value={form.title}
          onChange={set('title')}
          required
          placeholder={t('it.fTitlePlaceholder')}
        />
      </Field>

      {/* Category + Status */}
      <Field label={t('common.category')}>
        <select value={form.category} onChange={set('category')} className={selectClass}>
          {itemCategoryOptions(form.category).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('common.status')}>
        <select value={form.status} onChange={set('status')} className={selectClass}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {IT_STATUS_KEY[s.value] ? t(IT_STATUS_KEY[s.value]) : s.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Prices — one field that fits the item: what you PAID (owned) vs the
          current PRICE (wishlist). Target + store comparison are in the price panel.
          P9: with multi-currency on these are the PRINTED figures, in `form.currency`. */}
      {owned ? (
        <>
          <Field label={t('it.fPaid', { cur: priceCur })}>
            <Input type="number" step="0.01" min="0" value={form.purchasedPrice} onChange={set('purchasedPrice')} placeholder={t('it.fPaidPlaceholder')} />
          </Field>
          <Field label={t('it.fCurrentValue', { cur: priceCur })}>
            <Input type="number" step="0.01" min="0" value={form.currentPrice} onChange={set('currentPrice')} placeholder={t('it.fWorthPlaceholder')} />
          </Field>
        </>
      ) : cheapestLink != null ? (
        <Field label={t('it.fPrice', { cur: priceCur })}>
          <div className="text-sm px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] flex items-center justify-between gap-2">
            <span className="font-semibold text-[color:var(--color-text)]">{cur()}{cheapestLink}</span>
            <span className="text-[11px] text-[color:var(--color-text-faint)]">{t('it.autoCheapest')}</span>
          </div>
        </Field>
      ) : (
        <Field label={t('it.fPrice', { cur: priceCur })}>
          <Input type="number" step="0.01" min="0" value={form.currentPrice} onChange={set('currentPrice')} placeholder={t('it.fPricePlaceholder')} />
        </Field>
      )}

      {/* P9: the currency the prices above are printed in. Hidden entirely on a
          single-currency deployment, so nothing about that flow changes. */}
      {fx.enabled && (
        <Field label={t('ex.fCurrency')}>
          <select value={form.currency} onChange={set('currency')} className={selectClass}>
            {currencyCodes(fx.base).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      )}
      {foreign && (
        <div className="md:col-span-2">
          <ItemFxFields
            form={form}
            anchor={anchorPrice}
            setRate={(v) => setForm((p) => ({ ...p, fxRate: v }))}
            base={fx.base}
          />
        </div>
      )}

      {/* Purchased from */}
      <Field label={t('it.fPurchasedFrom')}>
        <Input
          value={form.purchasedFrom}
          onChange={set('purchasedFrom')}
          placeholder={t('it.fPurchasedPlaceholder')}
        />
      </Field>

      {/* Specs */}
      <Field label={t('it.fSpecs')} className="md:col-span-2">
        <textarea
          value={form.specs}
          onChange={set('specs')}
          rows={3}
          placeholder={t('it.fSpecsPlaceholder')}
          className={textareaClass}
        />
      </Field>

      {/* Notes */}
      <Field label={t('v.fNotes')} className="md:col-span-2">
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={3}
          placeholder={t('it.fNotesPlaceholder')}
          className={textareaClass}
        />
      </Field>

      {/* Tags + Num */}
      <Field label={t('it.fTags')}>
        <Input
          value={form.tags}
          onChange={set('tags')}
          placeholder={t('it.fTagsPlaceholder')}
        />
      </Field>
      <Field label={t('it.fNum')}>
        <Input value={form.num} onChange={set('num')} placeholder="01" />
      </Field>
      <Field label={t('it.fSerial')}>
        <Input
          value={form.serialNumber}
          onChange={set('serialNumber')}
          placeholder={t('it.fSerialPlaceholder')}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      </Field>
      <Field label={t('it.fLocation')}>
        <Input value={form.location} onChange={set('location')} placeholder={t('it.fLocationPlaceholder')} />
      </Field>

      {/* Links editor */}
      <div className="md:col-span-2">
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('it.linksN', { n: links.length })}
          </label>
          <button
            type="button"
            onClick={addLink}
            className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-1 hover:opacity-80"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Plus size={11} /> {t('common.add')}
          </button>
        </div>
        <div className="space-y-1.5">
          {links.map((l, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                value={l.label}
                onChange={(e) => updateLink(i, 'label', e.target.value)}
                placeholder={t('it.fLinkLabel')}
                className="w-32 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[color:var(--color-accent)]"
              />
              <input
                value={l.url}
                onChange={(e) => updateLink(i, 'url', e.target.value)}
                placeholder={t('it.fLinkUrl')}
                className="flex-1 min-w-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[color:var(--color-accent)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={l.price}
                onChange={(e) => updateLink(i, 'price', e.target.value)}
                placeholder={cur()}
                title={t('it.priceAtStore')}
                className="w-20 shrink-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-2.5 py-1.5 text-xs text-[color:var(--color-accent)] focus:outline-none focus:border-[color:var(--color-accent)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors p-1 shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <p className="text-xs text-[color:var(--color-text-faint)] italic">{t('it.noLinks')}</p>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2 md:col-span-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('v.saving') : item ? t('common.save') : t('v.create')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        {onDelete && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={onDelete} disabled={deletePending}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Multi-currency (P9): shown only when the item's currency differs from the base one.
 *  Two ways in, because someone holding a foreign receipt knows what their bank charged but
 *  not the rate: type the rate, or type the amount actually debited and let deriveFxRate()
 *  back it out. The preview is the anchor price as it will be stored (and summed in net
 *  worth / the insurance export); the item's other price fields convert with the same rate. */
function ItemFxFields({
  form,
  anchor,
  setRate,
  base,
}: {
  form: { currency: string; fxRate: string };
  /** Printed anchor price — what you paid when owned, else the asking price. */
  anchor: number;
  /** Only the rate is editable here, so the parent's full form type stays out of this component. */
  setRate: (v: string) => void;
  base: string;
}) {
  const t = useT();
  const [charged, setCharged] = useState('');
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
        {/* P9 phase 2: latest fixing — an item carries no single document date (the
            purchase, the asking price and the target are not all from the same day). */}
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
            const derived = deriveFxRate(anchor, Number(v) || 0);
            setRate(derived ? String(derived) : '');
          }}
        />
      </Field>
      <p className="text-[11px] pb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {rate > 0 ? (
          <span className="text-[color:var(--color-purple)]">= {formatMoney(convertToBase(anchor, rate), base)}</span>
        ) : (
          <span className="text-[color:var(--color-gold)]">⚠ {t('ex.fxNoRate', { base })}</span>
        )}
      </p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
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
