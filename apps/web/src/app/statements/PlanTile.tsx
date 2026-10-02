'use client';
// An installment plan on the Statements page, and what it paid for: product photos, a progress
// ring, one bar per installment, a "Is it this?" match when no product is linked yet, and a
// picker that ranks your products by how well they fit (price, purchase month, shop) or makes
// a new one from the purchase.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Package, Plus, X, Check, Search, Sparkles, GitMerge, Unlink, PackagePlus, Link2, Loader2 } from 'lucide-react';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MenuButton } from '@/components/ui/MenuButton';
import { Input, controlClass } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { formatDate } from '@/lib/i18n/format';
import { OWNED_STATUSES } from '@/lib/itemStatus';
import { planItemMatch, shortMonth, type InstallmentPlan } from '@/lib/installments';
import { setPlanItems, createItemFromPlan, bindInstallmentGroup, unbindInstallmentGroup } from './actions';
import type { ItemOption } from './StatementsClient';

const fileUrl = (p: string) => `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;

/** "PLAISIO COMPUTERS" → "Plaisio Computers" for a product title. */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).trim();

function Photo({ item, size = 40, className }: { item?: ItemOption; size?: number; className?: string }) {
  const src = item?.photos?.[0];
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-3)]', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(src)} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Package size={Math.round(size * 0.45)} className="text-[color:var(--color-text-faint)]" />
      )}
    </span>
  );
}

function Ring({ plan }: { plan: InstallmentPlan }) {
  const pct = plan.totalInstallments > 0 ? plan.paidInstallments / plan.totalInstallments : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = plan.done ? 'var(--color-accent)' : 'var(--color-purple)';
  return (
    <span className="relative grid h-[54px] w-[54px] shrink-0 place-items-center">
      <svg viewBox="0 0 54 54" className="absolute inset-0 -rotate-90">
        <circle cx="27" cy="27" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="5" />
        <circle cx="27" cy="27" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
        {plan.done ? <Check size={16} /> : `${plan.paidInstallments}/${plan.totalInstallments}`}
      </span>
    </span>
  );
}

const matchTone = (n: number) => (n >= 80 ? 'var(--color-accent)' : n >= 50 ? 'var(--color-gold)' : 'var(--color-text-faint)');

export function PlanTile({
  plan,
  items,
  itemMap,
  allPlans,
  linkedElsewhere,
}: {
  plan: InstallmentPlan;
  items: ItemOption[];
  itemMap: Map<string, ItemOption>;
  allPlans: InstallmentPlan[];
  /** Items already on some other plan: still pickable, marked. */
  linkedElsewhere: Set<string>;
}) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [picker, setPicker] = useState<null | 'pick' | 'create'>(null);
  const [merging, setMerging] = useState(false);
  const [skipHint, setSkipHint] = useState(false);

  const linked = plan.itemIds.map((id) => itemMap.get(id)).filter((x): x is ItemOption => !!x);
  const owned = useMemo(() => items.filter((i) => (OWNED_STATUSES as readonly string[]).includes(i.status)), [items]);
  const best = useMemo(() => {
    if (linked.length) return null;
    let top: { item: ItemOption; score: number } | null = null;
    for (const i of owned) {
      if (linkedElsewhere.has(i._id)) continue;
      const score = planItemMatch(plan, i);
      if (!top || score > top.score) top = { item: i, score };
    }
    return top && top.score >= 60 ? top : null;
  }, [linked.length, owned, plan, linkedElsewhere]);

  const title = linked.length ? linked.map((i) => i.title).join(' + ') : titleCase(plan.label);
  const set = (ids: string[]) => startTransition(async () => void (await setPlanItems(plan.key, ids)));

  async function removeAll() {
    if (!(await confirm({ title: t('pl.removeAll'), message: t('payments.confirmUnlink'), confirmLabel: t('common.delete'), danger: true }))) return;
    set([]);
  }
  async function unmerge() {
    if (!(await confirm({ title: t('stm.unmerge'), message: t('payments.confirmMerge'), confirmLabel: t('stm.unmerge') }))) return;
    startTransition(async () => void (await unbindInstallmentGroup(plan.key)));
  }

  return (
    <div className={cn('min-w-0 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 transition-colors hover:border-[color:var(--color-border-light)]', plan.done && 'opacity-80')}>
      <div className="flex items-start gap-3">
        {/* What it paid for: product photos, or a slot to link one */}
        {linked.length ? (
          <button type="button" onClick={() => setPicker('pick')} className="flex shrink-0 -space-x-3" aria-label={t('pl.change')}>
            {linked.slice(0, 3).map((i) => (
              <Photo key={i._id} item={i} size={44} className="ring-2 ring-[color:var(--color-surface)]" />
            ))}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPicker('pick')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-dashed border-[color:var(--color-border-light)] text-[color:var(--color-text-faint)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
            aria-label={t('pl.link')}
            title={t('pl.link')}
          >
            <Plus size={18} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-[color:var(--color-text-faint)]">
            {linked.length ? `${titleCase(plan.label)} · ` : ''}
            {plan.card}
          </p>
        </div>

        <Ring plan={plan} />
        <MenuButton
          align="right"
          label={t('common.more')}
          items={[
            { label: t('pl.link'), icon: <Link2 size={14} />, onClick: () => setPicker('pick') },
            { label: t('pl.create'), hint: t('pl.createHint'), icon: <PackagePlus size={14} />, onClick: () => setPicker('create') },
            ...(allPlans.length > 1 ? [{ label: t('pl.merge'), icon: <GitMerge size={14} />, onClick: () => setMerging(true) }] : []),
            ...(plan.merged ? [{ label: t('stm.unmerge'), icon: <GitMerge size={14} />, onClick: unmerge }] : []),
            ...(linked.length ? [{ label: t('pl.removeAll'), icon: <Unlink size={14} />, onClick: removeAll }] : []),
          ]}
        />
      </div>

      {/* One bar per installment: paid, then still to come */}
      <div className="mt-3 flex gap-[3px]" aria-hidden>
        {Array.from({ length: Math.min(plan.totalInstallments, 48) }, (_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i < plan.paidInstallments ? (plan.done ? 'var(--color-accent)' : 'var(--color-purple)') : 'var(--color-surface-3)' }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="tabular-nums">
          <b className="text-[13px]">{money(plan.perAmount)}</b>
          <span className="text-[color:var(--color-text-faint)]">{t('cal.perMo')}</span>
        </span>
        {plan.done ? (
          <span className="text-[color:var(--color-accent)]">{t('pl.paidOff', { total: money(plan.totalAmount) })}</span>
        ) : (
          <span className="text-[color:var(--color-text-dim)] tabular-nums">
            {t('pl.left', { amount: money(plan.remainingAmount), month: shortMonth(plan.projectedEndDate, locale) })}
          </span>
        )}
      </div>

      {/* "Is it this?": the best match, one tap to link */}
      {best && !skipHint && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/5 p-2">
          <Photo item={best.item} size={34} />
          <div className="min-w-[9rem] flex-1">
            <p className="flex items-center gap-1 text-[11px] text-[color:var(--color-accent)]">
              <Sparkles size={11} /> {t('pl.isItThis')} · {t('pl.match', { n: best.score })}
            </p>
            <p className="truncate text-xs font-medium">{best.item.title}</p>
          </div>
          <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="primary" disabled={pending} onClick={() => set([best.item._id])}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('pl.yesLink')}
          </Button>
          <button type="button" onClick={() => setSkipHint(true)} aria-label={t('common.close')} className="p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
            <X size={14} />
          </button>
          </span>
        </div>
      )}

      {/* Linked products, each opening the product */}
      {linked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {linked.map((i) => (
            <span key={i._id} className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] py-0.5 pl-0.5 pr-1.5 text-[11px]">
              <Photo item={i} size={20} className="rounded-full" />
              <Link href={`/items?open=${i._id}`} prefetch={false} className="truncate hover:text-[color:var(--color-accent)]">
                {i.title}
              </Link>
              <button type="button" disabled={pending} onClick={() => set(plan.itemIds.filter((x) => x !== i._id))} aria-label={t('stm.removeProduct')} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {picker && (
        <ProductPicker
          plan={plan}
          owned={owned}
          linkedElsewhere={linkedElsewhere}
          startCreate={picker === 'create'}
          onClose={() => setPicker(null)}
        />
      )}
      {merging && <MergePicker plan={plan} allPlans={allPlans} onClose={() => setMerging(false)} />}
    </div>
  );
}

function ProductPicker({
  plan,
  owned,
  linkedElsewhere,
  startCreate,
  onClose,
}: {
  plan: InstallmentPlan;
  owned: ItemOption[];
  linkedElsewhere: Set<string>;
  startCreate: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.itemIds));
  const [creating, setCreating] = useState(startCreate);
  const [newTitle, setNewTitle] = useState(titleCase(plan.label));
  const [newPrice, setNewPrice] = useState(plan.totalAmount > 0 ? plan.totalAmount.toFixed(2) : '');
  const [error, setError] = useState('');

  const ranked = useMemo(() => {
    const query = q.trim().toLowerCase();
    return owned
      .map((i) => ({ item: i, score: planItemMatch(plan, i) }))
      .filter(({ item }) => !query || `${item.title} ${item.purchasedFrom ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => Number(selected.has(b.item._id)) - Number(selected.has(a.item._id)) || b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 40);
  }, [owned, plan, q, selected]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function save() {
    setError('');
    startTransition(async () => {
      const r = await setPlanItems(plan.key, [...selected]);
      if (r.ok) onClose();
      else setError(r.error || t('common.failed'));
    });
  }
  function create() {
    setError('');
    const purchasedAt = (plan.signature.split('|')[2] || plan.firstDate.slice(0, 7)) + '-01';
    startTransition(async () => {
      const r = await createItemFromPlan(plan.key, { title: newTitle, price: Number(newPrice) || 0, purchasedAt, store: titleCase(plan.label) });
      if (r.ok) onClose();
      else setError(r.error || t('common.failed'));
    });
  }

  return (
    <Modal open onClose={onClose} title={t('pl.pickerTitle')} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
          <Ring plan={plan} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{titleCase(plan.label)}</p>
            <p className="text-xs text-[color:var(--color-text-dim)] tabular-nums">
              {money(plan.totalAmount)} · {plan.totalInstallments} × {money(plan.perAmount)} · {t('pl.bought', { month: shortMonth(plan.firstDate, locale) })}
            </p>
          </div>
        </div>

        {creating ? (
          <div className="space-y-3 rounded-xl border border-[color:var(--color-accent)]/30 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><PackagePlus size={15} className="text-[color:var(--color-accent)]" /> {t('pl.create')}</p>
            <p className="text-xs text-[color:var(--color-text-dim)]">{t('pl.createHint')}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label={t('pl.productName')}><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus /></Field>
              <Field label={t('pl.price')}><Input type="number" min="0" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>{t('pl.pickInstead')}</Button>
              <Button variant="primary" disabled={pending || !newTitle.trim()} onClick={create}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {t('pl.createLink')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('stm.searchInventory')} className={cn(controlClass, 'pl-9')} />
            </div>
            <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
              {ranked.map(({ item, score }) => {
                const on = selected.has(item._id);
                const price = item.purchasedPrice ?? item.currentPrice;
                const sub = [price > 0 ? money(price) : '', item.purchasedAt ? formatDate(item.purchasedAt, locale, { month: 'short', year: 'numeric' }) : '', item.purchasedFrom || ''].filter(Boolean).join(' · ');
                return (
                  <li key={item._id}>
                    <button
                      type="button"
                      onClick={() => toggle(item._id)}
                      aria-pressed={on}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors',
                        on ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/8' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]'
                      )}
                    >
                      <Photo item={item} size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-[11px] text-[color:var(--color-text-faint)]">
                          {sub}
                          {linkedElsewhere.has(item._id) && !plan.itemIds.includes(item._id) ? ` · ${t('pl.onOther')}` : ''}
                        </span>
                      </span>
                      {score > 0 && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ color: matchTone(score), background: `color-mix(in srgb, ${matchTone(score)} 14%, transparent)` }}>
                          {t('pl.match', { n: score })}
                        </span>
                      )}
                      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)]' : 'border-[color:var(--color-border-light)]')}>
                        {on && <Check size={13} />}
                      </span>
                    </button>
                  </li>
                );
              })}
              {ranked.length === 0 && <li className="py-6 text-center text-xs text-[color:var(--color-text-faint)]">{t('stm.noMoreInventory')}</li>}
            </ul>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[color:var(--color-border-light)] p-3 text-left hover:border-[color:var(--color-accent)]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]"><PackagePlus size={18} /></span>
              <span>
                <span className="block text-sm font-semibold">{t('pl.create')}</span>
                <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('pl.createHint')}</span>
              </span>
            </button>
            <div className="flex items-center justify-between gap-2 border-t border-[color:var(--color-border)] pt-3">
              <span className="text-xs text-[color:var(--color-text-dim)]">{t('pl.selected', { n: selected.size })}</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="primary" disabled={pending} onClick={save}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {t('common.save')}
                </Button>
              </div>
            </div>
          </>
        )}
        {error && <p role="alert" className="text-xs text-[color:var(--color-red)]">{error}</p>}
      </div>
    </Modal>
  );
}

/** Merge this plan into another one the bank printed with different wording. */
function MergePicker({ plan, allPlans, onClose }: { plan: InstallmentPlan; allPlans: InstallmentPlan[]; onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const others = allPlans
    .filter((p) => p.key !== plan.key && (!q.trim() || p.label.toLowerCase().includes(q.trim().toLowerCase())))
    .slice(0, 12);
  return (
    <Modal open onClose={onClose} title={t('stm.mergeInto')} size="md">
      <div className="space-y-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('stm.searchPlans')} className={controlClass} />
        <ul className="space-y-1.5">
          {others.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { await bindInstallmentGroup(plan.key, p.key); onClose(); })}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--color-border)] p-2.5 text-left text-sm hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                <span className="truncate">{titleCase(p.label)}</span>
                <span className="shrink-0 text-xs tabular-nums text-[color:var(--color-text-faint)]">{money(p.perAmount)} · {p.paidInstallments}/{p.totalInstallments}</span>
              </button>
            </li>
          ))}
          {others.length === 0 && <li className="text-xs text-[color:var(--color-text-faint)]">{t('stm.noOtherPlans')}</li>}
        </ul>
      </div>
    </Modal>
  );
}
