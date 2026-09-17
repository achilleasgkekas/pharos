'use client';
import { cur } from "@/lib/money";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { SerializedPriceEntry } from '@/types';
import { formatDate, formatTime, formatDateTime } from '@/lib/i18n/format';
import { useLocale } from '@/components/LocaleProvider';

const tooltipStyle = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--color-text)',
};

// One distinct color per store-link, cycled if there are many.
const PALETTE = [
  'var(--color-accent)',
  'var(--color-cyan)',
  'var(--color-gold)',
  'var(--color-purple)',
  'var(--color-red)',
  'var(--color-orange)',
];

const fmtDate = (t: number, locale: string) => formatDate(t, locale, { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Multi-series price history: one dotted line per store-link, plotted over time.
 *  Seeded on URL import, then a dot is appended per store every scraper pass (6h). */
export function PriceHistoryChart({ history }: { history: SerializedPriceEntry[] }) {
  const locale = useLocale();
  const valid = history.filter((h) => typeof h.price === 'number' && h.price > 0);
  if (valid.length < 2) return null;

  // Distinct stores → series. Keep first-seen order so colors stay stable.
  const stores: string[] = [];
  for (const h of valid) {
    const s = h.store || 'unknown';
    if (!stores.includes(s)) stores.push(s);
  }

  // One row per check; each row carries only its own store's price, so every line
  // draws a dot exactly where a check happened (connectNulls bridges the gaps).
  const rows = valid
    .map((h) => ({ t: new Date(h.date).getTime(), store: h.store || 'unknown', price: h.price }))
    .sort((a, b) => a.t - b.t)
    .map((r) => ({ t: r.t, [r.store]: r.price }) as { t: number; [store: string]: number });

  const prices = valid.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max(1, Math.round((max - min) * 0.15));
  const single = stores.length === 1;

  return (
    <ResponsiveContainer width="100%" height={single ? 190 : 220}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tick={{ fontSize: 10, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(t: number) => fmtDate(t, locale)}
        />
        <YAxis
          domain={[min - pad, max + pad]}
          tick={{ fontSize: 10, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => `${cur()}${v}`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(t: number) => fmtDate(t, locale)}
          formatter={(v: number, name: string) => [`${cur()}${v}`, name]}
          cursor={{ stroke: 'var(--color-border-light)' }}
        />
        {!single && <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />}
        {stores.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            name={s}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3, fill: PALETTE[i % PALETTE.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
