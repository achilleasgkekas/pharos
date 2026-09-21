'use client';
import { cur, currencySymbol, CURRENCIES } from "@/lib/money";
import { todayLocal } from "@/lib/dates";
import { useState, useTransition, useMemo, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Layers,
  FileText,
  X,
  Upload,
  Loader2,
  Sparkles,
  Link2,
  Package,
  GitMerge,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import type { SerializedStatement, SerializedTransaction, SerializedCard } from '@/types';
import { periodLabel, buildCardLabel } from '@/lib/cards';
import { statementsWithCurrentCards } from '@/lib/statementCards';
import {
  buildCardUtilization,
  type CardUtilization,
  type CardUtilizationIndex,
} from '@/lib/cardUtilization';
import { computeInstallmentPlans, type InstallmentPlan } from '@/lib/installments';
import { InstallmentPlanCard } from '@/components/InstallmentPlanCard';
import { ReconcilePanel } from './ReconcilePanel';
import { useOpenParam } from '@/components/useOpenParam';
import {
  createStatement,
  updateStatement,
  deleteStatement,
  addTransaction,
  deleteTransaction,
  importStatementPdf,
  categorizeStatement,
  linkInstallmentToItem,
  unlinkInstallment,
  setTransactionInstallment,
  linkPlanToItem,
  unlinkPlanByKey,
  removeItemFromPlanByKey,
  bindInstallmentGroup,
  unbindInstallmentGroup,
  rescanStatement,
} from './actions';
import { OWNED_STATUSES } from '@/lib/itemStatus';
import { createCard, updateCard, deleteCard, toggleCardActive, scanCard } from './cards';
import { CreditCard as CreditCardIcon, Wallet, Power, Camera, ScanLine } from 'lucide-react';
import { shrinkImage } from '@/lib/clientImage';
import { OpenInOneDriveButton } from '@/components/OpenInOneDriveButton';
import { useLocale, useT } from '@/components/LocaleProvider';
import { FxBadge } from '@/components/FxBadge';
import { FxRateButton } from '@/components/FxRateButton';
import {
  isForeignCurrency,
  normalizeCurrency,
  toPrinted,
  deriveFxRate,
  convertToBase,
  formatMoney,
} from '@/lib/fx';
import { formatDate, formatTime, formatDateTime } from '@/lib/i18n/format';

export type ItemOption = {
  _id: string;
  title: string;
  num: string;
  category: string;
  status: string;
  currentPrice: number;
  purchasedPrice: number | null;
};

const inputClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-2.5 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]';

