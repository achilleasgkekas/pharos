'use client';
import { useMemo, useState, useTransition } from 'react';
import { Archive, ArchiveRestore, Car, Fuel, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { DateInput } from '@/components/ui/DateInput';
import { formatMoney } from '@/lib/fx';
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

const input = 'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';
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

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-6 pb-24">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <Car className="text-[color:var(--color-accent)]" /> {t('veh.title')}
          </h1>
          <p className="text-xs text-[color:var(--color-text-dim)] mt-1">{t('veh.subtitle')}</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-[color:var(--color-accent)] text-black px-3 py-2 text-sm font-semibold shrink-0">
          <Plus size={16} /> {t('veh.add')}
        </button>
      </div>

      {archivedCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-dim)] mb-3">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t('veh.showArchived')} ({archivedCount})
        </label>
      )}

      {shown.length === 0 ? (
        <p className={`${card} p-10 text-center text-sm text-[color:var(--color-text-dim)]`}>{t('veh.empty')}</p>
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
                      {[v.make, v.model, v.year].filter(Boolean).join(' ')}
                      {v.space ? ` · ${v.space}` : ''}
                      {odometer >= 0 ? ` · ${odometer.toLocaleString(locale)} km` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setLogFor({ vehicle: v, kind: 'fuel' })} className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-2.5 py-1.5 text-xs"><Fuel size={14} /> {t('veh.addFuel')}</button>
                    <button onClick={() => setLogFor({ vehicle: v, kind: 'service' })} className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-2.5 py-1.5 text-xs"><Wrench size={14} /> {t('veh.addService')}</button>
                    <button aria-label={t('common.edit')} onClick={() => setEditing(v)} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"><Pencil size={15} /></button>
                    <button aria-label={v.archived ? t('veh.unarchive') : t('veh.archive')} title={v.archived ? t('veh.unarchive') : t('veh.archive')} onClick={() => startTransition(async () => { await setVehicleArchived(v._id, !v.archived); })} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
                      {v.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                    <button aria-label={t('common.delete')} onClick={() => { if (confirm(t('veh.confirmDelete'))) startTransition(async () => { await deleteVehicle(v._id); }); }} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={15} /></button>
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
                        {t(DUE_LABEL[k])}: {new Date(at).toLocaleDateString(locale)} · {when}
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
                                {new Date(l.date).toLocaleDateString(locale)}
                                {l.odometer !== null ? ` · ${l.odometer.toLocaleString(locale)} km` : ''}
                                {c != null ? ` · ${c.toLocaleString(locale)} L/100km` : ''}
                                {l.expenseId ? ` · ${t('veh.loggedExpense')}` : ''}
                              </p>
                            </div>
                            <span className="font-mono text-sm">{money(l.cost)}</span>
                            <button aria-label={t('common.delete')} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" onClick={() => startTransition(async () => { await deleteVehicleLog(l._id); })}><Trash2 size={14} /></button>
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4 overflow-y-auto" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={`w-full max-w-lg ${card} p-5`}>
        <div className="flex justify-between mb-3"><h2 className="font-semibold">{title}</h2><button type="button" onClick={onClose}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function FormFooter({ error, pending, onClose }: { error: string; pending: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <>
      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm">{t('common.cancel')}</button>
        <button disabled={pending} className="rounded-lg bg-[color:var(--color-accent)] text-black px-4 py-2 text-sm font-semibold">{pending ? t('common.saving') : t('common.save')}</button>
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
    <Modal title={vehicle ? t('veh.edit') : t('veh.add')} onClose={onClose}>
      <form action={submit} className="space-y-3">
        {vehicle && <input type="hidden" name="id" value={vehicle._id} />}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">{t('veh.name')}<input name="name" required defaultValue={vehicle?.name} className={input} placeholder={t('veh.nameHint')} /></label>
          <label className="block text-xs">{t('veh.plate')}<input name="plate" defaultValue={vehicle?.plate} className={input} /></label>
          <label className="block text-xs">{t('veh.make')}<input name="make" defaultValue={vehicle?.make} className={input} /></label>
          <label className="block text-xs">{t('veh.model')}<input name="model" defaultValue={vehicle?.model} className={input} /></label>
          <label className="block text-xs">{t('veh.year')}<input name="year" type="number" min="1900" max="2100" defaultValue={vehicle?.year ?? ''} className={input} /></label>
          <label className="block text-xs">{t('veh.space')}<input name="space" list="vehicle-spaces" defaultValue={vehicle?.space} className={input} /><datalist id="vehicle-spaces">{spaces.map((s) => <option key={s} value={s} />)}</datalist></label>
        </div>
        <p className="text-xs font-semibold pt-1">{t('veh.dates')}</p>
        <div className="grid grid-cols-2 gap-3">
          {VEHICLE_DUE_KINDS.map((k) => (
            <label key={k} className="block text-xs">{t(DUE_LABEL[k])}<DateInput name={k} value={dates[k]} onValueChange={(v) => setDates((d) => ({ ...d, [k]: v }))} className={input} /></label>
          ))}
        </div>
        <label className="block text-xs">{t('veh.notes')}<textarea name="notes" defaultValue={vehicle?.notes} className={input} rows={2} /></label>
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
    <Modal title={`${kind === 'fuel' ? t('veh.addFuel') : t('veh.addService')} · ${vehicle.name}`} onClose={onClose}>
      <form action={submit} className="space-y-3">
        <input type="hidden" name="vehicleId" value={vehicle._id} />
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">{t('veh.date')}<DateInput name="date" required value={date} onValueChange={setDate} className={input} /></label>
          <label className="block text-xs">{t('veh.odometer')}<input name="odometer" type="number" min="0" step="1" required={kind === 'fuel'} className={input} /></label>
          {kind === 'fuel' && <label className="block text-xs">{t('veh.liters')}<input name="liters" type="number" min="0" step="any" required className={input} /></label>}
          <label className="block text-xs">{t('veh.cost')}<input name="cost" type="number" min="0" step="any" className={input} /></label>
          <label className={`block text-xs ${kind === 'fuel' ? '' : 'col-span-2'}`}>{kind === 'fuel' ? t('veh.station') : t('veh.garage')}<input name="shop" className={input} /></label>
        </div>
        {kind === 'service' && <label className="block text-xs">{t('veh.serviceWhat')}<input name="description" required className={input} placeholder={t('veh.serviceHint')} /></label>}
        {kind === 'fuel' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="fullTank" defaultChecked /> {t('veh.fullTank')}</label>}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="logExpense" defaultChecked /> {t('veh.logExpense')}</label>
        <FormFooter error={error} pending={pending} onClose={onClose} />
      </form>
    </Modal>
  );
}
