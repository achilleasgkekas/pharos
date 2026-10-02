'use client';
import { PAGE_MAIN, PageHeader, HeaderButton, PrimaryAction } from '@/components/ui/PageHeader';
import { useState, useMemo, useTransition } from 'react';
import { Trash2, Check, Archive, ArchiveRestore, Pencil, X, Cake, Gift } from 'lucide-react';
import { GiftIdeasModal } from './GiftIdeasModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { nextOccurrenceDays, yearsAtNextOccurrence } from '@/lib/specialDates';
import { intlTag } from '@/lib/i18n/format';
import type { TFunc } from '@/lib/i18n';
import type { SerializedSpecialDate } from '@/types';
import { useLocale, useT } from '@/components/LocaleProvider';
import { createSpecialDate, updateSpecialDate, deleteSpecialDate, setSpecialDateArchived } from './actions';

// P50: recurring personal dates (birthdays / anniversaries / namedays).

/** Month names in the app language, Jan..Dec. A fixed leap year, so 29 Feb is a real date. */
const monthNames = (locale: string) =>
  Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(intlTag(locale), { month: 'short' }));
const dayMonth = (month: number, day: number, locale: string) =>
  new Date(2000, month - 1, day).toLocaleDateString(intlTag(locale), { day: 'numeric', month: 'short' });

const whenLabel = (days: number, t: TFunc) => (days === 0 ? t('sdate.today') : days === 1 ? t('sdate.tomorrow') : t('sdate.inDays', { n: days }));
const dayColor = (days: number, lead: number) => (days === 0 ? 'var(--color-accent)' : days <= lead ? 'var(--color-gold)' : 'var(--color-text-faint)');

type Draft = Partial<SerializedSpecialDate> | null;

export function SpecialDatesClient({ dates, leadDays, giftsOn = false, currency = 'EUR' }: { dates: SerializedSpecialDate[]; leadDays: number; giftsOn?: boolean; currency?: string }) {
  const t = useT();
  const locale = useLocale();
  const months = useMemo(() => monthNames(locale), [locale]);
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Draft>(null);
  const [error, setError] = useState('');
  const [gifting, setGifting] = useState<SerializedSpecialDate | null>(null);

  const rows = useMemo(() => {
    return dates
      .filter((d) => showArchived || !d.archived)
      .map((d) => ({ d, days: nextOccurrenceDays(d.month, d.day) ?? 99999, years: yearsAtNextOccurrence(d.year, d.month, d.day) }))
      .sort((a, b) => a.days - b.days);
  }, [dates, showArchived]);
  const archivedCount = dates.filter((d) => d.archived).length;

  function submit(fd: FormData) {
    setError('');
    startTransition(async () => {
      const id = editing && editing._id;
      const r = id ? await updateSpecialDate(id, fd) : await createSpecialDate(fd);
      if (r.ok) setEditing(null);
      else setError(r.error || t('common.saveFailed'));
    });
  }

  function remove(d: SerializedSpecialDate) {
    startTransition(async () => {
      const ok = await confirm({ title: t('sdate.deleteTitle'), message: t('sdate.deleteBody', { name: d.name }), confirmLabel: t('common.delete'), danger: true });
      if (ok) await deleteSpecialDate(d._id);
    });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader
        title={t('nav.specialDates')}
        count={t('common.shown', { n: rows.length })}
        subtitle={t('sdate.subtitle', { n: leadDays })}
      >
        {archivedCount > 0 && (
          <HeaderButton icon={<Archive size={14} />} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t('common.hideArchived') : t('common.showArchived', { n: archivedCount })}
          </HeaderButton>
        )}
        <PrimaryAction onClick={() => { setError(''); setEditing({}); }} />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState icon={<Cake />} title={t('sdate.empty')} />
      ) : (
        <div className="space-y-2">
          {rows.map(({ d, days, years }) => (
            <div key={d._id} className={cn('flex items-center gap-3 rounded-xl border bg-[color:var(--color-surface)] px-3 py-2.5 transition-colors', d.archived ? 'border-[color:var(--color-border)] opacity-60' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.name}</span>
                  {d.type && <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.type}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span>{dayMonth(d.month, d.day, locale)}</span>
                  <span style={{ color: dayColor(days, leadDays) }}>· {whenLabel(days, t)}</span>
                  {years !== null && <span>· {t('sdate.turns', { n: years })}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {giftsOn && !d.archived && (
                  <button onClick={() => setGifting(d)} title={t('gift.ideas')} aria-label={t('gift.ideas')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Gift size={14} /></button>
                )}
                <button onClick={() => { setError(''); setEditing(d); }} title={t('common.edit')} aria-label={t('common.edit')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Pencil size={14} /></button>
                <button onClick={() => startTransition(async () => { await setSpecialDateArchived(d._id, !d.archived); })} title={d.archived ? t('common.unarchive') : t('common.archive')} aria-label={d.archived ? t('common.unarchive') : t('common.archive')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
                  {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
                <button onClick={() => remove(d)} title={t('common.delete')} aria-label={t('common.delete')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing._id ? t('sdate.edit') : t('sdate.new')} size="md">
        <form action={submit} className="space-y-3">
          <Field label={t('sdate.fName')}>
            <Input name="name" defaultValue={editing?.name || ''} placeholder={t('sdate.nameHint')} required />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t('common.type')}>
              <Input name="type" defaultValue={editing?.type || 'birthday'} placeholder={t('sdate.typeHint')} />
            </Field>
            <Field label={t('sdate.fYear')}>
              <Input name="year" type="number" defaultValue={editing?.year ? String(editing.year) : ''} placeholder="1990" />
            </Field>
            <Field label={t('sdate.fMonth')}>
              <select name="month" defaultValue={editing?.month || ''} required className={controlClass}>
                <option value="" disabled>—</option>
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label={t('sdate.fDay')}>
              <Input name="day" type="number" min={1} max={31} defaultValue={editing?.day ? String(editing.day) : ''} required />
            </Field>
          </div>
          <Field label={t('v.fNotes')}>
            <textarea name="notes" defaultValue={editing?.notes || ''} rows={2} className={controlClass} />
          </Field>
          {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}><X size={14} /> {t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={pending}><Check size={14} /> {editing && editing._id ? t('common.save') : t('common.add')}</Button>
          </div>
        </form>
      </Modal>
      {gifting && <GiftIdeasModal date={gifting} currency={currency} onClose={() => setGifting(null)} />}
    </main>
  );
}