function fileUrl(filePath: string) {
  return `/api/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

/** Multi-currency context (P9): the deployment's base currency code + whether the
 *  per-statement currency/FX controls are switched on at all. */
type FxCtx = { base: string; enabled: boolean };

/** P9: the base code always comes first, even when it is not one of the built-ins. */
function currencyCodes(base: string): string[] {
  return [...new Set([normalizeCurrency(base) || 'EUR', ...CURRENCIES.map((c) => c.code)])];
}

/** Display title for a statement: "Ιούνιος 2026 · ···1234". */
function statementTitle(s: SerializedStatement): string {
  const month = periodLabel(s.period) || s.period;
  const tail = s.last4 ? ` · ···${s.last4}` : '';
  return `${month}${tail}`;
}

// ─── Main component ────────────────────────────────────────────────────────

export function StatementsClient({
  statements: storedStatements,
  cards,
  items,
  ollamaUp,
  baseCurrency = 'EUR',
  multiCurrency = false,
}: {
  statements: SerializedStatement[];
  cards: SerializedCard[];
  items: ItemOption[];
  ollamaUp: boolean;
  baseCurrency?: string;
  multiCurrency?: boolean;
}) {
  const t = useT();
  const statements = useMemo(() => statementsWithCurrentCards(storedStatements, cards), [storedStatements, cards]);
  const fx: FxCtx = { base: baseCurrency, enabled: multiCurrency };
  const [showCreate, setShowCreate] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePdf(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const total = list.length;
    setUploading(true);

    let imported = 0;
    let totalTx = 0;
    let lastAiError: string | undefined;
    const periods: string[] = [];
    let replacedWarning = false;
    for (let i = 0; i < total; i++) {
      const base = ollamaUp ? t('st.readingPdf') : t('st.savingPdf');
      setUploadMsg(total > 1 ? `${base} ${i + 1}/${total}...` : `${base}...`);
      const fd = new FormData();
      fd.set('file', list[i]);
      const res = await importStatementPdf(fd);
      if (!res.ok) {
        setUploadMsg(`${t('st.error')}: ${res.error}`);
        setUploading(false);
        return;
      }
      imported++;
      totalTx += res.txCount;
      if (res.aiError) lastAiError = res.aiError;
      if (res.period) periods.push(res.period);
      if (res.replacedExisting) replacedWarning = true;
    }

    setUploading(false);
    const months = periods.join(', ');
    setUploadMsg(
      lastAiError
        ? `${lastAiError}. ${t('st.savedManual')}`
        : replacedWarning
          ? t('st.importedReplaced', { months })
          : total > 1
            ? t('st.importedN', { n: imported, months, tx: totalTx })
            : t('st.imported', { months, tx: totalTx })
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Distinct card labels present in statements (for the filter chips)
  const cardLabels = useMemo(() => [...new Set(statements.map((s) => s.card))].sort(), [statements]);
  // A rename can invalidate a selected label while the card editor is open.
  const effectiveCardFilter = cardLabels.includes(cardFilter) ? cardFilter : 'all';

  const visible = useMemo(
    () => (effectiveCardFilter === 'all' ? statements : statements.filter((s) => s.card === effectiveCardFilter)),
    [statements, effectiveCardFilter]
  );

  // Group visible statements by card
  const byCard = useMemo(() => {
    const map = new Map<string, SerializedStatement[]>();
    for (const s of visible) {
      const list = map.get(s.card) ?? [];
      list.push(s);
      map.set(s.card, list);
    }
    return [...map.entries()];
  }, [visible]);

  // Installment plans across all statements (for per-product payoff)
  const plans = useMemo(() => computeInstallmentPlans(statements), [statements]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i._id, i])), [items]);

  // Current debt = the LATEST statement per card (its total already rolls up the
  // running balance) minus what's been paid on it. Summing every statement would
  // double-count, since each statement's total IS the balance at that moment.
  const balance = useMemo(() => {
    const latest = new Map<string, SerializedStatement>();
    for (const s of statements) {
      const cur = latest.get(s.card);
      if (!cur || s.period > cur.period) latest.set(s.card, s);
    }
    let total = 0;
    for (const s of latest.values()) total += s.totalAmount - s.paidAmount;
    return total;
  }, [statements]);
  // P84: how much of each card's limit that same balance is using. Same source of
  // truth as `balance` above (latest statement per card), so the badge can never
  // contradict the outstanding figure printed next to it.
  const utilization = useMemo(() => buildCardUtilization(cards, statements), [cards, statements]);
  const active = activeId ? statements.find((s) => s._id === activeId) ?? null : null;

  // Deep-link from global search
  useOpenParam((id) => {
    if (statements.some((s) => s._id === id)) setActiveId(id);
  });

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {t('nav.statements')}
            <span
              className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {statements.length}
            </span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {statements.length > 0 && (
              <div className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {balance < -0.001 ? t('st.credit') : t('st.outstanding')}{' '}
                <span
                  className={cn(
                    'font-semibold',
                    balance < -0.001 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'
                  )}
                >
                  {cur()}{Math.abs(balance).toFixed(2)}
                </span>
              </div>
            )}
            {statements.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setShowReconcile(true)}>
                <Link2 size={14} /> {t('rec.button')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowCards(true)}>
              <Wallet size={14} /> {t('st.cards', { n: cards.length })}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} strokeWidth={2.5} /> {t('common.new')}
            </Button>
          </div>
        </div>
      </div>

      {/* PDF import dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handlePdf(e.dataTransfer.files); }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-6 mb-3 text-center cursor-pointer transition-all',
          dragOver ? 'border-[color:var(--color-accent)] bg-[#00ff8808]' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]',
          uploading && 'pointer-events-none opacity-70'
        )}
      >
        <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => handlePdf(e.target.files)} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-[color:var(--color-cyan)]">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-sm">{uploadMsg}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-[color:var(--color-text-dim)]">
            <Upload size={24} />
            <p className="text-sm font-medium text-[color:var(--color-text)]">{t('st.importTitle')}</p>
            <p className="text-xs text-[color:var(--color-text-faint)] flex items-center gap-1.5">
              <Sparkles size={11} className={ollamaUp ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'} />
              {ollamaUp ? t('st.aiExtracts') : t('st.ollamaOffline')}
            </p>
          </div>
        )}
      </div>
      {uploadMsg && !uploading && (
        <p className="text-xs text-[color:var(--color-text-dim)] mb-4 px-1" style={{ fontFamily: 'var(--font-mono)' }}>{uploadMsg}</p>
      )}

      {/* Installment plans summary (active + completed) */}
      {plans.length > 0 && <InstallmentOverview plans={plans} items={items} itemMap={itemMap} />}

      {/* Card filter chips */}
      {cardLabels.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <FilterChip active={effectiveCardFilter === 'all'} onClick={() => setCardFilter('all')}>
            {t('st.allCards')}
          </FilterChip>
          {cardLabels.map((c) => (
            <FilterChip key={c} active={effectiveCardFilter === c} onClick={() => setCardFilter(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Empty */}
      {statements.length === 0 ? (
        <div className="text-center py-16 text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-4">💳</p>
          <p className="text-sm">{t('st.empty')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {byCard.map(([card, list]) => (
            <div key={card}>
              <h2
                className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.2em] mb-3 flex items-center gap-2"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {card}
                <UtilizationBadge u={utilization.byLabel.get(card)} />
              </h2>
              <div className="space-y-2">
                {list.map((s) => (
                  <StatementRow key={s._id} statement={s} base={fx.base} onOpen={() => setActiveId(s._id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-screen detail */}
      {active && (
        <Modal open onClose={() => setActiveId(null)} title={statementTitle(active)} size="xl">
          <StatementDetail
            key={active._id}
            statement={active}
            cards={cards}
            items={items}
            itemMap={itemMap}
            fx={fx}
            onClose={() => setActiveId(null)}
          />
        </Modal>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("stm.newStatement")} size="md">
        <StatementForm cards={cards} fx={fx} onSuccess={() => setShowCreate(false)} />
      </Modal>

      <Modal open={showCards} onClose={() => setShowCards(false)} title={t("stm.manageCards")} size="xl">
        <CardsManager cards={cards} statements={statements} utilization={utilization} />
      </Modal>

      <Modal open={showReconcile} onClose={() => setShowReconcile(false)} title={t('rec.title')} size="lg">
        <ReconcilePanel statements={statements.map((s) => ({ _id: s._id, card: s.card, period: s.period }))} />
      </Modal>
    </main>
  );
}

// ─── Credit limit utilization (P84) ────────────────────────────────────────

/**
 * How much of a card's limit the current balance is using. Renders nothing when the
 * card has no limit set, which is the common case: an empty `creditLimit` means we
 * genuinely do not know the denominator, and a percentage of an unknown limit would
 * be a fabricated number, not a softer one.
 */
function UtilizationBadge({ u, className }: { u?: CardUtilization; className?: string }) {
  const t = useT();
  if (!u) return null;
  const color =
    u.level === 'high'
      ? 'var(--color-red)'
      : u.level === 'warn'
        ? 'var(--color-gold)'
        : 'var(--color-text-faint)';
  return (
    <span
      className={cn(
        'shrink-0 px-1.5 py-0.5 rounded text-[9px] tracking-wider normal-case',
        u.level === 'ok' ? 'bg-[color:var(--color-surface-2)]' : 'font-semibold',
        className
      )}
      style={{
        fontFamily: 'var(--font-mono)',
        color,
        background: u.level === 'ok' ? undefined : `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
      title={t('stm.utilTitle', {
        used: `${cur()}${u.outstanding.toFixed(2)}`,
        limit: `${cur()}${u.creditLimit}`,
      })}
    >
      {t('stm.utilPct', { pct: u.pct })}
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
        active
          ? 'bg-[color:var(--color-accent)] text-black'
          : 'bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] border border-[color:var(--color-border)] hover:text-[color:var(--color-text)]'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </button>
  );
}

