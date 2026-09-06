// Self-host cron heartbeats. Each scheduled route (alerts, price scrape) stamps its last
// successful run here so Settings → System status can flag a cron that WAS running and went
// quiet — the "forgotten crontab line = dead feature, silently" failure that this app is
// especially prone to (there is no in-app scheduler; a route only runs if a crontab hits it).
//
// Self-host only: the cron routes are 404 under SAAS_MODE, and recordCronRun no-ops there.
// Stored as an AppConfig.cronLastRun map { name: ISO-8601 }; best-effort (never throws).
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { saasMode } from './tenancy/saasMode';
import type { CronBeat } from './systemHealth';

/** The self-host crons whose heartbeats the System-status panel watches. */
export const KNOWN_CRONS = ['alerts', 'prices'] as const;
export type CronName = (typeof KNOWN_CRONS)[number];

/** Stamp a cron's last successful run. Call at the END of a cron route, after the work. */
export async function recordCronRun(name: CronName): Promise<void> {
  if (saasMode()) return;
  try {
    await connectDB();
    await AppConfig.updateOne(
      { key: 'singleton' },
      { $set: { [`cronLastRun.${name}`]: new Date().toISOString() } },
      { upsert: true },
    );
  } catch {
    /* best-effort heartbeat — never fail the cron over a bookkeeping write */
  }
}

/** Read the last-run heartbeat for every known cron (null = never reported). */
export async function getCronHeartbeats(): Promise<CronBeat[]> {
  let map: Record<string, unknown> = {};
  try {
    await connectDB();
    const doc = (await AppConfig.findOne({ key: 'singleton' }).select('cronLastRun').lean()) as
      | { cronLastRun?: Record<string, unknown> }
      | null;
    map = doc?.cronLastRun ?? {};
  } catch {
    /* DB down is already surfaced by the database check — don't double-report */
  }
  return KNOWN_CRONS.map((name) => {
    const v = map[name];
    const lastRunAt = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : null;
    return { name, lastRunAt };
  });
}
