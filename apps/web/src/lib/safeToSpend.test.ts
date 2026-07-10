import { describe, expect, it } from 'vitest';
import { computeSafeToSpend } from './safeToSpend';
import type { AgendaMonth, AgendaEntry } from './moneyAgenda';

// Fixed reference clock so every window boundary is deterministic.
const NOW = new Date('2026-07-10T09:00:00Z');

function entry(dateISO: string, kind: AgendaEntry['kind'], amount: number | null): AgendaEntry {
  return { date: new Date(dateISO).toISOString(), kind, label: kind, sub: '', amount };
}

// Build the current + next-2-month buckets the agenda would produce, dropping the
// supplied entries into whichever month they fall in. Per-month out/inc totals are
// not read by computeSafeToSpend, so we leave them at 0.
function agenda(entries: AgendaEntry[]): AgendaMonth[] {
  const months: AgendaMonth[] = [0, 1, 2].map((i) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: '', entries: [], out: 0, inc: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const e of entries) {
    const d = new Date(e.date);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byKey.get(k)?.entries.push(e);
  }
  return months;
}

describe('computeSafeToSpend', () => {
  it('nets recurring income against fixed charges over each window', () => {
    const r = computeSafeToSpend(
      agenda([
        entry('2026-07-25T00:00:00Z', 'income', 2000), // this month + all windows
        entry('2026-07-15T00:00:00Z', 'bill', 60), // this month + all windows
        entry('2026-08-01T00:00:00Z', 'installments', 100), // 30d+ windows
        entry('2026-08-20T00:00:00Z', 'renewal', 12), // 60d+ windows
      ]),
      NOW,
    );
    // 30d window: Jul10..Aug9 → income 2000, out 60 + 100 = 160.
    expect(r.windows[0]).toEqual({ days: 30, income: 2000, outflow: 160, net: 1840 });
    // 60d window: adds Aug20 renewal → out 172.
    expect(r.windows[1]).toEqual({ days: 60, income: 2000, outflow: 172, net: 1828 });
    expect(r.windows[2].days).toBe(90);
  });

  it('this-month figure counts only current-month charges (not next month)', () => {
    const r = computeSafeToSpend(
      agenda([
        entry('2026-07-15T00:00:00Z', 'bill', 60),
        entry('2026-08-01T00:00:00Z', 'installments', 100),
      ]),
      NOW,
    );
    expect(r.thisMonth).toEqual({ income: 0, outflow: 60, net: -60 });
    expect(r.monthLabel).toBe('July 2026');
  });

  it('ignores entries dated before today (already past this month)', () => {
    const r = computeSafeToSpend(
      agenda([
        entry('2026-07-01T00:00:00Z', 'installments', 100), // pinned to month-start, already past
        entry('2026-07-20T00:00:00Z', 'bill', 40), // future
      ]),
      NOW,
    );
    expect(r.thisMonth).toEqual({ income: 0, outflow: 40, net: -40 });
    expect(r.windows[0].outflow).toBe(40);
  });

  it('skips amount-less expiries (warranty / voucher)', () => {
    const r = computeSafeToSpend(
      agenda([
        entry('2026-07-20T00:00:00Z', 'warranty', null),
        entry('2026-07-22T00:00:00Z', 'voucher', null),
        entry('2026-07-18T00:00:00Z', 'bill', 30),
      ]),
      NOW,
    );
    expect(r.thisMonth).toEqual({ income: 0, outflow: 30, net: -30 });
  });

  it('returns zeros for an empty agenda', () => {
    const r = computeSafeToSpend(agenda([]), NOW);
    expect(r.thisMonth).toEqual({ income: 0, outflow: 0, net: 0 });
    expect(r.windows.map((w) => w.net)).toEqual([0, 0, 0]);
  });

  it('counts an event dated exactly today', () => {
    const r = computeSafeToSpend(agenda([entry('2026-07-10T20:00:00Z', 'bill', 50)]), NOW);
    expect(r.thisMonth.outflow).toBe(50);
    expect(r.windows[0].outflow).toBe(50);
  });
});
