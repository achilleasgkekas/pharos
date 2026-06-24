'use client';
import { cur } from "@/lib/money";
import { useEffect, useState, useTransition } from 'react';
import { Loader2, Copy, Check, Merge } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { useRouter } from 'next/navigation';
import { findDuplicateReceipts, mergeReceipts, type DupGroup } from './actions';
import { useT } from '@/components/LocaleProvider';

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}
function fmtDate(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function DuplicatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [keepBy, setKeepBy] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, number>>({}); // key → merged count
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    findDuplicateReceipts()
      .then((g) => {
        setGroups(g);
        // Default keep = the most complete (already sorted first by the action)
        setKeepBy(Object.fromEntries(g.map((grp) => [grp.key, grp.receipts[0]?._id])));
      })
      .finally(() => setLoading(false));
  }, [open]);

  function handleMerge(grp: DupGroup) {
    const keep = keepBy[grp.key];
    if (!keep) return;
    const drops = grp.receipts.map((r) => r._id).filter((id) => id !== keep);
    if (drops.length === 0) return;
    setBusyKey(grp.key);
    startTransition(async () => {
      const r = await mergeReceipts(keep, drops);
      setBusyKey(null);
      if (r.ok) {
        setDone((d) => ({ ...d, [grp.key]: r.merged }));
        router.refresh();
      }
    });
  }

  const pending = groups.filter((g) => !done[g.key]);
  const totalDupes = groups.reduce((s, g) => s + (g.receipts.length - 1), 0);

  return (
    <Modal open={open} onClose={onClose} title={t('dup.title')} size="xl">
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-[color:var(--color-text-dim)]">
          <Loader2 size={26} className="animate-spin" />
          <p className="text-sm">{t('dup.scanning')}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-3">✨</p>
          <p className="text-sm">{t('dup.none')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
            <Copy size={12} className="inline mr-1" />
            {t('dup.intro', { groups: groups.length, dupes: totalDupes })}
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
                  <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                    {grp.receipts[0].store} · {cur()}{grp.receipts[0].total} · {fmtDate(grp.receipts[0].date)}
                  </span>
                  {merged ? (
                    <span className="text-[11px] text-[color:var(--color-accent)] flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)' }}>
                      <Check size={13} /> {t('dup.merged', { n: merged })}
                    </span>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => handleMerge(grp)} disabled={busyKey === grp.key}>
                      {busyKey === grp.key ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
                      {t('dup.merge', { n: grp.receipts.length })}
                    </Button>
                  )}
                </div>

                {!merged && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.receipts.map((r) => {
                      const isKeep = keep === r._id;
                      return (
                        <button
                          key={r._id}
                          type="button"
                          onClick={() => setKeepBy((k) => ({ ...k, [grp.key]: r._id }))}
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
                          {r.thumbPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl(r.thumbPath)} alt="" className="w-9 h-9 rounded object-cover bg-[color:var(--color-surface-3)] shrink-0" />
                          ) : (
                            <span className="w-9 h-9 rounded bg-[color:var(--color-surface-3)] grid place-items-center text-[9px] text-[color:var(--color-text-faint)] shrink-0 uppercase">
                              {r.fileType || '?'}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-[11px]">
                              {r.verified ? (
                                <span className="text-[color:var(--color-accent)]">{t('dup.verified')}</span>
                              ) : (
                                <span className="text-[color:var(--color-gold)]">{t('dup.unverified')}</span>
                              )}
                              {isKeep && <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-accent)]">{t('dup.keep')}</span>}
                            </span>
                            <span className="block text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                              {t('dup.itemStats', { items: r.lineItemCount, linked: r.itemCount, model: r.aiModel || 'manual' })}
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
