'use client';
import { cur } from '@/lib/money';
import { useEffect, useState, useTransition } from 'react';
import { Loader2, Copy, Check, Merge } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { findDuplicateItems, mergeItems, type DupItem, type ItemDupGroup } from './actions';

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Keep-radio list over a set of duplicate items — pick the one to KEEP; the rest
 * merge into it. Reused by the auto-group modal AND the select-mode manual merge.
 */
export function MergeItemsPicker({
  items,
  keepId,
  onKeep,
}: {
  items: DupItem[];
  keepId: string;
  onKeep: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((it) => {
        const isKeep = keepId === it._id;
        return (
          <button
            key={it._id}
            type="button"
            onClick={() => onKeep(it._id)}
            className={cn(
              'flex items-center gap-2.5 text-left rounded-lg border p-2 transition-colors min-w-0',
              isKeep
                ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)] opacity-80'
            )}
          >
            <span
              className={cn(
                'shrink-0 w-4 h-4 rounded-full border flex items-center justify-center',
                isKeep ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]' : 'border-[color:var(--color-border-light)]'
              )}
            >
              {isKeep && <Check size={11} strokeWidth={3} className="text-black" />}
            </span>
            {it.thumbPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(it.thumbPath)} alt="" className="w-9 h-9 rounded object-cover bg-[color:var(--color-surface-3)] shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded bg-[color:var(--color-surface-3)] grid place-items-center text-[9px] text-[color:var(--color-text-faint)] shrink-0 uppercase">
                {it.status.slice(0, 3)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[color:var(--color-text-dim)] capitalize">{it.status}</span>
                {it.currentPrice > 0 && (
                  <span className="text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {cur()}
                    {it.currentPrice}
                  </span>
                )}
                {isKeep && <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-accent)]">keep</span>}
              </span>
              <span className="block text-xs text-[color:var(--color-text)] truncate">{it.title}</span>
              <span className="block text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                {it.links} links · {it.photos} photos · {it.receipts} receipts
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Find duplicate products" — auto-grouped by title; pick the keeper, merge the rest. */
export function ItemDuplicatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ItemDupGroup[]>([]);
  const [keepBy, setKeepBy] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, number>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDone({});
    findDuplicateItems()
      .then((g) => {
        setGroups(g);
        setKeepBy(Object.fromEntries(g.map((grp) => [grp.key, grp.items[0]?._id])));
      })
      .finally(() => setLoading(false));
  }, [open]);

  function handleMerge(grp: ItemDupGroup) {
    const keep = keepBy[grp.key];
    if (!keep) return;
    const drops = grp.items.map((r) => r._id).filter((id) => id !== keep);
    if (drops.length === 0) return;
    setBusyKey(grp.key);
    startTransition(async () => {
      const r = await mergeItems(keep, drops);
      setBusyKey(null);
      if (r.ok) {
        setDone((d) => ({ ...d, [grp.key]: r.merged }));
        router.refresh();
      }
    });
  }

  const pending = groups.filter((g) => !done[g.key]);
  const totalDupes = groups.reduce((s, g) => s + (g.items.length - 1), 0);

  return (
    <Modal open={open} onClose={onClose} title="Find duplicate products" size="xl">
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-[color:var(--color-text-dim)]">
          <Loader2 size={26} className="animate-spin" />
          <p className="text-sm">Scanning for duplicates…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-3">✨</p>
          <p className="text-sm">No duplicate products found. Clean library!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <Copy size={12} className="inline mr-1" />
            {groups.length} group{groups.length === 1 ? '' : 's'} · {totalDupes} duplicate{totalDupes === 1 ? '' : 's'} to merge. Pick the one to{' '}
            <b>keep</b> in each (defaults to the most complete); the rest merge into it.
          </p>

          {groups.map((grp) => {
            const merged = done[grp.key];
            const keep = keepBy[grp.key];
            return (
              <div
                key={grp.key}
                className={cn(
                  'border rounded-xl p-3 transition-colors',
                  merged ? 'border-[color:var(--color-accent)] bg-[#00ff8808]' : 'border-[color:var(--color-border)]'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold truncate min-w-0" style={{ fontFamily: 'var(--font-mono)' }}>
                    {grp.items[0].title}
                  </span>
                  {merged ? (
                    <span className="text-[11px] text-[color:var(--color-accent)] flex items-center gap-1 shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                      <Check size={13} /> merged {merged}
                    </span>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => handleMerge(grp)} disabled={busyKey === grp.key}>
                      {busyKey === grp.key ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
                      Merge {grp.items.length} → 1
                    </Button>
                  )}
                </div>

                {!merged && (
                  <MergeItemsPicker items={grp.items} keepId={keep} onKeep={(id) => setKeepBy((k) => ({ ...k, [grp.key]: id }))} />
                )}
              </div>
            );
          })}

          {pending.length === 0 && (
            <div className="text-center pt-2">
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
