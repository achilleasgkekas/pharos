'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2, RotateCcw, Search, X, Package, Receipt as ReceiptIcon,
  Wallet, CalendarClock, Ticket, CreditCard, CheckSquare, FileText, Loader2, Target, Barcode,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { restoreFromTrash, purgeFromTrash, emptyTrash, type TrashRow, type TrashType } from '@/app/settings/actions';
import { useT } from '@/components/LocaleProvider';
import { relTime } from '@/lib/i18n/format';
import type { TKey } from '@/lib/i18n';

const TYPE_META: Record<TrashType, { labelKey: TKey; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  item: { labelKey: 'trash.tItem', Icon: Package },
  receipt: { labelKey: 'trash.tReceipt', Icon: ReceiptIcon },
  expense: { labelKey: 'trash.tExpense', Icon: Wallet },
  subscription: { labelKey: 'trash.tSubscription', Icon: CalendarClock },
  voucher: { labelKey: 'trash.tVoucher', Icon: Ticket },
  giftcard: { labelKey: 'trash.tGiftCard', Icon: CreditCard },
  loyaltycard: { labelKey: 'trash.tLoyaltyCard', Icon: Barcode },
  bill: { labelKey: 'trash.tBill', Icon: FileText },
  goal: { labelKey: 'trash.tGoal', Icon: Target },
  task: { labelKey: 'trash.tTask', Icon: CheckSquare },
};

// 30-day retention (mirrors getTrash); show how long until auto-purge.
function purgesIn(iso: string): number {
  const d = (new Date(iso).getTime() + 30 * 86400000 - Date.now()) / 86400000;
  return Math.max(0, Math.ceil(d));
}

const key = (r: { type: TrashType; id: string }) => `${r.type}:${r.id}`;

export function TrashClient({ rows }: { rows: TrashRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const t = useT();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TrashType | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (typeFilter === 'all' || r.type === typeFilter) &&
        (!q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q) || r.type.includes(q))
    );
  }, [rows, search, typeFilter]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(key(r)));

  function toggle(r: TrashRow) {
    setSelected((s) => {
      const n = new Set(s);
      const k = key(r);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      if (allVisibleSelected) {
        const n = new Set(s);
        visible.forEach((r) => n.delete(key(r)));
        return n;
      }
      return new Set([...s, ...visible.map(key)]);
    });
  }

  async function restore(r: TrashRow) {
    setBusy(key(r));
    await restoreFromTrash(r.type, r.id);
    setBusy(null);
    setSelected((s) => { const n = new Set(s); n.delete(key(r)); return n; });
    router.refresh();
  }

  async function purge(r: TrashRow) {
    const ok = await confirm({ title: t('trash.confirmDelete', { title: r.title }), message: t('trash.confirmDeleteBody'), confirmLabel: t('common.deleteForever'), danger: true });
    if (!ok) return;
    setBusy(key(r));
    await purgeFromTrash(r.type, r.id);
    setBusy(null);
    setSelected((s) => { const n = new Set(s); n.delete(key(r)); return n; });
    router.refresh();
  }

  function selectedRows(): TrashRow[] {
    return rows.filter((r) => selected.has(key(r)));
  }

  function restoreSelected() {
    const sel = selectedRows();
    if (!sel.length) return;
    start(async () => {
      for (const r of sel) await restoreFromTrash(r.type, r.id);
      setSelected(new Set());
      router.refresh();
    });
  }

  async function purgeSelected() {
    const sel = selectedRows();
    if (!sel.length) return;
    const ok = await confirm({ title: t('trash.confirmDeleteMany', { n: sel.length }), message: t('trash.confirmDeleteBody'), confirmLabel: t('common.deleteForever'), danger: true });
    if (!ok) return;
    start(async () => {
      for (const r of sel) await purgeFromTrash(r.type, r.id);
      setSelected(new Set());
      router.refresh();
    });
  }

  async function empty() {
    const ok = await confirm({ title: t('trash.confirmEmpty'), message: t('trash.confirmEmptyBody'), confirmLabel: t('trash.empty'), danger: true });
    if (!ok) return;
    start(async () => {
      await emptyTrash();
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2.5" style={{ fontFamily: 'var(--font-display)' }}>
          <Trash2 size={26} className="text-[color:var(--color-text-dim)]" />
          {t('nav.trash')}
          <span className="text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {rows.length}
          </span>
        </h1>
        {rows.length > 0 && (
          <Button variant="danger" size="sm" onClick={empty} disabled={pending}>
            <Trash2 size={14} /> {t('trash.empty')}
          </Button>
        )}
      </div>
      <p className="text-xs text-[color:var(--color-text-faint)] mb-5">
        {t('trash.intro')}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-20 text-center">
          <Trash2 size={32} className="mx-auto text-[color:var(--color-text-faint)] opacity-40" />
          <p className="mt-3 text-sm text-[color:var(--color-text-dim)]">{t('trash.isEmpty')}</p>
          <p className="text-xs text-[color:var(--color-text-faint)]">{t('trash.emptyHint')}</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('trash.searchPlaceholder')}
                className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[color:var(--color-accent)]"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label={`${t('common.all')} ${rows.length}`} />
            {(Object.keys(TYPE_META) as TrashType[])
              .filter((ty) => counts[ty])
              .map((ty) => (
                <Chip key={ty} active={typeFilter === ty} onClick={() => setTypeFilter(ty)} label={`${t(TYPE_META[ty].labelKey)} ${counts[ty]}`} />
              ))}
          </div>

          {/* Bulk bar */}
          <div className="flex items-center justify-between gap-3 mb-3 text-xs">
            <button onClick={toggleAll} className="text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {allVisibleSelected ? t('common.deselectAll') : t('trash.selectAllN', { n: visible.length })}
            </button>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--color-text-faint)]">{t('trash.selected', { n: selected.size })}</span>
                <Button variant="secondary" size="sm" onClick={restoreSelected} disabled={pending}>
                  <RotateCcw size={13} /> {t('common.restore')}
                </Button>
                <Button variant="danger" size="sm" onClick={purgeSelected} disabled={pending}>
                  <Trash2 size={13} /> {t('common.delete')}
                </Button>
              </div>
            )}
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {visible.map((r) => {
              const k = key(r);
              const { Icon } = TYPE_META[r.type];
              const isBusy = busy === k;
              const sel = selected.has(k);
              const left = purgesIn(r.deletedAt);
              return (
                <div
                  key={k}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                    sel ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5' : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:border-[color:var(--color-border-light)]'
                  )}
                >
                  <input type="checkbox" checked={sel} onChange={() => toggle(r)} className="shrink-0 accent-[color:var(--color-accent)] w-4 h-4" />
                  <Icon size={16} className="shrink-0 text-[color:var(--color-text-faint)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-[11px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                      {r.subtitle ? `${r.subtitle} · ` : ''}{t('trash.deleted', { ago: relTime(r.deletedAt, t) })}{left <= 7 ? ` · ${t('trash.purgesIn', { n: left })}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(r)}
                    disabled={isBusy}
                    title={t('common.restore')}
                    className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                  >
                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                  </button>
                  <button
                    onClick={() => purge(r)}
                    disabled={isBusy}
                    title={t('common.deleteForever')}
                    className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
            {visible.length === 0 && (
              <p className="text-center text-sm text-[color:var(--color-text-faint)] py-10">{t('trash.noMatch')}</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-lg text-[11px] uppercase tracking-wide border transition-colors',
        active
          ? 'bg-[color:var(--color-accent)]/15 border-[color:var(--color-accent)]/40 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'
      )}
    >
      {label}
    </button>
  );
}
