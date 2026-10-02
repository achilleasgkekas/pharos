'use client';
import { PAGE_MAIN, PageHeader, PrimaryAction } from '@/components/ui/PageHeader';
import { useMemo, useState, useTransition } from 'react';
import { Camera, Check, Gauge, Trash2, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useLocale, useT } from '@/components/LocaleProvider';
import { withConsumption, type ReadingLike } from '@/lib/meterReadings';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DateInput } from '@/components/ui/DateInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/i18n/format';
import { createMeterReading, deleteMeterReading } from './actions';
import { todayLocal } from '@/lib/dates';
import { ScanFileButton } from '@/components/ScanFileButton';

export function UtilitiesClient({ readings, spaces, scanOn = false }: { readings: ReadingLike[]; spaces: string[]; scanOn?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [readingAt, setReadingAt] = useState('');
  // Controlled so a meter photo can fill them; the rest of the form stays uncontrolled.
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [meter, setMeter] = useState('');
  const [photo, setPhoto] = useState<File | null>(null); // a scanned meter photo, kept with the reading
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const rows = useMemo(() => withConsumption(readings), [readings]);
  const latestFirst = [...rows].reverse();
  const date = (v: string | number | Date) => formatDate(v, locale);

  function submit(formData: FormData) {
    setError('');
    if (photo) formData.set('photo', photo);
    startTransition(async () => {
      const result = await createMeterReading(formData);
      if (result.ok) setOpen(false);
      else setError(result.error || t('common.failed'));
    });
  }

  async function remove(id: string) {
    if (!(await confirm({ title: t('util.deleteTitle'), message: t('common.movesToTrash'), confirmLabel: t('common.delete'), danger: true }))) return;
    startTransition(async () => { await deleteMeterReading(id); });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('util.title')} count={readings.length} subtitle={t('util.subtitle')}>
        <PrimaryAction onClick={() => { setError(''); setReadingAt(todayLocal()); setValue(''); setPhoto(null); setOpen(true); }} />
      </PageHeader>

      {latestFirst.length === 0 ? (
        <EmptyState icon={<Gauge />} title={t('util.empty')} />
      ) : (
        <>
          <section className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold mb-3">{t('util.trend')}</h2>
            {rows.length < 2 ? <p className="h-52 grid place-items-center text-sm text-[color:var(--color-text-dim)]">{t('util.needTwo')}</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="readingAt" tickFormatter={(v) => date(v)} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <Tooltip labelFormatter={(v) => date(v as string | number)} formatter={(v, name) => [Number(v).toLocaleString(locale), name === 'value' ? t('util.reading') : t('util.consumption')]} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-cyan)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="overflow-hidden bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl">
            {latestFirst.map((r) => (
              <div key={r._id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[color:var(--color-border)]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.meter} <span className="text-xs text-[color:var(--color-text-dim)]">· {r.utilityType}{r.space ? ` · ${r.space}` : ''}</span></p>
                  <p className="text-[11px] text-[color:var(--color-text-faint)]">{date(r.readingAt)} {r.consumption === null ? '' : `· ${t('util.period')}: ${r.consumption.toLocaleString(locale)} ${r.unit}`}</p>
                </div>
                {r.photoPath && (
                  <a href={`/api/files/${r.photoPath.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noopener noreferrer" aria-label={t('util.photo')} title={t('util.photo')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]">
                    <Camera size={15} />
                  </a>
                )}
                <span className="font-mono text-sm">{r.value.toLocaleString(locale)} {r.unit}</span>
                <button aria-label={t('common.delete')} title={t('common.delete')} className="p-2 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" onClick={() => remove(r._id)}><Trash2 size={15} /></button>
              </div>
            ))}
          </section>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('util.add')} size="md">
        <form action={submit} className="space-y-3">
          {scanOn && (
            <ScanFileButton
              kind="meter"
              label={t('ut.scanMeter')}
              accept="image/*"
              onResult={(r, file) => {
                if (r.kind !== 'meter') return;
                setPhoto(file);
                if (r.data.value !== null) setValue(String(r.data.value));
                if (r.data.unit) setUnit(r.data.unit === 'm3' ? 'm³' : r.data.unit);
                if (!readingAt) setReadingAt(todayLocal());
              }}
            />
          )}
          <Field label={t('util.meter')}>
            <Input name="meter" required placeholder={t('util.meterHint')} value={meter} onChange={(e) => setMeter(e.target.value)} list="utility-meters" />
            <datalist id="utility-meters">{[...new Set(readings.map((r) => r.meter))].map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('util.type')}><Input name="utilityType" required placeholder={t('util.typeHint')} /></Field>
            <Field label={t('util.unit')}><Input name="unit" required placeholder="kWh / m³" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
            <Field label={t('util.date')}><DateInput name="readingAt" required value={readingAt} onValueChange={setReadingAt} /></Field>
            <Field label={t('util.reading')}><Input name="value" type="number" min="0" step="any" required value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          </div>
          <Field label={t('util.space')}>
            <Input name="space" list="utility-spaces" />
            <datalist id="utility-spaces">{spaces.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label={t('util.notes')}><textarea name="notes" className={controlClass} rows={2} /></Field>
          {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}><X size={14} /> {t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={pending}><Check size={14} /> {pending ? t('common.saving') : t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
