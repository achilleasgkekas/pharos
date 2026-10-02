import { describe, expect, it } from 'vitest';
import { Receipt } from './Receipt';
import { buildSampleData } from '@/lib/sampleData';

// "Load sample data" crashed Settings: the demo receipts have no scan behind them, and the
// schema required a file on every receipt, so the whole insert was rejected.
describe('Receipt file requirement', () => {
  it('accepts every sample receipt without a file', () => {
    for (const locale of ['en', 'el'] as const) {
      for (const r of buildSampleData(new Date('2026-07-15T12:00:00Z'), locale).receipts) {
        expect(new Receipt(r).validateSync()).toBeUndefined();
      }
    }
  });

  it('still requires a file on a real receipt', () => {
    const err = new Receipt({ store: 'Shop', date: new Date(), total: 5, filePath: '' }).validateSync();
    expect(err?.errors.filePath).toBeDefined();
  });
});
