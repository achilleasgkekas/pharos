'use client';
import { useState, useMemo, useTransition } from 'react';
import { Plus, Trash2, Check, Archive, ArchiveRestore, Pencil, X, Cake, Gift } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { nextOccurrenceDays, yearsAtNextOccurrence } from '@/lib/specialDates';
import type { SerializedSpecialDate } from '@/types';
import { createSpecialDate, updateSpecialDate, deleteSpecialDate, setSpecialDateArchived } from './actions';

// P50 — recurring personal dates (birthdays / anniversaries / namedays). Inline English,
// like BillsClient; only the nav label is translated.

const inputClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const whenLabel = (days: number) => (days === 0 ? 'today 🎉' : days === 1 ? 'tomorrow' : `in ${days} days`);
const dayColor = (days: number, lead: number) => (days === 0 ? 'var(--color-accent)' : days <= lead ? 'var(--color-gold)' : 'var(--color-text-faint)');

type Draft = Partial<SerializedSpecialDate> | null;

export function SpecialDatesClient({ dates, leadDays }: { dates: SerializedSpecialDate[]; leadDays: number }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Draft>(null);
  const [error, setError] = useState('');

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
      else setError(r.error || 'Could not save');
    });
  }

  function remove(d: SerializedSpecialDate) {
    startTransition(async () => {
      const ok = await confirm({ title: 'Delete date', message: `Delete “${d.name}”? It moves to Trash.`, confirmLabel: 'Delete', danger: true });
      if (ok) await deleteSpecialDate(d._id);
    });
  }

  return (
    <main className="max-w-[1000px] mx-auto px-4 py-6 pb-24">
      <div className="mb-6 pb-4 border-b border-[color:var(--color-border)] flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <Cake size={26} className="text-[color:var(--color-accent)]" /> Special dates
          </h1>
          <span className="text-sm text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{rows.length} shown</span>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] px-2" style={{ fontFamily: 'var(--font-mono)' }}>
              {showArchived ? 'hide archived' : `show archived (${archivedCount})`}
            </button>
          )}
          <Button variant="primary" onClick={() => { setError(''); setEditing({}); }}>
            <Plus size={16} strokeWidth={2.5} /> New date
          </Button>
        </div>
      </div>

      <p className="text-xs text-[color:var(--color-text-dim)] -mt-3 mb-5">
        Birthdays, anniversaries, namedays — anything that comes round every year. You get a reminder {leadDays} days ahead (Settings → Notifications).
      </p>

      {rows.length === 0 ? (
        <div className="py-20 text-center text-[color:var(--color-text-faint)]">
          <Gift size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No dates yet. Add a birthday or anniversary so it never sneaks up on you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ d, days, years }) => (
            <div key={d._id} className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors', d.archived ? 'border-[color:var(--color-border)] opacity-60' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.name}</span>
                  {d.type && <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.type}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span>{MONTHS[d.month - 1]} {d.day}</span>
                  <span style={{ color: dayColor(days, leadDays) }}>· {whenLabel(days)}</span>
                  {years !== null && <span>· turns {years}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setError(''); setEditing(d); }} title="Edit" className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Pencil size={14} /></button>
                <button onClick={() => startTransition(async () => { await setSpecialDateArchived(d._id, !d.archived); })} title={d.archived ? 'Unarchive' : 'Archive'} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
                  {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
                <button onClick={() => remove(d)} title="Delete" className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing._id ? 'Edit date' : 'New date'} size="md">
        <form action={submit} className="space-y-3">
          <Field label="Name *">
            <Input name="name" defaultValue={editing?.name || ''} placeholder="Mum's birthday" required />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Type">
              <Input name="type" defaultValue={editing?.type || 'birthday'} placeholder="birthday / anniversary / nameday" />
            </Field>
            <Field label="Year (optional, for age)">
              <Input name="year" type="number" defaultValue={editing?.year ? String(editing.year) : ''} placeholder="1990" />
            </Field>
            <Field label="Month *">
              <select name="month" defaultValue={editing?.month || ''} required className={inputClass}>
                <option value="" disabled>—</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Day *">
              <Input name="day" type="number" min={1} max={31} defaultValue={editing?.day ? String(editing.day) : ''} required />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" defaultValue={editing?.notes || ''} rows={2} className={inputClass} />
          </Field>
          {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}><Check size={14} /> {editing && editing._id ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
