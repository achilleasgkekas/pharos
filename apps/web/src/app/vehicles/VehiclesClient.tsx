'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Car, ChevronRight } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PAGE_MAIN, PageHeader, HeaderButton, PrimaryAction } from '@/components/ui/PageHeader';
import { formatMoney } from '@/lib/fx';
import { documentDaysUntilExpiry } from '@/lib/documentExpiry';
import { VEHICLE_DUE_KINDS, currentOdometer, nextService, vehicleStats } from '@/lib/vehicles';
import { cn } from '@/components/ui/cn';
import { VehicleForm } from './VehicleForm';
import { DUE_LABEL, dueTone, card, fileUrl, useWhen, type LogRow, type VehicleRow } from './shared';

export type { LogRow, VehicleRow } from './shared';

/**
 * The vehicles overview (#363): one compact card per vehicle with the figures that matter at a
 * glance. Everything else (logs, documents, costs, editing) lives on /vehicles/[id].
 */
export function VehiclesClient({ vehicles, logs, spaces, currency, leadDays }: { vehicles: VehicleRow[]; logs: LogRow[]; spaces: string[]; currency: string; leadDays: number }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const when = useWhen();
  const money = (n: number) => formatMoney(n, currency, locale);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const logsByVehicle = useMemo(() => {
    const m = new Map<string, LogRow[]>();
    for (const l of logs) m.set(String(l.vehicleId), [...(m.get(String(l.vehicleId)) ?? []), l]);
    return m;
  }, [logs]);

  const archivedCount = vehicles.filter((v) => v.archived).length;
  const shown = vehicles.filter((v) => showArchived || !v.archived);

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('veh.title')} count={shown.length} subtitle={t('veh.subtitle')}>
        {archivedCount > 0 && (
          <HeaderButton icon={<Archive size={14} />} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t('common.hideArchived') : t('common.showArchived', { n: archivedCount })}
          </HeaderButton>
        )}
        <PrimaryAction onClick={() => setAdding(true)} />
      </PageHeader>

      {shown.length === 0 ? (
        <EmptyState icon={<Car />} title={t('veh.empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => {
            const vLogs = logsByVehicle.get(String(v._id)) ?? [];
            const fuel = vLogs.filter((l) => l.kind === 'fuel' && l.odometer !== null).map((l) => ({ ...l, odometer: l.odometer as number }));
            const service = vLogs.filter((l) => l.kind === 'service');
            const stats = vehicleStats(fuel, service);
            const odometer = currentOdometer(vLogs, v.purchaseOdometer);
            const next = nextService(v, service, odometer);
            const due = [
              ...VEHICLE_DUE_KINDS.filter((k) => v[k]).map((k) => ({ label: t(DUE_LABEL[k]), days: documentDaysUntilExpiry(v[k] as string) })),
              ...(next.daysLeft !== null ? [{ label: t('veh.nextService'), days: next.daysLeft }] : []),
            ].sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity))[0];
            const serviceByKm = next.kmLeft !== null && next.kmLeft <= 1000;
            return (
              <li key={v._id}>
                <Link href={`/vehicles/${v._id}`} className={cn(card, 'group flex gap-3 p-3 hover:border-[color:var(--color-accent)] transition-colors', v.archived && 'opacity-60')}>
                  <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-[color:var(--color-surface-2)] flex items-center justify-center">
                    {v.photoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(v.photoPath)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Car size={26} className="text-[color:var(--color-text-faint)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {v.name}
                      {v.plate && <span className="ml-2 rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[11px] font-normal">{v.plate}</span>}
                    </p>
                    <p className="text-xs text-[color:var(--color-text-dim)] truncate">
                      {[[v.make, v.model, v.year].filter(Boolean).join(' '), odometer !== null ? `${odometer.toLocaleString(locale)} km` : ''].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-[11px] text-[color:var(--color-text-faint)] truncate">
                      {[stats.avgConsumption !== null ? `${stats.avgConsumption.toLocaleString(locale)} L/100km` : '', stats.costPerKm !== null ? `${money(stats.costPerKm)}/km` : ''].filter(Boolean).join(' · ') || t('veh.noLogsYet')}
                    </p>
                    {(due || serviceByKm) && (
                      <p className={cn('mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[11px]', serviceByKm ? dueTone(next.kmLeft! < 0 ? -1 : 0, leadDays) : dueTone(due?.days ?? null, leadDays))}>
                        {serviceByKm
                          ? `${t('veh.nextService')} · ${next.kmLeft! < 0 ? t('veh.kmOver', { km: (-next.kmLeft!).toLocaleString(locale) }) : t('veh.kmLeft', { km: next.kmLeft!.toLocaleString(locale) })}`
                          : `${due!.label} · ${when(due!.days)}`}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="self-center shrink-0 text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-accent)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {adding && <VehicleForm vehicle={null} spaces={spaces} onClose={() => setAdding(false)} onSaved={(id) => router.push(`/vehicles/${id}`)} />}
    </main>
  );
}
