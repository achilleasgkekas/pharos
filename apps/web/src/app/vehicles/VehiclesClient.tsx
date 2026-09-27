'use client';
import { PAGE_MAIN, PageHeader, HeaderButton, PrimaryAction } from '@/components/ui/PageHeader';
import { useMemo, useState, useTransition } from 'react';
import { Archive, ArchiveRestore, Car, Check, Fuel, Pencil, Trash2, Wrench, X } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { DateInput } from '@/components/ui/DateInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/fx';
import { formatDate } from '@/lib/i18n/format';
import { todayLocal } from '@/lib/dates';
import { documentDaysUntilExpiry } from '@/lib/documentExpiry';
import { VEHICLE_DUE_KINDS, vehicleStats, withFuelConsumption, type VehicleDueKind } from '@/lib/vehicles';
import type { TKey } from '@/lib/i18n';
import { addVehicleLog, deleteVehicle, deleteVehicleLog, saveVehicle, setVehicleArchived } from './actions';

export type VehicleRow = {
  _id: string;
  name: string;
  plate?: string;
  make?: string;
  model?: string;
  year?: number | null;
  space?: string;
  notes?: string;
  archived?: boolean;
} & Partial<Record<VehicleDueKind, string | null>>;

export type LogRow = {
  _id: string;
  vehicleId: string;
  kind: 'fuel' | 'service';
  date: string;
  odometer: number | null;
  cost: number;
  liters: number;
  fullTank: boolean;
  description?: string;
  shop?: string;
  expenseId?: string;
};

const card = 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl';

const DUE_LABEL: Record<VehicleDueKind, TKey> = {
  motUntil: 'veh.mot',
  insuranceUntil: 'veh.insurance',
  roadTaxUntil: 'veh.roadTax',
  emissionsUntil: 'veh.emissions',
};

