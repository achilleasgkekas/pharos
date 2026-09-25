'use client';
import { PAGE_MAIN, PageHeader, PrimaryAction } from '@/components/ui/PageHeader';
import { useMemo, useState, useTransition } from 'react';
import { Trash2, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useT } from '@/components/LocaleProvider';
import { withConsumption, type ReadingLike } from '@/lib/meterReadings';
import { DateInput } from '@/components/ui/DateInput';
import { createMeterReading, deleteMeterReading } from './actions';
import { todayLocal } from '@/lib/dates';

const input = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

export function UtilitiesClient({ readings, spaces }: { readings: ReadingLike[]; spaces: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [readingAt, setReadingAt] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const rows = useMemo(() => withConsumption(readings), [readings]);
  const latestFirst = [...rows].reverse();

  function submit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const result = await createMeterReading(formData);
      if (result.ok) setOpen(false);
      else setError(result.error || t('common.failed'));
    });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('util.title')} count={readings.length} subtitle={t('util.subtitle')}>
        <PrimaryAction onClick={() => { setReadingAt(todayLocal()); setOpen(true); }} />
      </PageHeader>

      <section className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">{t('util.trend')}</h2>
        {rows.length < 2 ? <p className="h-52 grid place-items-center text-sm text-[color:var(--color-text-dim)]">{t('util.needTwo')}</p> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="readingAt" tickFormatter={(v) => new Date(v).toLocaleDateString()} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={48} />
              <Tooltip labelFormatter={(v) => new Date(v as string | number).toLocaleDateString()} formatter={(v, name) => [Number(v).toLocaleString(), name === 'value' ? t('util.reading') : t('util.consumption')]} />
              <Line type="monotone" dataKey="value" stroke="#00d4ff" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="overflow-hidden bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl">
        {latestFirst.length === 0 ? <p className="p-10 text-center text-sm text-[color:var(--color-text-dim)]">{t('util.empty')}</p> : latestFirst.map((r) => (
          <div key={r._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[color:var(--color-border)]">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{r.meter} <span className="text-xs text-[color:var(--color-text-dim)]">· {r.utilityType}{r.space ? ` · ${r.space}` : ''}</span></p>
              <p className="text-[11px] text-[color:var(--color-text-faint)]">{new Date(r.readingAt).toLocaleDateString()} {r.consumption === null ? '' : `· ${t('util.period')}: ${r.consumption.toLocaleString()} ${r.unit}`}</p>
            </div>
            <span className="font-mono text-sm">{r.value.toLocaleString()} {r.unit}</span>
            <button aria-label={t('common.delete')} className="p-2 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" onClick={() => startTransition(async () => { await deleteMeterReading(r._id); })}><Trash2 size={15} /></button>
          </div>
        ))}
      </section>

      {open && <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onMouseDown={() => setOpen(false)}>
        <form action={submit} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 space-y-3">
          <div className="flex justify-between"><h2 className="font-semibold">{t('util.add')}</h2><button type="button" onClick={() => setOpen(false)}><X size={18} /></button></div>
          <label className="block text-xs">{t('util.meter')}<input name="meter" required className={input} placeholder={t('util.meterHint')} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">{t('util.type')}<input name="utilityType" required className={input} placeholder={t('util.typeHint')} /></label>
            <label className="block text-xs">{t('util.unit')}<input name="unit" required className={input} placeholder="kWh / m³" /></label>
            <label className="block text-xs">{t('util.date')}<DateInput name="readingAt" required value={readingAt} onValueChange={setReadingAt} className={input} /></label>
            <label className="block text-xs">{t('util.reading')}<input name="value" type="number" min="0" step="any" required className={input} /></label>
          </div>
          <label className="block text-xs">{t('util.space')}<input name="space" list="utility-spaces" className={input} /><datalist id="utility-spaces">{spaces.map((s) => <option key={s} value={s} />)}</datalist></label>
          <label className="block text-xs">{t('util.notes')}<textarea name="notes" className={input} rows={2} /></label>
          {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm">{t('common.cancel')}</button><button disabled={pending} className="rounded-lg bg-[color:var(--color-accent)] text-black px-4 py-2 text-sm font-semibold">{pending ? t('common.saving') : t('common.save')}</button></div>
        </form>
      </div>}
    </main>
  );
}
