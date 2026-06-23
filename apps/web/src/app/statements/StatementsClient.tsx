'use client';
import { cur } from "@/lib/money";
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
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import type { SerializedStatement, SerializedTransaction, SerializedCard } from '@/types';
import { periodLabel } from '@/lib/cards';
import { computeInstallmentPlans, type InstallmentPlan } from '@/lib/installments';
import { InstallmentPlanCard } from '@/components/InstallmentPlanCard';
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
import { useT } from '@/components/LocaleProvider';

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

/** Display title for a statement: "Ιούνιος 2026 · ···1234". */
function statementTitle(s: SerializedStatement): string {
  const month = periodLabel(s.period) || s.period;
  const tail = s.last4 ? ` · ···${s.last4}` : '';
  return `${month}${tail}`;
}

// ─── Main component ────────────────────────────────────────────────────────

export function StatementsClient({
  statements,
  cards,
  items,
  ollamaUp,
}: {
  statements: SerializedStatement[];
  cards: SerializedCard[];
  items: ItemOption[];
  ollamaUp: boolean;
}) {
  const t = useT();
  const [showCreate, setShowCreate] = useState(false);
  const [showCards, setShowCards] = useState(false);
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

  const visible = useMemo(
    () => (cardFilter === 'all' ? statements : statements.filter((s) => s.card === cardFilter)),
    [statements, cardFilter]
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
          <div className="flex items-center gap-3">
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
          <FilterChip active={cardFilter === 'all'} onClick={() => setCardFilter('all')}>
            {t('st.allCards')}
          </FilterChip>
          {cardLabels.map((c) => (
            <FilterChip key={c} active={cardFilter === c} onClick={() => setCardFilter(c)}>
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
                className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.2em] mb-3"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {card}
              </h2>
              <div className="space-y-2">
                {list.map((s) => (
                  <StatementRow key={s._id} statement={s} onOpen={() => setActiveId(s._id)} />
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
            onClose={() => setActiveId(null)}
          />
        </Modal>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Statement" size="md">
        <StatementForm cards={cards} onSuccess={() => setShowCreate(false)} />
      </Modal>

      <Modal open={showCards} onClose={() => setShowCards(false)} title="Manage Cards" size="xl">
        <CardsManager cards={cards} statements={statements} />
      </Modal>
    </main>
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
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const linkedItems = plan.itemIds.map((id) => ({ id, title: itemMap.get(id)?.title ?? 'product' }));
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
                <button onClick={() => removeItem(x.id)} disabled={pending} title="Remove this product" className="hover:text-[color:var(--color-red)] shrink-0">×</button>
              </span>
            ))}
          </div>
        )}

        {picking ? (
          <div className="bg-[color:var(--color-surface-3)] rounded-lg p-2 space-y-1">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search inventory…" className={inputClass} />
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
              {searchMatches.length === 0 && <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">No more inventory products</p>}
            </div>
            <button onClick={() => { setPicking(false); setQuery(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
              cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestions.map(({ item, price }) => (
              <button
                key={item._id}
                onClick={() => addItem(item._id)}
                disabled={pending}
                title={`Price match: ${cur()}${price} ≈ ${cur()}${plan.totalAmount.toFixed(0)} plan total`}
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
              <Link2 size={10} className="inline" /> {linkedItems.length ? 'add product' : suggestions.length ? 'other…' : 'link product'}
            </button>
            {linkedItems.length > 0 && (
              <button onClick={clearAll} disabled={pending} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
                clear all
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
          Merge this plan into…
        </p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans…" className={inputClass} />
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
          {targets.length === 0 && <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">No other plans</p>}
        </div>
        <button onClick={() => { setOpen(false); setQ(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
          cancel
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
        <GitMerge size={10} /> merge into…
      </button>
      {plan.merged && (
        <button
          onClick={unmerge}
          disabled={pending}
          className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          unmerge
        </button>
      )}
    </div>
  );
}

// ─── Statement Row (compact, opens full-screen detail) ─────────────────────

function StatementRow({
  statement,
  onOpen,
}: {
  statement: SerializedStatement;
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
  onClose,
}: {
  statement: SerializedStatement;
  cards: SerializedCard[];
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
  onClose: () => void;
}) {
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
    setRescanMsg(useOcr ? 'Re-scanning with OCR (all pages)…' : 'Re-scanning…');
    startTransition(async () => {
      const r = await rescanStatement(current._id, useOcr);
      if (r.ok && r.statement) {
        setCurrent(r.statement);
        setRev((v) => v + 1);
        setRescanMsg(
          `Re-scanned ✓ — ${r.txCount ?? 0} txns · ${r.installmentsFound ?? 0} installments${r.usedOcr ? ' (OCR)' : ''}`
        );
      } else {
        setRescanMsg(`Failed: ${r.aiError || r.error || 'no result'}`);
      }
    });
  }

  async function handleDeleteStatement() {
    const ok = await confirm({
      title: 'Delete statement',
      message: `Delete ${statementTitle(current)}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) startTransition(async () => { await deleteStatement(current._id); onClose(); });
  }

  return (
    <div className="space-y-5">
      {/* Overpaid highlight */}
      {credit && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[#00ff8814] text-[color:var(--color-accent)] border border-[#00ff8833]" style={{ fontFamily: 'var(--font-mono)' }}>
          credit balance — you overpaid by {cur()}{Math.abs(statement.totalAmount).toFixed(2)}
        </div>
      )}

      {/* Editable statement fields — same form for reading and writing */}
      <StatementForm
        key={`form-${rev}`}
        cards={cards}
        statement={current}
        onSuccess={onClose}
        onDelete={handleDeleteStatement}
        deletePending={pending}
      />

      {/* Tools: PDF + AI categorize + re-scan */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {current.filePath && (
          <button onClick={() => setShowPdf((v) => !v)} className="flex items-center gap-1 text-[color:var(--color-cyan)] hover:underline">
            <FileText size={12} /> {showPdf ? 'hide PDF' : 'view PDF'}
          </button>
        )}
        {current.transactions.length > 0 && (
          <button
            onClick={() => startTransition(async () => { const r = await categorizeStatement(current._id); if (!r.ok && r.error) alert(r.error); })}
            disabled={pending}
            className="flex items-center gap-1 text-[color:var(--color-purple)] hover:opacity-80 disabled:opacity-50"
          >
            <Sparkles size={12} /> AI categorize
          </button>
        )}
        {current.filePath && (
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1"><ScanLine size={12} /> re-scan:</span>
            <button onClick={() => handleRescan(false)} disabled={pending} className="text-[color:var(--color-accent)] hover:opacity-80 disabled:opacity-50">text</button>
            <button onClick={() => handleRescan(true)} disabled={pending} title="rasterize + OCR every page (finds installments the text layer dropped)" className="text-[color:var(--color-accent)] hover:opacity-80 disabled:opacity-50">OCR</button>
          </span>
        )}
        {rescanMsg && <span className="text-[color:var(--color-text-dim)] normal-case">{rescanMsg}</span>}
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
            <FileText size={10} /> open in new tab
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
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Transactions ({statement.transactions.length})
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[10px] text-[color:var(--color-accent)] flex items-center gap-1 hover:opacity-80"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Plus size={11} /> add
        </button>
      </div>

      {adding && (
        <AddTransactionForm statementId={statement._id} onDone={() => setAdding(false)} />
      )}

      <div className="space-y-1">
        {statement.transactions.map((t) => (
          <TransactionRow
            key={t._id}
            tx={t}
            statementId={statement._id}
            items={items}
            linkedItems={t.matchedItemIds.map((id) => itemMap.get(id)).filter((x): x is ItemOption => !!x)}
            onDelete={() => startTransition(() => deleteTransaction(statement._id, t._id))}
            pending={pending}
          />
        ))}
        {statement.transactions.length === 0 && !adding && (
          <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">No transactions</p>
        )}
      </div>
    </div>
  );
}

/** Inline editor for a transaction's installment counter (x/y). Lets you add it
 *  manually when the statement didn't print it, so future statements can match. */
function InstallmentEditor({ tx, statementId }: { tx: SerializedTransaction; statementId: string }) {
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
          placeholder="#"
          inputMode="numeric"
          className="w-8 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <span className="text-[10px] text-[color:var(--color-text-faint)]">/</span>
        <input
          value={tot}
          onChange={(e) => setTot(e.target.value)}
          placeholder="of"
          inputMode="numeric"
          className="w-8 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:border-[color:var(--color-accent)]"
        />
        <button onClick={save} disabled={pending} className="text-[10px] text-[color:var(--color-accent)] hover:opacity-80">
          save
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
        installment {tx.installmentInfo.currentInstallment}/{tx.installmentInfo.totalInstallments}
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
      + set installment
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
  const credit = tx.amount < 0;
  return (
    <div className="group bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
          {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
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
                payment / credit
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
          className="shrink-0 opacity-0 group-hover:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-all"
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
      if (r.ok) setMsg(`linked · ${r.linked} charge${r.linked === 1 ? '' : 's'} matched`);
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
            unlink all
          </button>
        </div>
      )}

      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 text-[10px] text-[color:var(--color-cyan)] hover:opacity-80"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <Link2 size={11} /> {msg || (linked.length ? 'add product' : 'link to product')}
        </button>
      ) : (
        <div className="bg-[color:var(--color-surface-3)] rounded-lg p-2 space-y-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product…"
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
              <p className="text-[10px] text-[color:var(--color-text-faint)] italic px-2 py-1">No products found</p>
            )}
          </div>
          <button onClick={() => { setPicking(false); setQuery(''); }} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] px-1">
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

function AddTransactionForm({ statementId, onDone }: { statementId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [installment, setInstallment] = useState(false);

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
        <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={cn(inputClass, 'w-32')} />
        <input name="description" placeholder="Description" required className={cn(inputClass, 'flex-1')} />
        <input name="amount" type="number" step="0.01" placeholder={cur()} required className={cn(inputClass, 'w-20 text-right')} />
      </div>
      <div className="flex items-center gap-2">
        <input name="category" placeholder="Category" className={cn(inputClass, 'flex-1')} />
        <label className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-dim)] cursor-pointer" style={{ fontFamily: 'var(--font-mono)' }}>
          <input type="checkbox" checked={installment} onChange={(e) => setInstallment(e.target.checked)} className="accent-[color:var(--color-purple)]" />
          installment
        </label>
      </div>
      {installment && (
        <div className="flex gap-2 items-center">
          <input name="currentInstallment" type="number" min="1" placeholder="current" className={cn(inputClass, 'w-24')} />
          <span className="text-[color:var(--color-text-faint)] text-xs">/</span>
          <input name="totalInstallments" type="number" min="1" placeholder="total" className={cn(inputClass, 'w-24')} />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? '...' : 'Add'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Statement Form ────────────────────────────────────────────────────────

function cardLabel(c: SerializedCard) {
  return `${c.name}${c.last4 ? ' ' + c.last4 : ''}`;
}

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

function StatementForm({
  cards,
  statement,
  onSuccess,
  onDelete,
  deletePending,
}: {
  cards: SerializedCard[];
  statement?: SerializedStatement;
  onSuccess: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    card: statement?.card ?? (cards[0] ? cardLabel(cards[0]) : ''),
    period: statement?.period ?? new Date().toISOString().slice(0, 7),
    statementDate: statement?.statementDate ? statement.statementDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    dueDate: statement?.dueDate ? statement.dueDate.slice(0, 10) : '',
    totalAmount: (statement?.totalAmount ?? '').toString(),
    minimumPayment: (statement?.minimumPayment ?? '').toString(),
    paidAmount: (statement?.paidAmount ?? '').toString(),
    notes: statement?.notes ?? '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

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
      <Field label="Card *">
        {cards.length > 0 ? (
          <select value={form.card} onChange={set('card')} className={selectClass} required>
            <option value="">— select card —</option>
            {cards.map((c) => (
              <option key={c._id} value={cardLabel(c)}>
                {cardLabel(c)}
              </option>
            ))}
            {form.card && !cards.some((c) => cardLabel(c) === form.card) && (
              <option value={form.card}>{form.card}</option>
            )}
          </select>
        ) : (
          <Input value={form.card} onChange={set('card')} required placeholder="e.g. Visa Gold 1234" />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Period (YYYY-MM) *">
          <Input value={form.period} onChange={set('period')} required placeholder="2026-06" />
        </Field>
        <Field label="Statement date">
          <Input type="date" value={form.statementDate} onChange={set('statementDate')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment due">
          <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
        </Field>
        <Field label={`Total amount (${cur()}) *`}>
          <Input type="number" step="0.01" value={form.totalAmount} onChange={set('totalAmount')} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Minimum payment (${cur()})`}>
          <Input type="number" step="0.01" value={form.minimumPayment} onChange={set('minimumPayment')} />
        </Field>
        <Field label={`Paid (${cur()})`}>
          <Input type="number" step="0.01" value={form.paidAmount} onChange={set('paidAmount')} />
        </Field>
      </div>
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
          {pending ? 'Saving...' : statement ? 'Save' : 'Create'}
        </Button>
        {onDelete && (
          <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={onDelete} disabled={deletePending}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
      </div>
    </form>
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
}: {
  cards: SerializedCard[];
  statements: SerializedStatement[];
}) {
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
          You haven't added any cards. Add one so it shows up in the dropdown.
        </p>
      )}
      {cards.map((c) => {
        const label = `${c.name}${c.last4 ? ' ' + c.last4 : ''}`;
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
              </div>
              <div className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {c.bank || c.type}
                {spend && ` · charged ${cur()}${spend.total.toFixed(2)} (${spend.count})`}
                {c.creditLimit > 0 && ` · limit ${cur()}${c.creditLimit}`}
              </div>
            </div>
            <button
              onClick={() => toggleCardActive(c._id, !c.active)}
              title={c.active ? 'Deactivate' : 'Activate'}
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
        <Plus size={14} /> New card
      </Button>
    </div>
  );
}

function CardForm({ card, onDone }: { card?: SerializedCard; onDone: () => void }) {
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
      setScanMsg('✓ Scanned — check the details');
      if (cameraRef.current) cameraRef.current.value = '';
    });
  }

  async function handleDeleteCard() {
    if (!card) return;
    const ok = await confirm({
      title: 'Delete card',
      message: `Delete card "${form.name}"?`,
      confirmLabel: 'Delete',
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
          {scanPending ? 'Scanning…' : 'Scan card with camera'}
        </Button>
        {scanMsg && (
          <p className="text-[10px] text-[color:var(--color-accent)] mt-1.5 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
            {scanMsg}
          </p>
        )}
      </div>

      <Field label="Card name *">
        <Input value={form.name} onChange={set('name')} required placeholder="e.g. Visa Gold" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last 4 digits">
          <Input value={form.last4} onChange={set('last4')} maxLength={4} placeholder="1234" style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <Field label="Bank">
          <Input value={form.bank} onChange={set('bank')} placeholder="e.g. National Bank" />
        </Field>
      </div>
      <Field label="Kind">
        <div className="flex gap-1.5">
          {(['credit', 'debit'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setForm((p) => ({ ...p, kind: k }))}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                form.kind === k
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select value={form.type} onChange={set('type')} className={selectClass}>
            {CARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label={`Limit (${cur()})`}>
          <Input type="number" value={form.creditLimit} onChange={set('creditLimit')} placeholder="3000" />
        </Field>
      </div>
      <Field label="Color">
        <input type="color" value={form.color} onChange={set('color')} className="w-full h-9 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg cursor-pointer" />
      </Field>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? '...' : card ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Back</Button>
        {card && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="ml-auto"
            onClick={handleDeleteCard}
            disabled={pending}
          >
            <Trash2 size={13} /> Delete
          </Button>
        )}
      </div>
    </form>
  );
}
