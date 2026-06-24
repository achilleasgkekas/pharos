'use client';
import { useEffect, useState, useTransition } from 'react';
import { useT } from '@/components/LocaleProvider';
import { Loader2, Store as StoreIcon, Check, Merge, Copy } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { findDuplicateStores, mergeStores, type StoreDupGroup } from './actions';

export function StoreDuplicatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<StoreDupGroup[]>([]);
  const [keepBy, setKeepBy] = useState<Record<string, string>>({}); // group key → chosen canonical name
  const [done, setDone] = useState<Record<string, number>>({}); // key → rewritten count
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDone({});
    findDuplicateStores()
      .then((g) => {
        setGroups(g);
        // default canonical = the most-used variant (already sorted first)
        setKeepBy(Object.fromEntries(g.map((grp) => [grp.key, grp.variants[0]?.name])));
      })
      .finally(() => setLoading(false));
  }, [open]);

  function handleMerge(grp: StoreDupGroup) {
    const canon = keepBy[grp.key];
    if (!canon) return;
    const variants = grp.variants.map((v) => v.name);
    setBusyKey(grp.key);
    startTransition(async () => {
      const r = await mergeStores(canon, variants);
      setBusyKey(null);
      if (r.ok) {
        setDone((d) => ({ ...d, [grp.key]: r.updated }));
        router.refresh();
      }
    });
  }

  const pending = groups.filter((g) => !done[g.key]);
  const totalVariants = groups.reduce((s, g) => s + (g.variants.length - 1), 0);

  return (
    <Modal open={open} onClose={onClose} title={t('set.findDuplicates')} size="xl">
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-[color:var(--color-text-dim)]">
          <Loader2 size={26} className="animate-spin" />
          <p className="text-sm">{t('sd.scanning')}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-3">✨</p>
          <p className="text-sm">{t('sd.none')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <Copy size={12} className="inline mr-1" />
            {t('sd.intro', { groups: groups.length, variants: totalVariants })}
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
                  <span className="text-xs font-semibold flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <StoreIcon size={13} className="text-[color:var(--color-cyan)]" />
                    {merged ? `→ ${keep}` : t('sd.keepName', { name: keep })}
                  </span>
                  {merged ? (
                    <span className="text-[11px] text-[color:var(--color-accent)] flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)' }}>
                      <Check size={13} /> {t('sd.rewritten', { n: merged })}
                    </span>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => handleMerge(grp)} disabled={busyKey === grp.key}>
                      {busyKey === grp.key ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
                      {t('dup.merge', { n: grp.variants.length })}
                    </Button>
                  )}
                </div>

                {!merged && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.variants.map((v) => {
                      const isKeep = keep === v.name;
                      return (
                        <button
                          key={v.name}
                          type="button"
                          onClick={() => setKeepBy((k) => ({ ...k, [grp.key]: v.name }))}
                          className={cn(
                            'flex items-center gap-2.5 text-left rounded-lg border p-2 transition-colors',
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
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                              {v.name}
                              {isKeep && <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-accent)]">{t('dup.keep')}</span>}
                            </span>
                            <span className="block text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                              {t('sd.variantStats', { receipts: v.receiptCount, items: v.itemCount })}
                              {v.inList ? ` · ${t('sd.inList')}` : ''}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {pending.length === 0 && (
            <div className="text-center pt-2">
              <Button variant="ghost" onClick={onClose}>
                {t('qv.done')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
