'use client';
import { useEffect, useState, useTransition } from 'react';
import { Loader2, Copy, Check, Merge, Power, PowerOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { cur } from '@/lib/money';
import { useT } from '@/components/LocaleProvider';
import { findDuplicateSubscriptions, mergeSubscriptions } from './actions';
import type { SubscriptionDupeGroup } from '@/lib/subscriptionDupes';

/**
 * Review-before-merge for duplicate subscriptions (P85) — the same shape as the Expenses/
 * Receipts modals, because the user has already learned that flow. Nothing merges without
 * an explicit click per group, and the drops land in the Trash rather than disappearing.
 */
export function SubscriptionDuplicatesModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<SubscriptionDupeGroup[]>([]);
  const [keepBy, setKeepBy] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, number>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    findDuplicateSubscriptions()
      .then((g) => {
        setGroups(g);
        // Default keeper = the most complete (usually the active one), sorted first by the action.
        setKeepBy(Object.fromEntries(g.map((grp) => [grp.key, grp.entries[0]?._id])));
      })
      .finally(() => setLoading(false));
  }, []);

  function handleMerge(grp: SubscriptionDupeGroup) {
    const keep = keepBy[grp.key];
    if (!keep) return;
    const drops = grp.entries.map((e) => e._id).filter((id) => id !== keep);
    if (drops.length === 0) return;
    setBusyKey(grp.key);
    setError('');
    startTransition(async () => {
      const r = await mergeSubscriptions(keep, drops);
      setBusyKey(null);
      if (r.ok) {
        setDone((d) => ({ ...d, [grp.key]: r.merged }));
        router.refresh();
      } else {
        setError(r.error || 'Merge failed');
      }
    });
  }

  const pending = groups.filter((g) => !done[g.key]);
  const totalDupes = groups.reduce((s, g) => s + (g.entries.length - 1), 0);
  const money = (n: number) => `${cur()}${n.toFixed(2)}`;

  return (
    <Modal open onClose={onClose} title={t('subdup.title')} size="xl">
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-[color:var(--color-text-dim)]">
          <Loader2 size={26} className="animate-spin" />
          <p className="text-sm">{t('dup.scanning')}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-3">✨</p>
          <p className="text-sm">{t('subdup.none')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <Copy size={12} className="inline mr-1" />
            {t('subdup.intro', { groups: groups.length, dupes: totalDupes })}
          </p>
          {error && (
            <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {error}
            </p>
          )}

          {groups.map((grp) => {
            const merged = done[grp.key];
            const keep = keepBy[grp.key];
            const head = grp.entries[0];
            return (
              <div
                key={grp.key}
                className={cn(
                  'border rounded-xl p-3 transition-colors',
                  merged ? 'border-[color:var(--color-accent)] bg-[#00ff8808]' : 'border-[color:var(--color-border)]'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                    {head.name || '—'} · {money(head.amount)} / {head.billingCycle}
                  </span>
                  {merged ? (
                    <span
                      className="text-[11px] text-[color:var(--color-accent)] flex items-center gap-1"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      <Check size={13} /> {t('dup.merged', { n: merged })}
                    </span>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => handleMerge(grp)} disabled={busyKey === grp.key}>
                      {busyKey === grp.key ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
                      {t('dup.merge', { n: grp.entries.length })}
                    </Button>
                  )}
                </div>

                {!merged && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.entries.map((e) => {
                      const isKeep = keep === e._id;
                      return (
                        <button
                          key={e._id}
                          type="button"
                          onClick={() => setKeepBy((k) => ({ ...k, [grp.key]: e._id }))}
                          className={cn(
                            'flex items-start gap-2.5 text-left rounded-lg border p-2 transition-colors',
                            isKeep
                              ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                              : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)] opacity-80'
                          )}
                        >
                          <span
                            className={cn(
                              'shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center',
                              isKeep
                                ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]'
                                : 'border-[color:var(--color-border-light)]'
                            )}
                          >
                            {isKeep && <Check size={11} strokeWidth={3} className="text-black" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-[11px] flex-wrap">
                              {e.active ? (
                                <span className="text-[color:var(--color-accent)] flex items-center gap-0.5">
                                  <Power size={10} /> {t('subdup.active')}
                                </span>
                              ) : (
                                <span className="text-[color:var(--color-text-faint)] flex items-center gap-0.5">
                                  <PowerOff size={10} /> {t('subdup.cancelled')}
                                </span>
                              )}
                              {isKeep && (
                                <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-accent)]">
                                  {t('dup.keep')}
                                </span>
                              )}
                            </span>
                            <span
                              className="block text-[10px] text-[color:var(--color-text-faint)] truncate"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {t('subdup.meta', {
                                category: e.category || '—',
                                provider: e.provider || '—',
                              })}
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
