'use client';
import Link from 'next/link';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ArrowLeft, Camera, Car, FileText, Fuel, Loader2, Paperclip, Pencil, Trash2, Upload, Wrench } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { formatMoney } from '@/lib/fx';
import { formatDate } from '@/lib/i18n/format';
import { documentDaysUntilExpiry } from '@/lib/documentExpiry';
import {
  VEHICLE_DUE_KINDS,
  currentOdometer,
  fuelPriceSeries,
  monthlyCosts,
  nextService,
  serviceCostByYear,
  vehicleStats,
  withFuelConsumption,
} from '@/lib/vehicles';
import { cn } from '@/components/ui/cn';
import { deleteVehicle, deleteVehicleDocument, deleteVehicleLog, setVehicleArchived, setVehiclePhoto, uploadVehicleDocuments } from './actions';
import { LogForm } from './LogForm';
import { VehicleForm } from './VehicleForm';
import { FuelPriceChart, MonthlyCostChart } from './VehicleCharts';
import { DUE_LABEL, DueChip, FUEL_LABEL, ServiceChip, Stat, card, fileUrl, type LogRow, type VehicleRow } from './shared';

const TABS = ['overview', 'fuel', 'service', 'documents', 'costs'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL = { overview: 'veh.tabOverview', fuel: 'veh.tabFuel', service: 'veh.tabService', documents: 'veh.tabDocuments', costs: 'veh.tabCosts' } as const;

export function VehicleDetailClient({
  vehicle,
  logs,
  spaces,
  currency,
  leadDays,
  scanEnabled,
}: {
  vehicle: VehicleRow;
  logs: LogRow[];
  spaces: string[];
  currency: string;
  leadDays: number;
  scanEnabled: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const money = (n: number) => formatMoney(n, currency, locale);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [logForm, setLogForm] = useState<{ kind: 'fuel' | 'service'; log?: LogRow } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  const fuel = useMemo(() => logs.filter((l) => l.kind === 'fuel'), [logs]);
  const service = useMemo(() => logs.filter((l) => l.kind === 'service'), [logs]);
  const measured = useMemo(() => fuel.filter((l) => l.odometer !== null).map((l) => ({ ...l, odometer: l.odometer as number })), [fuel]);
  const stats = vehicleStats(measured, service);
  const consumptionById = new Map(withFuelConsumption(measured).map((r) => [String(r._id), r.consumption]));
  const odometer = currentOdometer(logs, vehicle.purchaseOdometer);
  const next = nextService(vehicle, service, odometer);
  const months = monthlyCosts(logs);
  const perYear = serviceCostByYear(logs);
  const prices = fuelPriceSeries(logs);
  const monthlyAvg = months.length ? (months.reduce((s, m) => s + m.fuel + m.service, 0) / months.length) : null;

  // The soonest thing that is due, for the header line.
  const soonest = [
    ...VEHICLE_DUE_KINDS.filter((k) => vehicle[k]).map((k) => ({ label: t(DUE_LABEL[k]), days: documentDaysUntilExpiry(vehicle[k] as string) ?? Infinity })),
    ...(next.daysLeft !== null ? [{ label: t('veh.nextService'), days: next.daysLeft }] : []),
  ].sort((a, b) => a.days - b.days)[0] ?? null;

  function run(job: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    startTransition(async () => {
      const r = await job();
      if (!r.ok) setError(r.error || t('common.failed'));
    });
  }
  async function removeVehicle() {
    if (!(await confirm({ title: t('veh.deleteTitle'), message: t('veh.confirmDelete'), confirmLabel: t('common.delete'), danger: true }))) return;
    startTransition(async () => {
      await deleteVehicle(vehicle._id);
      router.push('/vehicles');
    });
  }
  async function removeLog(id: string) {
    if (!(await confirm({ title: t('veh.deleteLogTitle'), message: t('common.movesToTrash'), confirmLabel: t('common.delete'), danger: true }))) return;
    run(() => deleteVehicleLog(id));
  }
  function uploadPhoto(file: File) {
    const fd = new FormData();
    fd.set('file', file);
    run(() => setVehiclePhoto(vehicle._id, fd));
  }

  const subtitle = [[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '), vehicle.space, odometer !== null ? `${odometer.toLocaleString(locale)} km` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <main className={PAGE_MAIN}>
      <Link href="/vehicles" className="inline-flex items-center gap-1 text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] mb-3">
        <ArrowLeft size={13} /> {t('veh.title')}
      </Link>

      <PageHeader title={vehicle.name} count={vehicle.plate || undefined} subtitle={subtitle || undefined}>
        <Button size="sm" onClick={() => setLogForm({ kind: 'fuel' })}><Fuel size={14} /> {t('veh.addFuel')}</Button>
        <Button size="sm" onClick={() => setLogForm({ kind: 'service' })}><Wrench size={14} /> {t('veh.addService')}</Button>
        <IconButton label={t('veh.edit')} onClick={() => setEditing(true)}><Pencil size={15} /></IconButton>
        <IconButton label={vehicle.archived ? t('veh.unarchive') : t('veh.archive')} onClick={() => run(() => setVehicleArchived(vehicle._id, !vehicle.archived))}>
          {vehicle.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </IconButton>
        <IconButton label={t('veh.deleteTitle')} danger onClick={removeVehicle}><Trash2 size={15} /></IconButton>
      </PageHeader>

      <div className={cn(card, 'p-4 flex flex-col sm:flex-row gap-4', vehicle.archived && 'opacity-70')}>
        <button type="button" onClick={() => photoRef.current?.click()} className="group relative shrink-0 w-full sm:w-40 h-32 rounded-xl overflow-hidden bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] flex items-center justify-center" aria-label={vehicle.photoPath ? t('veh.changePhoto') : t('veh.addPhoto')}>
          {vehicle.photoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(vehicle.photoPath)} alt={vehicle.name} className="w-full h-full object-cover" />
          ) : (
            <Car size={36} className="text-[color:var(--color-text-faint)]" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[11px] py-1 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
            <Camera size={12} /> {vehicle.photoPath ? t('veh.changePhoto') : t('veh.addPhoto')}
          </span>
        </button>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPhoto(f); }} />
        <div className="min-w-0 flex-1 space-y-3">
          {soonest && Number.isFinite(soonest.days) && (
            <p className="text-sm">
              <span className="text-[color:var(--color-text-faint)]">{t('veh.nextDue')}:</span>{' '}
              <span className={soonest.days < 0 ? 'text-[color:var(--color-red)]' : leadDays > 0 && soonest.days <= leadDays ? 'text-[color:var(--color-orange)]' : ''}>
                {soonest.label} · {soonest.days < 0 ? t('veh.overdue', { n: -soonest.days }) : soonest.days === 0 ? t('veh.today') : t('veh.inDays', { n: soonest.days })}
              </span>
            </p>
          )}
          <DueList vehicle={vehicle} next={next} leadDays={leadDays} />
          {error && <p role="alert" className="text-xs text-[color:var(--color-red)]">{error}</p>}
        </div>
      </div>

      <div role="tablist" aria-label={vehicle.name} className="mt-4 flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)]">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            id={`veh-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`veh-panel-${k}`}
            onClick={() => setTab(k)}
            className={cn(
              'shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              tab === k ? 'border-[color:var(--color-accent)] text-[color:var(--color-text)]' : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
          >
            {t(TAB_LABEL[k])}
            {k === 'fuel' && fuel.length > 0 && <span className="ml-1 text-[color:var(--color-text-faint)]">{fuel.length}</span>}
            {k === 'service' && service.length > 0 && <span className="ml-1 text-[color:var(--color-text-faint)]">{service.length}</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`veh-panel-${tab}`} aria-labelledby={`veh-tab-${tab}`} className="mt-4 space-y-4">
        {tab === 'overview' && (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <Stat label={t('veh.odometerNow')} value={odometer === null ? '–' : `${odometer.toLocaleString(locale)} km`} />
              <Stat label={t('veh.avgConsumption')} value={stats.avgConsumption === null ? '–' : `${stats.avgConsumption.toLocaleString(locale)} L/100km`} />
              <Stat label={t('veh.fuelCost')} value={money(stats.fuelCost)} />
              <Stat label={t('veh.serviceCost')} value={money(stats.serviceCost)} />
              <Stat label={t('veh.costPerKm')} value={stats.costPerKm === null ? '–' : money(stats.costPerKm)} />
              <Stat label={t('veh.monthlyAvg')} value={monthlyAvg === null ? '–' : money(monthlyAvg)} />
            </dl>
            <Specs vehicle={vehicle} money={money} />
            {logs.length > 0 && (
              <div className={cn(card, 'p-4')}>
                <h2 className="text-sm font-semibold mb-2">{t('veh.recent')}</h2>
                <LogList logs={logs.slice(0, 5)} consumptionById={consumptionById} money={money} onEdit={(l) => setLogForm({ kind: l.kind, log: l })} onDelete={removeLog} />
              </div>
            )}
          </>
        )}

        {tab === 'fuel' && (
          fuel.length === 0
            ? <EmptyState icon={<Fuel />} title={t('veh.noFuel')} />
            : <div className={cn(card, 'p-4')}><LogList logs={fuel} consumptionById={consumptionById} money={money} onEdit={(l) => setLogForm({ kind: 'fuel', log: l })} onDelete={removeLog} /></div>
        )}

        {tab === 'service' && (
          <>
            {(next.dueDate || next.dueKm !== null) && <div className="flex flex-wrap gap-2"><ServiceChip next={next} leadDays={leadDays} /></div>}
            {service.length === 0
              ? <EmptyState icon={<Wrench />} title={t('veh.noService')} />
              : <div className={cn(card, 'p-4')}><LogList logs={service} consumptionById={consumptionById} money={money} onEdit={(l) => setLogForm({ kind: 'service', log: l })} onDelete={removeLog} /></div>}
          </>
        )}

        {tab === 'documents' && (
          <>
            <DueList vehicle={vehicle} next={next} leadDays={leadDays} />
            <Documents vehicle={vehicle} onError={setError} />
          </>
        )}

        {tab === 'costs' && (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label={t('veh.costPerKm')} value={stats.costPerKm === null ? '–' : money(stats.costPerKm)} />
              <Stat label={t('veh.monthlyAvg')} value={monthlyAvg === null ? '–' : money(monthlyAvg)} />
              <Stat label={t('veh.distance')} value={stats.distance ? `${stats.distance.toLocaleString(locale)} km` : '–'} />
              <Stat label={t('veh.totalSpent')} value={money(stats.fuelCost + stats.serviceCost)} />
            </dl>
            <div className={cn(card, 'p-4')}>
              <h2 className="text-sm font-semibold mb-2">{t('veh.chartFuelPrice')}</h2>
              <FuelPriceChart series={prices} money={money} />
            </div>
            <div className={cn(card, 'p-4')}>
              <h2 className="text-sm font-semibold mb-2">{t('veh.chartMonthly')}</h2>
              <MonthlyCostChart rows={months} money={money} />
            </div>
            {perYear.length > 0 && (
              <div className={cn(card, 'p-4')}>
                <h2 className="text-sm font-semibold mb-2">{t('veh.servicePerYear')}</h2>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-[color:var(--color-border)]">
                    {perYear.map((y) => (
                      <tr key={y.year}><td className="py-1.5">{y.year}</td><td className="py-1.5 text-right font-mono">{money(y.cost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {editing && <VehicleForm vehicle={vehicle} spaces={spaces} onClose={() => setEditing(false)} />}
      {logForm && <LogForm vehicle={vehicle} kind={logForm.kind} log={logForm.log} scanEnabled={scanEnabled} onClose={() => setLogForm(null)} />}
      {pending && <span className="sr-only" role="status">{t('common.saving')}</span>}
    </main>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn('p-1.5 rounded-lg text-[color:var(--color-text-faint)]', danger ? 'hover:text-[color:var(--color-red)]' : 'hover:text-[color:var(--color-text)]')}>
      {children}
    </button>
  );
}

function DueList({ vehicle, next, leadDays }: { vehicle: VehicleRow; next: ReturnType<typeof nextService>; leadDays: number }) {
  const t = useT();
  const chips = VEHICLE_DUE_KINDS.filter((k) => vehicle[k]);
  if (!chips.length && !next.dueDate && next.dueKm === null) return <p className="text-xs text-[color:var(--color-text-faint)]">{t('veh.noDates')}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <ServiceChip next={next} leadDays={leadDays} />
      {chips.map((k) => <DueChip key={k} label={t(DUE_LABEL[k])} at={vehicle[k] as string} leadDays={leadDays} />)}
    </div>
  );
}

/** The car's details, only the ones that are filled in. */
function Specs({ vehicle: v, money }: { vehicle: VehicleRow; money: (n: number) => string }) {
  const t = useT();
  const locale = useLocale();
  const rows: [string, string][] = [];
  const add = (label: string, value: string | number | null | undefined, unit = '') => {
    if (value === null || value === undefined || value === '') return;
    rows.push([label, `${typeof value === 'number' ? value.toLocaleString(locale) : value}${unit}`]);
  };
  add(t('veh.fuelType'), v.fuelType ? t(FUEL_LABEL[v.fuelType as keyof typeof FUEL_LABEL]) : '');
  add(t('veh.vin'), v.vin);
  add(t('veh.engineCc'), v.engineCc, ' cc');
  add(t('veh.powerKw'), v.powerKw, ' kW');
  add(t('veh.transmission'), v.transmission ? t(v.transmission === 'manual' ? 'veh.manual' : 'veh.automatic') : '');
  add(t('veh.color'), v.color);
  add(t('veh.firstRegistration'), v.firstRegistration ? formatDate(v.firstRegistration, locale) : '');
  add(t('veh.tankCapacity'), v.tankCapacity, v.fuelType === 'electric' ? ' kWh' : ' L');
  add(t('veh.tyreSize'), v.tyreSize);
  add(t('veh.tyrePressure'), v.tyrePressure);
  add(t('veh.oilType'), v.oilType);
  add(t('veh.oilCapacity'), v.oilCapacity, ' L');
  if (v.serviceIntervalKm || v.serviceIntervalMonths) {
    rows.push([t('veh.serviceInterval'), [v.serviceIntervalKm ? `${v.serviceIntervalKm.toLocaleString(locale)} km` : '', v.serviceIntervalMonths ? t('veh.everyMonths', { n: v.serviceIntervalMonths }) : ''].filter(Boolean).join(' / ')]);
  }
  add(t('veh.purchaseDate'), v.purchaseDate ? formatDate(v.purchaseDate, locale) : '');
  add(t('veh.purchasePrice'), v.purchasePrice != null ? money(v.purchasePrice) : '');
  add(t('veh.purchaseSeller'), v.purchaseSeller);
  add(t('veh.purchaseOdometer'), v.purchaseOdometer, ' km');
  add(t('veh.insurer'), v.insurer);
  add(t('veh.policyNumber'), v.policyNumber);
  add(t('veh.coverType'), v.coverType);
  add(t('veh.insuranceYearlyCost'), v.insuranceYearlyCost != null ? money(v.insuranceYearlyCost) : '');
  if (!rows.length && !v.notes) return null;
  return (
    <div className={cn(card, 'p-4')}>
      <h2 className="text-sm font-semibold mb-2">{t('veh.details')}</h2>
      {rows.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-3 min-w-0 border-b border-[color:var(--color-border)] py-1">
              <dt className="text-[color:var(--color-text-faint)] shrink-0">{k}</dt>
              <dd className="font-medium truncate text-right">{val}</dd>
            </div>
          ))}
        </dl>
      )}
      {v.notes && <p className="mt-3 text-sm text-[color:var(--color-text-dim)] whitespace-pre-wrap">{v.notes}</p>}
    </div>
  );
}

function LogList({
  logs,
  consumptionById,
  money,
  onEdit,
  onDelete,
}: {
  logs: LogRow[];
  consumptionById: Map<string, number | null>;
  money: (n: number) => string;
  onEdit: (l: LogRow) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <ul className="divide-y divide-[color:var(--color-border)]">
      {logs.map((l) => {
        const c = consumptionById.get(String(l._id));
        const ppl = l.pricePerLiter ?? (l.liters > 0 && l.cost > 0 ? l.cost / l.liters : null);
        return (
          <li key={l._id} className="flex items-start gap-3 py-2">
            {l.kind === 'fuel' ? <Fuel size={14} className="mt-1 shrink-0 text-[color:var(--color-accent)]" /> : <Wrench size={14} className="mt-1 shrink-0 text-[color:var(--color-purple)]" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">
                {l.kind === 'fuel' ? `${l.liters.toLocaleString(locale)} L${l.fullTank ? '' : ` (${t('veh.partial')})`}` : l.description}
                {l.shop ? <span className="text-[color:var(--color-text-dim)]"> · {l.shop}</span> : null}
              </p>
              <p className="text-[11px] text-[color:var(--color-text-faint)]">
                {formatDate(l.date, locale)}
                {l.odometer !== null ? ` · ${l.odometer.toLocaleString(locale)} km` : ''}
                {c != null ? ` · ${c.toLocaleString(locale)} L/100km` : ''}
                {l.kind === 'fuel' && ppl ? ` · ${money(ppl)}/L` : ''}
                {l.expenseId ? ` · ${t('veh.loggedExpense')}` : ''}
              </p>
              {l.kind === 'service' && l.items && l.items.length > 0 && (
                <ul className="mt-1 text-[11px] text-[color:var(--color-text-dim)] space-y-0.5">
                  {l.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2"><span className="truncate">{it.description}</span><span className="font-mono">{money(it.cost)}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <span className="font-mono text-sm">{money(l.cost)}</span>
            {l.filePath && (
              <a href={fileUrl(l.filePath)} target="_blank" rel="noopener noreferrer" aria-label={t('veh.keptFile')} title={t('veh.keptFile')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]"><Paperclip size={14} /></a>
            )}
            <button type="button" aria-label={t('veh.editEntry')} title={t('veh.editEntry')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]" onClick={() => onEdit(l)}><Pencil size={14} /></button>
            <button type="button" aria-label={t('veh.deleteLogTitle')} title={t('veh.deleteLogTitle')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" onClick={() => onDelete(l._id)}><Trash2 size={14} /></button>
          </li>
        );
      })}
    </ul>
  );
}

/** Registration certificate, insurance card, inspection report... */
function Documents({ vehicle, onError }: { vehicle: VehicleRow; onError: (e: string) => void }) {
  const t = useT();
  const confirm = useConfirm();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const docs = vehicle.attachments ?? [];

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    startTransition(async () => {
      const r = await uploadVehicleDocuments(vehicle._id, fd);
      if (!r.ok) onError(r.error || t('common.failed'));
    });
  }
  async function remove(path: string) {
    if (!(await confirm({ title: t('veh.deleteDocTitle'), message: t('veh.deleteDocBody'), confirmLabel: t('common.delete'), danger: true }))) return;
    startTransition(async () => {
      const r = await deleteVehicleDocument(vehicle._id, path);
      if (!r.ok) onError(r.error || t('common.failed'));
    });
  }

  return (
    <div className={cn(card, 'p-4 space-y-3')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('veh.documents')}</h2>
        <Button size="sm" onClick={() => ref.current?.click()} disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {t('veh.uploadDocs')}
        </Button>
        <input ref={ref} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('veh.documentsHint')}</p>
      {docs.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">{t('veh.noDocs')}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-border)]">
          {docs.map((d) => (
            <li key={d.path} className="flex items-center gap-2 py-2">
              <FileText size={14} className="shrink-0 text-[color:var(--color-text-faint)]" />
              <a href={fileUrl(d.path)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">{d.name || d.path.split('/').pop()}</a>
              <button type="button" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => remove(d.path)} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
