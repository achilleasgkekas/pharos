import { describe, expect, it } from 'vitest';
import { withConsumption, type ReadingLike } from './meterReadings';

const row = (id: string, value: number, readingAt: string, extra: Partial<ReadingLike> = {}): ReadingLike => ({
  _id: id, meter: 'Main', utilityType: 'Electricity', unit: 'kWh', space: 'Home', value, readingAt, ...extra,
});

describe('withConsumption', () => {
  it('sorts readings and derives each period delta from the previous matching meter', () => {
    const result = withConsumption([row('b', 145, '2026-02-01'), row('a', 100, '2026-01-01')]);
    expect(result.map((r) => [r._id, r.consumption])).toEqual([['a', null], ['b', 45]]);
  });

  it('does not mix spaces, meters, or units', () => {
    const result = withConsumption([
      row('a', 100, '2026-01-01'),
      row('b', 20, '2026-01-02', { space: 'Cottage' }),
      row('c', 120, '2026-02-01'),
      row('d', 30, '2026-02-02', { space: 'Cottage' }),
    ]);
    expect(result.map((r) => r.consumption)).toEqual([null, null, 20, 10]);
  });

  it('treats a meter rollover as an unknown delta', () => {
    expect(withConsumption([row('a', 999, '2026-01-01'), row('b', 5, '2026-02-01')])[1].consumption).toBeNull();
  });
});