const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export function VehiclesClient({ vehicles, logs, spaces, currency, leadDays }: { vehicles: VehicleRow[]; logs: LogRow[]; spaces: string[]; currency: string; leadDays: number }) {
  const t = useT();
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, currency, locale);
  const confirm = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | 'new' | null>(null);
  const [logFor, setLogFor] = useState<{ vehicle: VehicleRow; kind: 'fuel' | 'service' } | null>(null);
  const [pending, startTransition] = useTransition();

  const logsByVehicle = useMemo(() => {
    const m = new Map<string, LogRow[]>();
    for (const l of logs) m.set(String(l.vehicleId), [...(m.get(String(l.vehicleId)) ?? []), l]);
    return m;
  }, [logs]);

  const archivedCount = vehicles.filter((v) => v.archived).length;
  const shown = vehicles.filter((v) => showArchived || !v.archived);

  async function removeVehicle(v: VehicleRow) {
    if (!(await confirm({ title: t('veh.deleteTitle'), message: t('veh.confirmDelete'), confirmLabel: t('common.delete'), danger: true }))) return;
    startTransition(async () => { await deleteVehicle(v._id); });
  }
  async function removeLog(id: string) {
    if (!(await confirm({ title: t('veh.deleteLogTitle'), message: t('common.movesToTrash'), confirmLabel: t('common.delete'), danger: true }))) return;
    startTransition(async () => { await deleteVehicleLog(id); });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('veh.title')} count={shown.length} subtitle={t('veh.subtitle')}>
        {archivedCount > 0 && (
          <HeaderButton icon={<Archive size={14} />} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t('common.hideArchived') : t('common.showArchived', { n: archivedCount })}
          </HeaderButton>
        )}
        <PrimaryAction onClick={() => setEditing('new')} />
      </PageHeader>

      {shown.length === 0 ? (
        <EmptyState icon={<Car />} title={t('veh.empty')} />
      ) : (
        <div className="space-y-4">
          {shown.map((v) => {
            const vLogs = logsByVehicle.get(String(v._id)) ?? [];
            const fuel = vLogs.filter((l) => l.kind === 'fuel' && l.odometer !== null).map((l) => ({ ...l, odometer: l.odometer as number }));
            const service = vLogs.filter((l) => l.kind === 'service');
            const stats = vehicleStats(fuel, service);
            const consumptionById = new Map(withFuelConsumption(fuel).map((r) => [String(r._id), r.consumption]));
            const odometer = Math.max(-1, ...vLogs.map((l) => l.odometer ?? -1));
            return (
              <section key={v._id} className={`${card} p-4 ${v.archived ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-lg truncate">
                      {v.name}
                      {v.plate && <span className="ml-2 rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-xs">{v.plate}</span>}
                    </h2>
                    <p className="text-xs text-[color:var(--color-text-dim)]">
                      {[[v.make, v.model, v.year].filter(Boolean).join(' '), v.space, odometer >= 0 ? `${odometer.toLocaleString(locale)} km` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setLogFor({ vehicle: v, kind: 'fuel' })}><Fuel size={14} /> {t('veh.addFuel')}</Button>
                    <Button size="sm" onClick={() => setLogFor({ vehicle: v, kind: 'service' })}><Wrench size={14} /> {t('veh.addService')}</Button>
                    <button aria-label={t('common.edit')} title={t('common.edit')} onClick={() => setEditing(v)} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Pencil size={15} /></button>
                    <button aria-label={v.archived ? t('veh.unarchive') : t('veh.archive')} title={v.archived ? t('veh.unarchive') : t('veh.archive')} onClick={() => startTransition(async () => { await setVehicleArchived(v._id, !v.archived); })} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
                      {v.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                    <button aria-label={t('common.delete')} title={t('common.delete')} onClick={() => removeVehicle(v)} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={15} /></button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {VEHICLE_DUE_KINDS.map((k) => {
                    const at = v[k];
                    if (!at) return null;
                    const days = documentDaysUntilExpiry(at);
                    const tone = days === null ? '' : days < 0 ? 'text-[color:var(--color-red)] border-[color:var(--color-red)]' : leadDays > 0 && days <= leadDays ? 'text-[color:var(--color-orange)] border-[color:var(--color-orange)]' : 'text-[color:var(--color-text-dim)] border-[color:var(--color-border)]';
                    const when = days === null ? '' : days < 0 ? t('veh.overdue', { n: -days }) : days === 0 ? t('veh.today') : t('veh.inDays', { n: days });
                    return (
                      <span key={k} className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>
                        {t(DUE_LABEL[k])}: {formatDate(at, locale)} · {when}
                      </span>
                    );
                  })}
                </div>

                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Stat label={t('veh.avgConsumption')} value={stats.avgConsumption === null ? '–' : `${stats.avgConsumption.toLocaleString(locale)} L/100km`} />
                  <Stat label={t('veh.fuelCost')} value={money(stats.fuelCost)} />
                  <Stat label={t('veh.serviceCost')} value={money(stats.serviceCost)} />
                  <Stat label={t('veh.costPerKm')} value={stats.costPerKm === null ? '–' : money(stats.costPerKm)} />
                </dl>

                {vLogs.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[color:var(--color-text-dim)]">{t('veh.history')} ({vLogs.length})</summary>
                    <div className="mt-2 divide-y divide-[color:var(--color-border)]">
                      {vLogs.map((l) => {
                        const c = consumptionById.get(String(l._id));
                        return (
                          <div key={l._id} className="flex items-center gap-3 py-2">
                            {l.kind === 'fuel' ? <Fuel size={14} className="shrink-0 text-[color:var(--color-accent)]" /> : <Wrench size={14} className="shrink-0 text-[color:var(--color-purple)]" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm truncate">
                                {l.kind === 'fuel' ? `${l.liters.toLocaleString(locale)} L${l.fullTank ? '' : ` (${t('veh.partial')})`}` : l.description}
                                {l.shop ? <span className="text-[color:var(--color-text-dim)]"> · {l.shop}</span> : null}
                              </p>
                              <p className="text-[11px] text-[color:var(--color-text-faint)]">
                                {formatDate(l.date, locale)}
                                {l.odometer !== null ? ` · ${l.odometer.toLocaleString(locale)} km` : ''}
                                {c != null ? ` · ${c.toLocaleString(locale)} L/100km` : ''}
                                {l.expenseId ? ` · ${t('veh.loggedExpense')}` : ''}
                              </p>
                            </div>
                            <span className="font-mono text-sm">{money(l.cost)}</span>
                            <button aria-label={t('common.delete')} title={t('common.delete')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" onClick={() => removeLog(l._id)}><Trash2 size={14} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && <VehicleForm vehicle={editing === 'new' ? null : editing} spaces={spaces} onClose={() => setEditing(null)} />}
      {logFor && <LogForm vehicle={logFor.vehicle} kind={logFor.kind} onClose={() => setLogFor(null)} />}
      {pending && <span className="sr-only">{t('common.saving')}</span>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
      <dt className="text-[color:var(--color-text-faint)]">{label}</dt>
      <dd className="font-mono text-sm mt-0.5">{value}</dd>
    </div>
  );
}

function FormFooter({ error, pending, onClose }: { error: string; pending: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <>
      {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}><X size={14} /> {t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={pending}><Check size={14} /> {pending ? t('common.saving') : t('common.save')}</Button>
      </div>
    </>
  );
}

function VehicleForm({ vehicle, spaces, onClose }: { vehicle: VehicleRow | null; spaces: string[]; onClose: () => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useState<Record<VehicleDueKind, string>>({
    motUntil: dateOnly(vehicle?.motUntil),
    insuranceUntil: dateOnly(vehicle?.insuranceUntil),
    roadTaxUntil: dateOnly(vehicle?.roadTaxUntil),
    emissionsUntil: dateOnly(vehicle?.emissionsUntil),
  });

  function submit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const res = await saveVehicle(formData);
      if (res.ok) onClose();
      else setError(res.error || t('common.failed'));
    });
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? t('veh.edit') : t('veh.add')} size="md">
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
        <p className="text-sm font-semibold pt-1">{t('veh.dates')}</p>
        <div className="grid grid-cols-2 gap-3">
          {VEHICLE_DUE_KINDS.map((k) => (
            <Field key={k} label={t(DUE_LABEL[k])}><DateInput name={k} value={dates[k]} onValueChange={(v) => setDates((d) => ({ ...d, [k]: v }))} /></Field>
          ))}
        </div>
        <Field label={t('veh.notes')}><textarea name="notes" defaultValue={vehicle?.notes} className={controlClass} rows={2} /></Field>
        <FormFooter error={error} pending={pending} onClose={onClose} />
      </form>
    </Modal>
  );
}

function LogForm({ vehicle, kind, onClose }: { vehicle: VehicleRow; kind: 'fuel' | 'service'; onClose: () => void }) {
  const t = useT();
  const [date, setDate] = useState(todayLocal());
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const res = await addVehicleLog(formData);
      if (res.ok) onClose();
      else setError(res.error || t('common.failed'));
    });
  }

  return (
    <Modal open onClose={onClose} title={`${kind === 'fuel' ? t('veh.addFuel') : t('veh.addService')} · ${vehicle.name}`} size="md">
      <form action={submit} className="space-y-3">
        <input type="hidden" name="vehicleId" value={vehicle._id} />
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('veh.date')}><DateInput name="date" required value={date} onValueChange={setDate} /></Field>
          <Field label={t('veh.odometer')}><Input name="odometer" type="number" min="0" step="1" required={kind === 'fuel'} /></Field>
          {kind === 'fuel' && <Field label={t('veh.liters')}><Input name="liters" type="number" min="0" step="any" required /></Field>}
          <Field label={t('veh.cost')}><Input name="cost" type="number" min="0" step="any" /></Field>
          <Field label={kind === 'fuel' ? t('veh.station') : t('veh.garage')} className={kind === 'fuel' ? '' : 'col-span-2'}><Input name="shop" /></Field>
        </div>
        {kind === 'service' && <Field label={t('veh.serviceWhat')}><Input name="description" required placeholder={t('veh.serviceHint')} /></Field>}
        {kind === 'fuel' && <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer"><input type="checkbox" name="fullTank" defaultChecked /> {t('veh.fullTank')}</label>}
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer"><input type="checkbox" name="logExpense" defaultChecked /> {t('veh.logExpense')}</label>
        <FormFooter error={error} pending={pending} onClose={onClose} />
      </form>
    </Modal>
  );
}
