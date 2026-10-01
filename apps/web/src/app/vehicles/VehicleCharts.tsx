'use client';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLocale, useT } from '@/components/LocaleProvider';
import { formatDate } from '@/lib/i18n/format';

const tooltipStyle = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--color-text)',
};
const axis = { stroke: 'var(--color-text-faint)', fontSize: 11 };

/** Price per litre of each fill over time (#363). Needs two fills to say anything. */
export function FuelPriceChart({ series, money }: { series: { date: string; price: number }[]; money: (n: number) => string }) {
  const locale = useLocale();
  const t = useT();
  if (series.length < 2) return <p className="text-xs text-[color:var(--color-text-faint)]">{t('veh.chartNeedsTwo')}</p>;
  return (
    <div className="h-56" role="img" aria-label={t('veh.chartFuelPrice')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => formatDate(d, locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })} minTickGap={24} />
          <YAxis {...axis} width={52} domain={['auto', 'auto']} tickFormatter={(n: number) => n.toFixed(2)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatDate(String(d), locale, { timeZone: 'UTC' })} formatter={(n) => [money(Number(n)), t('veh.pricePerLiter')]} />
          <Line type="monotone" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Fuel and service spend per month, stacked (#363). */
export function MonthlyCostChart({ rows, money }: { rows: { month: string; fuel: number; service: number }[]; money: (n: number) => string }) {
  const locale = useLocale();
  const t = useT();
  if (!rows.length) return <p className="text-xs text-[color:var(--color-text-faint)]">{t('veh.noCosts')}</p>;
  return (
    <div className="h-56" role="img" aria-label={t('veh.chartMonthly')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" {...axis} tickFormatter={(m: string) => formatDate(`${m}-01`, locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })} minTickGap={16} />
          <YAxis {...axis} width={52} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-surface-2)' }} formatter={(n, name) => [money(Number(n)), name === 'fuel' ? t('veh.fuelCost') : t('veh.serviceCost')]} labelFormatter={(m) => formatDate(`${m}-01`, locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })} />
          <Legend formatter={(name) => (name === 'fuel' ? t('veh.fuelCost') : t('veh.serviceCost'))} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="fuel" stackId="c" fill="var(--color-accent)" isAnimationActive={false} />
          <Bar dataKey="service" stackId="c" fill="var(--color-purple)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
