import { describe, it, expect, vi, beforeEach } from 'vitest';

// Self-host cron heartbeat store. Mocks the DB + saasMode so we pin the read/write shape:
// the dotted `cronLastRun.<name>` write, the SaaS no-op, and how getCronHeartbeats normalizes
// stored values (string / Date / missing) into CronBeat[] for the KNOWN_CRONS.

const { findLean, updateOne, saasModeMock } = vi.hoisted(() => ({
  findLean: vi.fn(async () => null as Record<string, any> | null),
  updateOne: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>, _o?: Record<string, any>) => ({})),
  saasModeMock: vi.fn(() => false),
}));

vi.mock('./db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: { findOne: () => ({ select: () => ({ lean: findLean }) }), updateOne },
}));
vi.mock('./tenancy/saasMode', () => ({ saasMode: saasModeMock }));

import { recordCronRun, getCronHeartbeats, KNOWN_CRONS } from './cronHeartbeat';

beforeEach(() => {
  vi.clearAllMocks();
  saasModeMock.mockReturnValue(false);
  findLean.mockResolvedValue(null);
});

describe('recordCronRun', () => {
  it('stamps cronLastRun.<name> with an ISO timestamp (upsert)', async () => {
    await recordCronRun('prices');
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = updateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    const iso = (update.$set as Record<string, string>)['cronLastRun.prices'];
    expect(typeof iso).toBe('string');
    expect(Number.isFinite(new Date(iso).getTime())).toBe(true);
    expect(opts).toEqual({ upsert: true });
  });

  it('is a no-op in SaaS mode', async () => {
    saasModeMock.mockReturnValue(true);
    await recordCronRun('alerts');
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe('getCronHeartbeats', () => {
  it('returns a beat for every known cron, null when unrecorded', async () => {
    findLean.mockResolvedValue({ cronLastRun: {} });
    const beats = await getCronHeartbeats();
    expect(beats.map((b) => b.name).sort()).toEqual([...KNOWN_CRONS].sort());
    expect(beats.every((b) => b.lastRunAt === null)).toBe(true);
  });

  it('passes through a stored ISO string and coerces a Date to ISO', async () => {
    const d = new Date('2026-09-06T05:00:00.000Z');
    findLean.mockResolvedValue({ cronLastRun: { prices: '2026-09-06T04:00:00.000Z', alerts: d } });
    const beats = await getCronHeartbeats();
    expect(beats.find((b) => b.name === 'prices')?.lastRunAt).toBe('2026-09-06T04:00:00.000Z');
    expect(beats.find((b) => b.name === 'alerts')?.lastRunAt).toBe(d.toISOString());
  });

  it('degrades to all-null when the DB read throws', async () => {
    findLean.mockRejectedValue(new Error('db down'));
    const beats = await getCronHeartbeats();
    expect(beats.every((b) => b.lastRunAt === null)).toBe(true);
  });
});
