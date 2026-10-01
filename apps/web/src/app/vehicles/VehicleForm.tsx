'use client';
import { useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { VEHICLE_DUE_KINDS, VEHICLE_FUEL_TYPES } from '@/lib/vehicles';
import { saveVehicle } from './actions';
import { DUE_LABEL, FUEL_LABEL, dateOnly, type VehicleRow } from './shared';

const DATE_FIELDS = [...VEHICLE_DUE_KINDS, 'firstRegistration', 'purchaseDate'] as const;
type DateField = (typeof DATE_FIELDS)[number];

export function FormFooter({ error, pending, onClose }: { error: string; pending: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <>
      {error && <p role="alert" className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}><X size={14} /> {t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={pending}><Check size={14} /> {pending ? t('common.saving') : t('common.save')}</Button>
      </div>
    </>
  );
}

function Section({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border border-[color:var(--color-border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold select-none">{title}</summary>
      <div className="grid grid-cols-2 gap-3 pt-3">{children}</div>
    </details>
  );
}

const n = (v?: number | null) => (v ?? '') as number | '';

/** Add a vehicle, or edit every detail of one (#363: identity, purchase, specs, insurance, schedule). */
export function VehicleForm({ vehicle, spaces, onClose, onSaved }: { vehicle: VehicleRow | null; spaces: string[]; onClose: () => void; onSaved?: (id: string) => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useState<Record<DateField, string>>(
    () => Object.fromEntries(DATE_FIELDS.map((k) => [k, dateOnly(vehicle?.[k] as string | null | undefined)])) as Record<DateField, string>
  );
  const dateField = (k: DateField, label: string) => (
    <Field key={k} label={label}><DateInput name={k} value={dates[k]} onValueChange={(v) => setDates((d) => ({ ...d, [k]: v }))} /></Field>
  );

  function submit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const res = await saveVehicle(formData);
      if (res.ok) {
        onClose();
        if (res.id) onSaved?.(res.id);
      } else setError(res.error || t('common.failed'));
    });
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? t('veh.edit') : t('veh.add')} size="lg">
      <form action={submit} className="space-y-3">
        {vehicle && <input type="hidden" name="id" value={vehicle._id} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('veh.name')}><Input name="name" required defaultValue={vehicle?.name} placeholder={t('veh.nameHint')} /></Field>
          <Field label={t('veh.plate')}><Input name="plate" defaultValue={vehicle?.plate} /></Field>
          <Field label={t('veh.make')}><Input name="make" defaultValue={vehicle?.make} /></Field>
          <Field label={t('veh.model')}><Input name="model" defaultValue={vehicle?.model} /></Field>
          <Field label={t('veh.year')}><Input name="year" type="number" min="1900" max="2100" defaultValue={vehicle?.year ?? ''} /></Field>
          <Field label={t('veh.space')}>
            <Input name="space" list="vehicle-spaces" defaultValue={vehicle?.space} />
            <datalist id="vehicle-spaces">{spaces.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>

        <Section title={t('veh.dates')} open={!vehicle}>
          {VEHICLE_DUE_KINDS.map((k) => dateField(k, t(DUE_LABEL[k])))}
        </Section>

        <Section title={t('veh.secIdentity')}>
          <Field label={t('veh.vin')} className="col-span-2"><Input name="vin" defaultValue={vehicle?.vin} maxLength={40} autoCapitalize="characters" /></Field>
          <Field label={t('veh.fuelType')}>
            <select name="fuelType" defaultValue={vehicle?.fuelType ?? ''} className={controlClass}>
              <option value="">–</option>
              {VEHICLE_FUEL_TYPES.filter(Boolean).map((f) => <option key={f} value={f}>{t(FUEL_LABEL[f as Exclude<typeof f, ''>])}</option>)}
            </select>
          </Field>
          <Field label={t('veh.transmission')}>
            <select name="transmission" defaultValue={vehicle?.transmission ?? ''} className={controlClass}>
              <option value="">–</option>
              <option value="manual">{t('veh.manual')}</option>
              <option value="automatic">{t('veh.automatic')}</option>
            </select>
          </Field>
          <Field label={t('veh.engineCc')}><Input name="engineCc" type="number" min="0" step="1" defaultValue={n(vehicle?.engineCc)} /></Field>
          <Field label={t('veh.powerKw')}><Input name="powerKw" type="number" min="0" step="any" defaultValue={n(vehicle?.powerKw)} /></Field>
          <Field label={t('veh.color')}><Input name="color" defaultValue={vehicle?.color} /></Field>
          {dateField('firstRegistration', t('veh.firstRegistration'))}
        </Section>

        <Section title={t('veh.secPurchase')}>
          {dateField('purchaseDate', t('veh.purchaseDate'))}
          <Field label={t('veh.purchasePrice')}><Input name="purchasePrice" type="number" min="0" step="any" defaultValue={n(vehicle?.purchasePrice)} /></Field>
          <Field label={t('veh.purchaseSeller')}><Input name="purchaseSeller" defaultValue={vehicle?.purchaseSeller} /></Field>
          <Field label={t('veh.purchaseOdometer')}><Input name="purchaseOdometer" type="number" min="0" step="1" defaultValue={n(vehicle?.purchaseOdometer)} /></Field>
        </Section>

        <Section title={t('veh.secSpecs')}>
          <Field label={t('veh.tankCapacity')}><Input name="tankCapacity" type="number" min="0" step="any" defaultValue={n(vehicle?.tankCapacity)} /></Field>
          <Field label={t('veh.oilCapacity')}><Input name="oilCapacity" type="number" min="0" step="any" defaultValue={n(vehicle?.oilCapacity)} /></Field>
          <Field label={t('veh.oilType')}><Input name="oilType" defaultValue={vehicle?.oilType} placeholder="5W-30" /></Field>
          <Field label={t('veh.tyreSize')}><Input name="tyreSize" defaultValue={vehicle?.tyreSize} placeholder="205/55 R16" /></Field>
          <Field label={t('veh.tyrePressure')} className="col-span-2"><Input name="tyrePressure" defaultValue={vehicle?.tyrePressure} placeholder="2.3 / 2.5 bar" /></Field>
        </Section>

        <Section title={t('veh.secSchedule')}>
          <Field label={t('veh.serviceIntervalKm')}><Input name="serviceIntervalKm" type="number" min="0" step="1" defaultValue={n(vehicle?.serviceIntervalKm)} placeholder="15000" /></Field>
          <Field label={t('veh.serviceIntervalMonths')}><Input name="serviceIntervalMonths" type="number" min="0" step="1" defaultValue={n(vehicle?.serviceIntervalMonths)} placeholder="12" /></Field>
          <p className="col-span-2 text-[11px] text-[color:var(--color-text-faint)]">{t('veh.scheduleHint')}</p>
        </Section>

        <Section title={t('veh.secInsurance')}>
          <Field label={t('veh.insurer')}><Input name="insurer" defaultValue={vehicle?.insurer} /></Field>
          <Field label={t('veh.policyNumber')}><Input name="policyNumber" defaultValue={vehicle?.policyNumber} /></Field>
          <Field label={t('veh.coverType')}><Input name="coverType" defaultValue={vehicle?.coverType} placeholder={t('veh.coverTypeHint')} /></Field>
          <Field label={t('veh.insuranceYearlyCost')}><Input name="insuranceYearlyCost" type="number" min="0" step="any" defaultValue={n(vehicle?.insuranceYearlyCost)} /></Field>
        </Section>

        <Field label={t('veh.notes')}><textarea name="notes" defaultValue={vehicle?.notes} className={controlClass} rows={2} /></Field>
        <FormFooter error={error} pending={pending} onClose={onClose} />
      </form>
    </Modal>
  );
}
