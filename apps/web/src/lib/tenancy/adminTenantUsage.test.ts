import { describe, it, expect } from 'vitest';
import { summarizeUsagePeriod, buildUsageSummary } from './adminTenantUsage';
import type { UsageDoc } from '@/models/Usage';

// PURE helpers only. `readTenantUsageForAdmin` is the node-only registry (Usage ledger) reader
// and the route is superadmin-gated (404 when SAAS_MODE off / console not enabled).

function doc(over: Record<string, unknown>): Partial<UsageDoc> {
  return {
    period: '2026-07',
    aiCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiCostMicros: 0,
    storageBytes: 0,
    storageMeasuredAt: null,
    ...over,
  } as unknown as Partial<UsageDoc>;
}

describe('summarizeUsagePeriod', () => {
  it('projects a ledger row and serializes storageMeasuredAt to ISO', () => {
    const out = summarizeUsagePeriod(
      doc({
        period: '2026-07',
        aiCalls: 12,
        aiInputTokens: 3400,
        aiOutputTokens: 900,
        aiCostMicros: 25000,
        storageBytes: 1048576,
        storageMeasuredAt: new Date('2026-07-08T00:00:00.000Z'),
      })
    );
    expect(out).toEqual({
      period: '2026-07',
      aiCalls: 12,
      aiInputTokens: 3400,
      aiOutputTokens: 900,
      aiCostMicros: 25000,
      storageBytes: 1048576,
      storageMeasuredAt: '2026-07-08T00:00:00.000Z',
    });
  });

  it('coerces garbage/negative numerics to 0 and invalid date to null', () => {
    const out = summarizeUsagePeriod(
      doc({ aiCalls: -5, aiInputTokens: NaN, aiCostMicros: Infinity, storageBytes: 12.9, storageMeasuredAt: 'nope' })
    );
    expect(out.aiCalls).toBe(0);
    expect(out.aiInputTokens).toBe(0);
    expect(out.aiCostMicros).toBe(0);
    expect(out.storageBytes).toBe(12); // floored
    expect(out.storageMeasuredAt).toBe(null);
  });

  it('falls back to empty period label when missing', () => {
    expect(summarizeUsagePeriod(doc({ period: undefined as never })).period).toBe('');
  });
});

describe('buildUsageSummary', () => {
  it('is empty for no docs', () => {
    const out = buildUsageSummary([]);
    expect(out.periodCount).toBe(0);
    expect(out.periods).toEqual([]);
    expect(out.latestPeriod).toBe(null);
    expect(out.latestStorageBytes).toBe(0);
    expect(out.latestStorageMeasuredAt).toBe(null);
    expect(out.totals).toEqual({ aiCalls: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCostMicros: 0 });
  });

  it('sorts periods most-recent first and sums the monotonic AI counters', () => {
    const out = buildUsageSummary([
      doc({ period: '2026-05', aiCalls: 3, aiInputTokens: 100, aiOutputTokens: 10, aiCostMicros: 500 }),
      doc({ period: '2026-07', aiCalls: 5, aiInputTokens: 200, aiOutputTokens: 20, aiCostMicros: 700 }),
      doc({ period: '2026-06', aiCalls: 4, aiInputTokens: 150, aiOutputTokens: 15, aiCostMicros: 600 }),
    ]);
    expect(out.periodCount).toBe(3);
    expect(out.periods.map((p) => p.period)).toEqual(['2026-07', '2026-06', '2026-05']);
    expect(out.latestPeriod).toBe('2026-07');
    expect(out.totals).toEqual({ aiCalls: 12, aiInputTokens: 450, aiOutputTokens: 45, aiCostMicros: 1800 });
  });

  it('treats storage as a gauge — takes bytes from the newest measurement, not a sum', () => {
    const out = buildUsageSummary([
      doc({ period: '2026-06', storageBytes: 1000, storageMeasuredAt: new Date('2026-06-30T00:00:00.000Z') }),
      doc({ period: '2026-07', storageBytes: 3000, storageMeasuredAt: new Date('2026-07-08T00:00:00.000Z') }),
      // A later period whose storage was never measured must NOT clobber the gauge.
      doc({ period: '2026-08', storageBytes: 0, storageMeasuredAt: null }),
    ]);
    expect(out.latestStorageBytes).toBe(3000);
    expect(out.latestStorageMeasuredAt).toBe('2026-07-08T00:00:00.000Z');
    expect(out.latestPeriod).toBe('2026-08'); // label is newest period regardless of measurement
  });

  it('yields null storage gauge when nothing was ever measured', () => {
    const out = buildUsageSummary([doc({ period: '2026-07', storageBytes: 500, storageMeasuredAt: null })]);
    expect(out.latestStorageBytes).toBe(0);
    expect(out.latestStorageMeasuredAt).toBe(null);
  });

  it('skips null/undefined docs defensively', () => {
    const out = buildUsageSummary([null, doc({ period: '2026-07', aiCalls: 2 }), undefined]);
    expect(out.periodCount).toBe(1);
    expect(out.totals.aiCalls).toBe(2);
  });
});
