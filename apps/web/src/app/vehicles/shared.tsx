'use client';
// Shared vehicle UI bits (#363): row types as the pages serialize them, labels, small widgets.
import { useLocale, useT } from '@/components/LocaleProvider';
import { formatDate } from '@/lib/i18n/format';
import { documentDaysUntilExpiry } from '@/lib/documentExpiry';
import type { TKey } from '@/lib/i18n';
import type { NextService, VehicleDueKind, VehicleFuelType } from '@/lib/vehicles';

export type VehicleAttachment = { path: string; name?: string; mimeType?: string; size?: number; uploadedAt?: string };

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
  photoPath?: string;
  vin?: string;
  fuelType?: VehicleFuelType;
  engineCc?: number | null;
  powerKw?: number | null;
  transmission?: '' | 'manual' | 'automatic';
  color?: string;
  firstRegistration?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  purchaseSeller?: string;
  purchaseOdometer?: number | null;
  tankCapacity?: number | null;
  tyreSize?: string;
  tyrePressure?: string;
  oilType?: string;
  oilCapacity?: number | null;
  serviceIntervalKm?: number | null;
  serviceIntervalMonths?: number | null;
  insurer?: string;
  policyNumber?: string;
  coverType?: string;
  insuranceYearlyCost?: number | null;
  attachments?: VehicleAttachment[];
} & Partial<Record<VehicleDueKind, string | null>>;

export type LogItem = { description: string; kind: 'part' | 'labor' | 'other'; cost: number };

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
  pricePerLiter?: number | null;
  fuelType?: string;
  filePath?: string;
  items?: LogItem[];
  nextServiceKm?: number | null;
  nextServiceDate?: string | null;
};

export const card = 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl';

export const DUE_LABEL: Record<VehicleDueKind, TKey> = {
  motUntil: 'veh.mot',
  insuranceUntil: 'veh.insurance',
  roadTaxUntil: 'veh.roadTax',
  emissionsUntil: 'veh.emissions',
  tyreChangeUntil: 'veh.tyreChange',
  batteryUntil: 'veh.battery',
};

export const FUEL_LABEL: Record<Exclude<VehicleFuelType, ''>, TKey> = {
  petrol: 'veh.fuelPetrol',
  diesel: 'veh.fuelDiesel',
  lpg: 'veh.fuelLpg',
  cng: 'veh.fuelCng',
  hybrid: 'veh.fuelHybrid',
  phev: 'veh.fuelPhev',
  electric: 'veh.fuelElectric',
};

export const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

export function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}

/** Colour for a date that lapses: red when past, orange inside the lead time. */
export function dueTone(days: number | null, leadDays: number): string {
  if (days === null) return 'text-[color:var(--color-text-dim)] border-[color:var(--color-border)]';
  if (days < 0) return 'text-[color:var(--color-red)] border-[color:var(--color-red)]';
  if (leadDays > 0 && days <= leadDays) return 'text-[color:var(--color-orange)] border-[color:var(--color-orange)]';
  return 'text-[color:var(--color-text-dim)] border-[color:var(--color-border)]';
}

export function useWhen() {
  const t = useT();
  return (days: number | null) => (days === null ? '' : days < 0 ? t('veh.overdue', { n: -days }) : days === 0 ? t('veh.today') : t('veh.inDays', { n: days }));
}

/** One "MOT: 12/03/2027 · in 40d" chip. */
export function DueChip({ label, at, leadDays }: { label: string; at: string; leadDays: number }) {
  const locale = useLocale();
  const when = useWhen();
  const days = documentDaysUntilExpiry(at);
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${dueTone(days, leadDays)}`}>
      {label}: {formatDate(at, locale)} · {when(days)}
    </span>
  );
}

/** "Service: 15/04/2027 · in 40d · or at 120,000 km (in 2,300 km)". Null when nothing is set. */
export function ServiceChip({ next, leadDays }: { next: NextService; leadDays: number }) {
  const t = useT();
  const locale = useLocale();
  const when = useWhen();
  if (!next.dueDate && next.dueKm === null) return null;
  const kmNear = next.kmLeft !== null && next.kmLeft <= 1000;
  const tone = next.kmLeft !== null && next.kmLeft < 0 ? dueTone(-1, leadDays) : kmNear ? dueTone(0, leadDays) : dueTone(next.daysLeft, leadDays);
  const parts: string[] = [];
  if (next.dueDate) parts.push(`${formatDate(next.dueDate, locale)} · ${when(next.daysLeft)}`);
  if (next.dueKm !== null) {
    const km = `${next.dueKm.toLocaleString(locale)} km`;
    const left = next.kmLeft === null ? '' : next.kmLeft < 0 ? ` (${t('veh.kmOver', { km: (-next.kmLeft).toLocaleString(locale) })})` : ` (${t('veh.kmLeft', { km: next.kmLeft.toLocaleString(locale) })})`;
    parts.push(`${km}${left}`);
  }
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>
      {t('veh.nextService')}: {parts.join(` ${t('veh.orAt')} `)}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 min-w-0">
      <dt className="text-[color:var(--color-text-faint)] truncate">{label}</dt>
      <dd className="font-mono text-sm mt-0.5 truncate">{value}</dd>
    </div>
  );
}