// ─── Installment overview (active payoff plans) ────────────────────────────

function InstallmentOverview({
  plans,
  items,
  itemMap,
}: {
  plans: InstallmentPlan[];
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
}) {
  const t = useT();
  const active = plans.filter((p) => !p.done);
  const done = plans.filter((p) => p.done);
  const [showDone, setShowDone] = useState(false);
  // Products already tied to some plan — excluded from price suggestions.
  const linkedItemIds = useMemo(
    () => new Set(plans.flatMap((p) => p.itemIds)),
    [plans]
  );

  return (
    <div className="mb-5 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={14} className="text-[color:var(--color-purple)]" />
        <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('st.activePlans', { n: active.length })}
        </h2>
        {done.length > 0 && (
          <button
            onClick={() => setShowDone((v) => !v)}
            className="ml-auto text-[10px] text-[color:var(--color-cyan)] hover:underline"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {showDone ? t('st.hideCompleted', { n: done.length }) : t('st.showCompleted', { n: done.length })}
          </button>
        )}
      </div>

      {active.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start">
          {active.map((p) => (
            <PlanCardLinkable key={p.key} plan={p} items={items} itemMap={itemMap} linkedItemIds={linkedItemIds} allPlans={plans} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-[color:var(--color-text-faint)]">{t('st.noPlans')}</p>
      )}

      {showDone && done.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
          <h3 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('st.completed', { n: done.length })}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start">
            {done.map((p) => (
              <PlanCardLinkable key={p.key} plan={p} items={items} itemMap={itemMap} linkedItemIds={linkedItemIds} allPlans={plans} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A plan card in the overview, with a link/unlink control + price-based product
 *  suggestions (works for active AND completed plans). */
function PlanCardLinkable({
  plan,
  items,
  itemMap,
  linkedItemIds,
  allPlans,
  compact,
}: {
  plan: InstallmentPlan;
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
  linkedItemIds: Set<string>;
  allPlans: InstallmentPlan[];
  compact?: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const linkedItems = plan.itemIds.map((id) => ({ id, title: itemMap.get(id)?.title ?? t("stm.product") }));
  const planItemSet = useMemo(() => new Set(plan.itemIds), [plan.itemIds]);

  // Owned products, not already on ANY plan, whose price ≈ this plan's total (±15%).
  const suggestions = useMemo(() => {
    if (!(plan.totalAmount > 0)) return [];
    return items
      .filter((i) => (OWNED_STATUSES as readonly string[]).includes(i.status) && !linkedItemIds.has(i._id))
      .map((i) => ({ item: i, price: i.purchasedPrice ?? i.currentPrice }))
      .filter((x) => x.price > 0 && Math.abs(x.price - plan.totalAmount) / plan.totalAmount <= 0.15)
      .sort((a, b) => Math.abs(a.price - plan.totalAmount) - Math.abs(b.price - plan.totalAmount))
      .slice(0, 3);
  }, [plan, items, linkedItemIds]);

  const searchMatches = useMemo(() => {
    if (!picking) return [];
    const q = query.trim().toLowerCase();
    const owned = items.filter(
      (i) => (OWNED_STATUSES as readonly string[]).includes(i.status) && !planItemSet.has(i._id)
    );
    return (q ? owned.filter((i) => i.title.toLowerCase().includes(q)) : owned).slice(0, 8);
  }, [items, query, picking, planItemSet]);

  function addItem(itemId: string) {
    startTransition(async () => {
      await linkPlanToItem(plan.signature, itemId);
      setPicking(false);
      setQuery('');
    });
  }
  function removeItem(itemId: string) {
    startTransition(async () => {
      await removeItemFromPlanByKey(plan.signature, itemId);
    });
  }
  function clearAll() {
    startTransition(async () => {
      await unlinkPlanByKey(plan.signature);
    });
  }

  return (
    <div className={cn(compact && 'opacity-80')}>
      <InstallmentPlanCard plan={plan} itemTitles={linkedItems.map((x) => x.title)} compact={compact} />
      <div className="mt-1.5 px-1 space-y-1">
        {/* Linked products — one removable chip each. A single charge can cover several. */}
        {linkedItems.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {linkedItems.map((x) => (
              <span
                key={x.id}
                className="inline-flex items-center gap-1 text-[10px] text-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-1.5 py-0.5"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Package size={9} className="shrink-0" />
                <span className="truncate max-w-[120px]">{x.title}</span>
                <button onClick={() => removeItem(x.id)} disabled={pending} title={t('stm.removeProduct')} className="hover:text-[color:var(--color-red)] shrink-0">×</button>
              </span>
            ))}
          </div>
        )}

        {picking ? (
          <div className="bg-[color:var(--color-surface-3)] rounded-lg p-2 space-y-1">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('stm.searchInventory')} className={inputClass} />
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {searchMatches.map((i) => (
                <button
                  key={i._id}
                  onClick={() => addItem(i._id)}
                  disabled={pending}
                  className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-[color:var(--color-surface)] flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Package size={11} className="text-[color:var(--color-text-faint)] shrink-0" />
                  <span className="truncate">{i.title}</span>
                </button>
              ))}
              {searchMatches.length === 0 && <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">{t('stm.noMoreInventory')}</p>}
            </div>
            <button onClick={() => { setPicking(false); setQuery(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
              {t('stm.cancelLower')}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestions.map(({ item, price }) => (
              <button
                key={item._id}
                onClick={() => addItem(item._id)}
                disabled={pending}
                title={t('stm.priceMatch', { price: `${cur()}${price}`, total: `${cur()}${plan.totalAmount.toFixed(0)}` })}
                className="inline-flex items-center gap-1 text-[10px] text-[color:var(--color-cyan)] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-md px-1.5 py-0.5 hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] transition-colors max-w-[160px]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Package size={9} className="shrink-0" />
                <span className="truncate">{item.title}</span>
                <span className="text-[color:var(--color-text-faint)] shrink-0">{cur()}{price}</span>
              </button>
            ))}
            <button
              onClick={() => setPicking(true)}
              className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <Link2 size={10} className="inline" /> {linkedItems.length ? t('stm.addProduct') : suggestions.length ? t('stm.other') : t('stm.linkProduct')}
            </button>
            {linkedItems.length > 0 && (
              <button onClick={clearAll} disabled={pending} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('stm.clearAll')}
              </button>
            )}
          </div>
        )}
        <PlanMergeControl plan={plan} allPlans={allPlans} />
      </div>
    </div>
  );
}

/** Merge two installment plans the bank printed with different wording across
 *  statements ("QUEST ONLINE" vs "QUEST ONLINE KALLITHEA") into one payoff plan. */
function PlanMergeControl({ plan, allPlans }: { plan: InstallmentPlan; allPlans: InstallmentPlan[] }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const targets = useMemo(() => {
    const others = allPlans.filter((p) => p.key !== plan.key);
    const query = q.trim().toLowerCase();
    return (query ? others.filter((p) => p.label.toLowerCase().includes(query)) : others).slice(0, 8);
  }, [allPlans, plan.key, q]);

  function merge(targetKey: string) {
    startTransition(async () => {
      await bindInstallmentGroup(plan.key, targetKey);
      setOpen(false);
      setQ('');
    });
  }
  function unmerge() {
    startTransition(async () => {
      await unbindInstallmentGroup(plan.key);
    });
  }

  if (open) {
    return (
      <div className="bg-[color:var(--color-surface-3)] rounded-lg p-2 space-y-1">
        <p className="text-[10px] text-[color:var(--color-text-faint)] px-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('stm.mergeInto')}
        </p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('stm.searchPlans')} className={inputClass} />
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {targets.map((p) => (
            <button
              key={p.key}
              onClick={() => merge(p.key)}
              disabled={pending}
              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-[color:var(--color-surface)] flex items-center justify-between gap-2 disabled:opacity-50"
            >
              <span className="truncate">{p.label}</span>
              <span className="text-[color:var(--color-text-faint)] shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                {cur()}{p.perAmount.toFixed(0)} · {p.paidInstallments}/{p.totalInstallments}
              </span>
            </button>
          ))}
          {targets.length === 0 && <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">{t('stm.noOtherPlans')}</p>}
        </div>
        <button onClick={() => { setOpen(false); setQ(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
          {t('stm.cancelLower')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen(true)}
        disabled={pending || allPlans.length < 2}
        className="inline-flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-purple)] transition-colors disabled:opacity-40"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <GitMerge size={10} /> {t('stm.mergeIntoBtn')}
      </button>
      {plan.merged && (
        <button
          onClick={unmerge}
          disabled={pending}
          className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('stm.unmerge')}
        </button>
      )}
    </div>
  );
}

// ─── Statement Row (compact, opens full-screen detail) ─────────────────────

function StatementRow({
  statement,
  base,
  onOpen,
}: {
  statement: SerializedStatement;
  base: string;
  onOpen: () => void;
}) {
  const t = useT();
  const credit = statement.totalAmount < -0.001;
  const remaining = statement.totalAmount - statement.paidAmount;
  const installmentCount = statement.transactions.filter((tx) => tx.installmentInfo).length;

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 text-left bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl hover:border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-2)] transition-all"
    >
      <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
        {periodLabel(statement.period) || statement.period}
      </span>
      <div className="flex-1" />
      {/* P9: what the statement actually printed, when it is not in the base currency. */}
      <FxBadge doc={statement} base={base} />
      {installmentCount > 0 && (
        <span
          className="hidden sm:flex items-center gap-1 text-[10px] text-[color:var(--color-purple)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Layers size={11} /> {t('st.installments', { n: installmentCount })}
        </span>
      )}
      <div className="text-right">
        <div
          className={cn('text-sm font-bold', credit && 'text-[color:var(--color-accent)]')}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {credit ? '+' : ''}{cur()}{Math.abs(statement.totalAmount).toFixed(2)}
        </div>
        {credit ? (
          <div className="text-[10px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('st.credit')}
          </div>
        ) : (
          remaining > 0.001 && (
            <div className="text-[10px] text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
              -{cur()}{remaining.toFixed(2)}
            </div>
          )
        )}
      </div>
      <ChevronRight size={16} className="text-[color:var(--color-text-faint)] shrink-0" />
    </button>
  );
}

// ─── Statement Detail (full-screen) ────────────────────────────────────────

function StatementDetail({
  statement,
  cards,
  items,
  itemMap,
  fx,
  onClose,
}: {
  statement: SerializedStatement;
  cards: SerializedCard[];
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
  fx: FxCtx;
  onClose: () => void;
}) {
  const t = useT();
  const [showPdf, setShowPdf] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  // Local copy so a re-scan refreshes transactions in place; bumping `rev` re-mounts
  // the form + transaction list (they seed their own state from props) with the
  // fresh data. StatementDetail itself is keyed by _id at the call site.
  const [current, setCurrent] = useState(statement);
  const [rev, setRev] = useState(0);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const credit = current.totalAmount < -0.001;

  // Re-run the AI parse on the stored PDF. OCR mode rasterizes + OCRs every page —
  // the fix for statements whose text layer dropped the "ΔΟΣΗ x/y" installment
  // column (so installments were never detected). Manual edits + links are kept.
  function handleRescan(useOcr: boolean) {
    setRescanMsg(useOcr ? t('stm.rescanningOcr') : t('rc.rescanning'));
    startTransition(async () => {
      const r = await rescanStatement(current._id, useOcr);
      if (r.ok && r.statement) {
        setCurrent(r.statement);
        setRev((v) => v + 1);
        setRescanMsg(
          t('stm.rescanned', { tx: r.txCount ?? 0, inst: r.installmentsFound ?? 0 }) + (r.usedOcr ? ' (OCR)' : '')
        );
      } else {
        setRescanMsg(t('rc.rescanFailed', { err: r.aiError || r.error || 'no result' }));
      }
    });
  }

  async function handleDeleteStatement() {
    const ok = await confirm({
      title: t('stm.deleteStatement'),
      message: t('stm.confirmDeleteStatement', { title: statementTitle(current) }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) startTransition(async () => { await deleteStatement(current._id); onClose(); });
  }

  return (
    <div className="space-y-5">
      {/* Overpaid highlight */}
      {credit && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#00ff8814] text-[color:var(--color-accent)] border border-[#00ff8833]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('stm.creditBalance', { amount: `${cur()}${Math.abs(statement.totalAmount).toFixed(2)}` })}
        </div>
      )}

      {/* Editable statement fields — same form for reading and writing */}
      <StatementForm
        key={`form-${rev}`}
        cards={cards}
        fx={fx}
        statement={current}
        onSuccess={onClose}
        onDelete={handleDeleteStatement}
        deletePending={pending}
      />

      {/* Tools: PDF + AI categorize + re-scan */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {current.filePath && (
          <button onClick={() => setShowPdf((v) => !v)} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:underline">
            <FileText size={12} /> {showPdf ? t('stm.hidePdf') : t('stm.viewPdf')}
          </button>
        )}
        {current.transactions.length > 0 && (
          <button
            onClick={() => startTransition(async () => { const r = await categorizeStatement(current._id); if (!r.ok && r.error) alert(r.error); })}
            disabled={pending}
            className="flex items-center gap-1 text-[color:var(--color-purple)] hover:opacity-80 disabled:opacity-50"
          >
            <Sparkles size={12} /> {t('stm.aiCategorize')}
          </button>
        )}
        {current.filePath && (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1"><ScanLine size={12} /> {t('stm.rescanLabel')}</span>
            <button onClick={() => handleRescan(false)} disabled={pending} className="text-[color:var(--color-accent)] hover:opacity-80 disabled:opacity-50">{t('stm.text')}</button>
            <button onClick={() => handleRescan(true)} disabled={pending} title={t('stm.ocrTitle')} className="text-[color:var(--color-accent)] hover:opacity-80 disabled:opacity-50">{t('rc.ocr')}</button>
          </span>
        )}
        {rescanMsg && <span className="text-[color:var(--color-text-dim)] normal-case">{rescanMsg}</span>}
        <OpenInOneDriveButton filePath={current.filePath} />
      </div>

      {/* PDF preview */}
      {showPdf && current.filePath && (
        <div className="space-y-1.5">
          <iframe
            src={`${fileUrl(current.filePath)}#toolbar=0&navpanes=0`}
            className="w-full h-[520px] rounded-lg border border-[color:var(--color-border)] bg-white"
            title={statementTitle(current)}
          />
          <a href={fileUrl(current.filePath)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] text-[color:var(--color-cyan)] hover:underline" style={{ fontFamily: 'var(--font-mono)' }}>
            <FileText size={10} /> {t('stm.openNewTab')}
          </a>
        </div>
      )}

      {/* Transactions */}
      <TransactionList key={`tx-${rev}`} statement={current} items={items} itemMap={itemMap} />
    </div>
  );
}

// ─── Transactions ──────────────────────────────────────────────────────────

function TransactionList({
  statement,
  items,
  itemMap,
}: {
  statement: SerializedStatement;
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('stm.transactions', { n: statement.transactions.length })}
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-1 hover:opacity-80"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Plus size={11} /> {t('stm.add')}
        </button>
      </div>

      {adding && (
        <AddTransactionForm statementId={statement._id} onDone={() => setAdding(false)} />
      )}

      <div className="space-y-1">
        {statement.transactions.map((tx) => (
          <TransactionRow
            key={tx._id}
            tx={tx}
            statementId={statement._id}
            items={items}
            linkedItems={tx.matchedItemIds.map((id) => itemMap.get(id)).filter((x): x is ItemOption => !!x)}
            onDelete={() => startTransition(() => deleteTransaction(statement._id, tx._id))}
            pending={pending}
          />
        ))}
        {statement.transactions.length === 0 && !adding && (
          <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">{t('stm.noTransactions')}</p>
        )}
      </div>
    </div>
  );
}

/** Inline editor for a transaction's installment counter (x/y). Lets you add it
 *  manually when the statement didn't print it, so future statements can match. */
function InstallmentEditor({ tx, statementId }: { tx: SerializedTransaction; statementId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [cur, setCur] = useState('');
  const [tot, setTot] = useState('');

  function open() {
    setCur(tx.installmentInfo?.currentInstallment ? String(tx.installmentInfo.currentInstallment) : '');
    setTot(tx.installmentInfo?.totalInstallments ? String(tx.installmentInfo.totalInstallments) : '');
    setEditing(true);
  }
  function save() {
    startTransition(async () => {
      await setTransactionInstallment(statementId, tx._id, Number(cur) || 0, Number(tot) || 0);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          placeholder={t('stm.installmentNum')}
          inputMode="numeric"
          className="w-8 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <span className="text-[10px] text-[color:var(--color-text-faint)]">/</span>
        <input
          value={tot}
          onChange={(e) => setTot(e.target.value)}
          placeholder={t('stm.installmentOf')}
          inputMode="numeric"
          className="w-8 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <button onClick={save} disabled={pending} className="text-[10px] text-[color:var(--color-accent)] hover:opacity-80">
          {t('stm.save')}
        </button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
          ×
        </button>
      </span>
    );
  }
  if (tx.installmentInfo) {
    return (
      <button onClick={open} className="inline-flex items-center gap-1 text-[10px] text-[color:var(--color-purple)] hover:opacity-80" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('stm.installmentCounter', { cur: tx.installmentInfo.currentInstallment, tot: tx.installmentInfo.totalInstallments })}
        <Pencil size={8} />
      </button>
    );
  }
  return (
    <button
      onClick={open}
      className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] hover:underline transition-colors"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {t('stm.setInstallment')}
    </button>
  );
}

function TransactionRow({
  tx,
  statementId,
  items,
  linkedItems,
  onDelete,
  pending,
}: {
  tx: SerializedTransaction;
  statementId: string;
  items: ItemOption[];
  linkedItems?: ItemOption[];
  onDelete: () => void;
  pending: boolean;
}) {
  const locale = useLocale();
  const t = useT();
  const credit = tx.amount < 0;
  return (
    <div className="group bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatDate(tx.date, locale, { day: '2-digit', month: '2-digit' })}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-xs truncate block">{tx.description}</span>
          <span className="flex items-center gap-1.5 flex-wrap">
            <InstallmentEditor tx={tx} statementId={statementId} />
            {tx.category && tx.category !== 'uncategorized' && (
              <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {tx.category}
              </span>
            )}
            {credit && (
              <span className="text-[10px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('stm.paymentCredit')}
              </span>
            )}
          </span>
        </div>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums shrink-0',
            credit ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {credit ? '+' : ''}{cur()}{Math.abs(tx.amount).toFixed(2)}
        </span>
        <button
          onClick={onDelete}
          disabled={pending}
          className="shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-all"
        >
          <X size={12} />
        </button>
      </div>

      {/* Installment ↔ product link(s) */}
      {tx.installmentInfo && (
        <InstallmentLink tx={tx} statementId={statementId} items={items} linkedItems={linkedItems} />
      )}
    </div>
  );
}

function InstallmentLink({
  tx,
  statementId,
  items,
  linkedItems,
}: {
  tx: SerializedTransaction;
  statementId: string;
  items: ItemOption[];
  linkedItems?: ItemOption[];
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const linked = linkedItems ?? [];
  const linkedIds = useMemo(() => new Set(linked.map((i) => i._id)), [linked]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Only inventory (owned) products can carry an installment plan; hide already-linked.
    const owned = items.filter(
      (i) => (OWNED_STATUSES as readonly string[]).includes(i.status) && !linkedIds.has(i._id)
    );
    const list = q ? owned.filter((i) => i.title.toLowerCase().includes(q)) : owned;
    return list.slice(0, 8);
  }, [items, query, linkedIds]);

  function addItem(itemId: string) {
    startTransition(async () => {
      const r = await linkInstallmentToItem(statementId, tx._id, itemId);
      setPicking(false);
      setQuery('');
      if (r.ok) setMsg(t('stm.linkedCharges', { n: r.linked }));
    });
  }
  function clearAll() {
    startTransition(async () => {
      await unlinkInstallment(statementId, tx._id);
      setMsg(null);
    });
  }

  return (
    <div className="mt-1.5 ml-[42px] space-y-1">
      {/* Linked products — a single charge can cover several bought on one receipt. */}
      {linked.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {linked.map((i) => (
            <span
              key={i._id}
              className="inline-flex items-center gap-1 text-[10px] text-[color:var(--color-accent)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <Package size={11} className="shrink-0" />
              <span className="truncate max-w-[160px]">{i.title}</span>
            </span>
          ))}
          <button onClick={clearAll} disabled={pending} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('stm.unlinkAll')}
          </button>
        </div>
      )}

      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 text-[10px] text-[color:var(--color-cyan)] hover:opacity-80"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Link2 size={11} /> {msg || (linked.length ? t('stm.addProduct') : t('stm.linkToProduct'))}
        </button>
      ) : (
        <div className="bg-[color:var(--color-surface-3)] rounded-lg p-2 space-y-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('stm.searchProduct')}
            className={inputClass}
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {matches.map((i) => (
              <button
                key={i._id}
                onClick={() => addItem(i._id)}
                disabled={pending}
                className="w-full text-left text-[11px] px-2 py-1.5 rounded hover:bg-[color:var(--color-surface)] flex items-center gap-1.5 disabled:opacity-50"
              >
                <Package size={11} className="text-[color:var(--color-text-faint)] shrink-0" />
                <span className="truncate">{i.title}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">{t('stm.noProductsFound')}</p>
            )}
          </div>
          <button onClick={() => { setPicking(false); setQuery(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
            {t('stm.cancelLower')}
          </button>
        </div>
      )}
    </div>
  );
}

function AddTransactionForm({ statementId, onDone }: { statementId: string; onDone: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [installment, setInstallment] = useState(false);
  const [date, setDate] = useState(() => todayLocal());

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addTransaction(statementId, fd);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[color:var(--color-surface-2)] rounded-lg p-3 mb-2 space-y-2">
      <div className="flex gap-2">
        <div className="w-32 shrink-0">
          <DateInput name="date" required value={date} onValueChange={setDate} className={cn(inputClass, 'pr-8')} />
        </div>
        <input name="description" placeholder={t('stm.description')} required className={cn(inputClass, 'flex-1')} />
        <input name="amount" type="number" step="0.01" placeholder={cur()} required className={cn(inputClass, 'w-20 text-right')} />
      </div>
      <div className="flex items-center gap-2">
        <input name="category" placeholder={t('stm.category')} className={cn(inputClass, 'flex-1')} />
        <label className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-dim)] cursor-pointer" style={{ fontFamily: 'var(--font-mono)' }}>
          <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} className="accent-[color:var(--color-purple)]" />
          {t('stm.installment')}
        </label>
      </div>
      {installment && (
        <div className="flex gap-2 items-center">
          <input name="currentInstallment" type="number" min="1" placeholder={t('stm.current')} className={cn(inputClass, 'w-24')} />
          <span className="text-[color:var(--color-text-faint)] text-xs">/</span>
          <input name="totalInstallments" type="number" min="1" placeholder={t('stm.total')} className={cn(inputClass, 'w-24')} />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? '...' : t('stm.addBtn')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

// ─── Statement Form ────────────────────────────────────────────────────────

function cardLabel(c: SerializedCard) {
  return buildCardLabel(c.name, c.last4);
}

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

function StatementForm({
  cards,
  statement,
  fx,
  onSuccess,
  onDelete,
  deletePending,
}: {
  cards: SerializedCard[];
  statement?: SerializedStatement;
  fx: FxCtx;
  onSuccess: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  // P9: the form always holds PRINTED figures (what the statement says), never the stored
  // base-currency ones. The server converts on save, so re-saving an unchanged foreign
  // statement can never double-convert it.
  const wasForeign = isForeignCurrency(statement?.currency, fx.base);
  const storedRate = wasForeign ? statement?.fxRate || 0 : 0;
  const printed = (v: number | undefined) => (v == null ? '' : String(toPrinted(v, storedRate)));
  const [form, setForm] = useState({
    card: statement?.card ?? (cards[0] ? cardLabel(cards[0]) : ''),
    cardId: statement ? (cards.some((c) => c._id === statement.cardId) ? statement.cardId! : '') : cards[0]?._id ?? '',
    period: statement?.period ?? todayLocal().slice(0, 7),
    statementDate: statement?.statementDate ? statement.statementDate.slice(0, 10) : todayLocal(),
    dueDate: statement?.dueDate ? statement.dueDate.slice(0, 10) : '',
    // The headline total keeps its exact printed value in origAmount; the rest is backed out.
    totalAmount: ((wasForeign ? statement?.origAmount || statement?.totalAmount : statement?.totalAmount) ?? '').toString(),
    minimumPayment: statement ? printed(statement.minimumPayment) : '',
    paidAmount: statement ? printed(statement.paidAmount) : '',
    currency: wasForeign ? normalizeCurrency(statement?.currency) : normalizeCurrency(fx.base) || 'EUR',
    fxRate: wasForeign && statement?.fxRate ? String(statement.fxRate) : '',
    notes: statement?.notes ?? '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const foreign = fx.enabled && isForeignCurrency(form.currency, fx.base);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      if (statement) await updateStatement(statement._id, fd);
      else await createStatement(fd);
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label={t('stm.cardReq')}>
        {cards.length > 0 ? (
          <select value={form.cardId || form.card} onChange={(e) => {
            const card = cards.find((c) => c._id === e.target.value);
            setForm((p) => ({ ...p, cardId: card?._id ?? '', card: card ? cardLabel(card) : e.target.value }));
          }} className={selectClass} required>
            <option value="">{t('stm.selectCard')}</option>
            {cards.map((c) => (
              <option key={c._id} value={c._id}>
                {cardLabel(c)}
              </option>
            ))}
            {form.card && !form.cardId && (
              <option value={form.card}>{form.card}</option>
            )}
          </select>
        ) : (
          <Input value={form.card} onChange={set('card')} required placeholder={t('stm.cardPlaceholder')} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stm.periodReq')}>
          <Input value={form.period} onChange={set('period')} required placeholder="2026-06" />
        </Field>
        <Field label={t('stm.statementDate')}>
          <Input type="date" value={form.statementDate} onChange={set('statementDate')} />
        </Field>
      </div>
      <div className={cn('grid grid-cols-2 gap-3', fx.enabled && 'sm:grid-cols-3')}>
        <Field label={t('stm.paymentDue')}>
          <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
        </Field>
        <Field label={t('stm.totalAmount', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" value={form.totalAmount} onChange={set('totalAmount')} required />
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
      </div>
      {foreign && <StatementFxFields form={form} setRate={(v) => setForm((p) => ({ ...p, fxRate: v }))} base={fx.base} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stm.minPayment', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" value={form.minimumPayment} onChange={set('minimumPayment')} />
        </Field>
        <Field label={t('stm.paid', { cur: fx.enabled ? currencySymbol(form.currency).trim() : cur() })}>
          <Input type="number" step="0.01" value={form.paidAmount} onChange={set('paidAmount')} />
        </Field>
      </div>
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
          {pending ? t('common.saving') : statement ? t('common.save') : t('stm.create')}
        </Button>
        {onDelete && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={onDelete} disabled={deletePending}>
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Multi-currency (P9): shown only when the statement's currency differs from the base one.
 *  Two ways in, because someone reading the bank's own conversion knows what was debited but
 *  not the rate: type the rate, or type the amount actually charged and let deriveFxRate()
 *  back it out. The preview is the total that will be stored — and, with it, every charge on
 *  the statement, since one rate converts the whole document. */
function StatementFxFields({
  form,
  setRate,
  base,
}: {
  form: { totalAmount: string; currency: string; fxRate: string; statementDate: string };
  /** Only the rate is editable here, so the parent's full form type stays out of this component. */
  setRate: (v: string) => void;
  base: string;
}) {
  const t = useT();
  const [charged, setCharged] = useState('');
  const printedTotal = Number(form.totalAmount) || 0;
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
        {/* P9 phase 2: the fixing on the statement's own date — one rate for the whole document. */}
        <div className="mt-1">
          <FxRateButton currency={code} date={form.statementDate} onRate={(r) => { setCharged(''); setRate(String(r)); }} />
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
            const derived = deriveFxRate(printedTotal, Number(v) || 0);
            setRate(derived ? String(derived) : '');
          }}
        />
      </Field>
      <p className="text-[11px] pb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {rate > 0 ? (
          <span className="text-[color:var(--color-purple)]">= {formatMoney(convertToBase(printedTotal, rate), base)}</span>
        ) : (
          <span className="text-[color:var(--color-gold)]">⚠ {t('ex.fxNoRate', { base })}</span>
        )}
      </p>
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

// ─── Cards Manager ─────────────────────────────────────────────────────────

const CARD_TYPES = [
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'visa', label: 'Visa' },
  { value: 'amex', label: 'Amex' },
  { value: 'maestro', label: 'Maestro' },
  { value: 'other', label: 'Other' },
];

function CardsManager({
  cards,
  statements,
  utilization,
}: {
  cards: SerializedCard[];
  statements: SerializedStatement[];
  utilization: CardUtilizationIndex;
}) {
  const t = useT();
  const [editing, setEditing] = useState<SerializedCard | null>(null);
  const [adding, setAdding] = useState(false);

  // Total charged per card (matched by "name last4" label)
  const spendByCard = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const s of statements) {
      const cur = m.get(s.card) ?? { total: 0, count: 0 };
      m.set(s.card, { total: cur.total + s.totalAmount, count: cur.count + 1 });
    }
    return m;
  }, [statements]);

  if (adding || editing) {
    return (
      <CardForm
        card={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {cards.length === 0 && (
        <p className="text-sm text-[color:var(--color-text-faint)] text-center py-4">
          {t('stm.noCardsHint')}
        </p>
      )}
      {cards.map((c) => {
        const label = cardLabel(c);
        const spend = spendByCard.get(label);
        return (
          <div
            key={c._id}
            className={cn(
              'flex items-center gap-3 bg-[color:var(--color-surface-2)] rounded-xl px-4 py-3 border-l-[3px] transition-opacity',
              !c.active && 'opacity-45'
            )}
            style={{ borderColor: c.color }}
          >
            <CreditCardIcon size={18} style={{ color: c.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                {c.name} {c.last4 && <span className="text-[color:var(--color-text-faint)]">···{c.last4}</span>}
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color:var(--color-surface-3)] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {c.kind}
                </span>
                <UtilizationBadge u={utilization.byCardId.get(c._id)} />
              </div>
              <div className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {c.bank || c.type}
                {spend && ` · ${t('stm.charged', { amount: `${cur()}${spend.total.toFixed(2)}`, count: spend.count })}`}
                {c.creditLimit > 0 && ` · ${t('stm.limit', { amount: `${cur()}${c.creditLimit}` })}`}
              </div>
            </div>
            <button
              onClick={() => toggleCardActive(c._id, !c.active)}
              title={c.active ? t('stm.deactivate') : t('stm.activate')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                c.active ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Power size={13} />
            </button>
            <button
              onClick={() => setEditing(c)}
              className="p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-3)]"
            >
              <Pencil size={13} />
            </button>
          </div>
        );
      })}
      <Button variant="secondary" size="sm" onClick={() => setAdding(true)} className="w-full justify-center mt-2">
        <Plus size={14} /> {t('stm.newCard')}
      </Button>
    </div>
  );
}

function CardForm({ card, onDone }: { card?: SerializedCard; onDone: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: card?.name ?? '',
    last4: card?.last4 ?? '',
    bank: card?.bank ?? '',
    kind: card?.kind ?? 'credit',
    type: card?.type ?? 'mastercard',
    color: card?.color ?? '#00d4ff',
    creditLimit: (card?.creditLimit ?? '').toString(),
    notes: card?.notes ?? '',
  });
  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));
  const confirm = useConfirm();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [scanPending, startScan] = useTransition();
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  function handleScan(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setScanMsg(null);
    startScan(async () => {
      const processed = await shrinkImage(file);
      const fd = new FormData();
      fd.set('file', processed);
      const r = await scanCard(fd);
      if (!r.ok) {
        setScanMsg(r.error);
        return;
      }
      const d = r.data;
      setForm((p) => ({
        ...p,
        name: d.name || p.name,
        last4: d.last4 || p.last4,
        bank: d.bank || p.bank,
        type: d.type || p.type,
        kind: d.kind || p.kind,
      }));
      setScanMsg(t('stm.scanned'));
      if (cameraRef.current) cameraRef.current.value = '';
    });
  }

  async function handleDeleteCard() {
    if (!card) return;
    const ok = await confirm({
      title: t('set.deleteCard'),
      message: t('set.confirmDeleteName', { name: form.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok)
      startTransition(async () => {
        await deleteCard(card._id);
        onDone();
      });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      if (card) await updateCard(card._id, fd);
      else await createCard(fd);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Scan card with camera (AI OCR) */}
      <div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleScan(e.target.files)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => cameraRef.current?.click()}
          disabled={scanPending}
          className="w-full justify-center"
        >
          {scanPending ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {scanPending ? t('stm.scanning') : t('stm.scanCard')}
        </Button>
        {scanMsg && (
          <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
            {scanMsg}
          </p>
        )}
      </div>

      <Field label={t('stm.cardNameField')}>
        <Input value={form.name} onChange={set('name')} required placeholder={t('stm.cardNameEg')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stm.last4Digits')}>
          <Input value={form.last4} onChange={set('last4')} maxLength={4} placeholder="1234" style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <Field label={t('stm.bank')}>
          <Input value={form.bank} onChange={set('bank')} placeholder={t('stm.bankEg')} />
        </Field>
      </div>
      <Field label={t('stm.kind')}>
        <div className="flex gap-1.5">
          {(['credit', 'debit'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setForm((p) => ({ ...p, kind: k }))}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                form.kind === k
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              {k === 'credit' ? t('set.credit') : t('set.debit')}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stm.type')}>
          <select value={form.type} onChange={set('type')} className={selectClass}>
            {CARD_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t('stm.limitField', { cur: cur() })}>
          <Input type="number" value={form.creditLimit} onChange={set('creditLimit')} placeholder="3000" />
        </Field>
      </div>
      <Field label={t('stm.color')}>
        <input type="color" value={form.color} onChange={set('color')} className="w-full h-9 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg cursor-pointer" />
      </Field>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? '...' : card ? t('stm.update') : t('stm.create')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>{t('stm.back')}</Button>
        {card && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="ml-auto"
            onClick={handleDeleteCard}
            disabled={pending}
          >
            <Trash2 size={13} /> {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
