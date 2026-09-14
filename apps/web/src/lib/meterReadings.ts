export type ReadingLike = {
  _id: string;
  meter: string;
  utilityType: string;
  unit: string;
  space: string;
  readingAt: string;
  value: number;
};

export type ReadingWithConsumption = ReadingLike & { consumption: number | null };

/** Deltas only compare observations from the same physical meter. A negative delta is
 * left unknown: it normally means a rollover/replacement or corrected identity, not
 * negative consumption. */
export function withConsumption(readings: ReadingLike[]): ReadingWithConsumption[] {
  const previous = new Map<string, number>();
  return [...readings]
    .sort((a, b) => a.readingAt.localeCompare(b.readingAt))
    .map((reading) => {
      const key = `${reading.space}\u0000${reading.meter}\u0000${reading.unit}`;
      const before = previous.get(key);
      const delta = before === undefined ? null : reading.value - before;
      previous.set(key, reading.value);
      return { ...reading, consumption: delta !== null && delta >= 0 ? delta : null };
    });
}
