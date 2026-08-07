'use server';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Job } from '@/models/Job';
import { requireAdmin } from '@/lib/auth';
import { saasMode } from '@/lib/tenancy/saasMode';
import { getAiConfig } from '@/lib/aiConfig';
import { isAiReady } from '@/lib/ollama';
import { getStorageConfig } from '@/lib/storageConfig';
import { getLastRemoteSync } from '@/lib/syncState';
import { detectSyncStaleness } from '@/lib/syncStaleness';
import { getAppSettings } from '@/lib/appSettings';
import { measureDir } from '@/lib/billing/fileStorage';
import { testRemote } from '@/lib/remoteStorage';
import { testOnedrive } from '@/lib/onedrive';
import { formatBytes } from '@/components/saas/format';
import {
  databaseLevel,
  diskLevel,
  aiLevel,
  jobsLevel,
  syncLevel,
  isStuck,
  overallLevel,
  formatMs,
  JOB_STUCK_MINUTES,
  type HealthCheck,
  type SystemHealth,
} from '@/lib/systemHealth';

/**
 * P77 — Settings → System status: "is my deployment healthy?" on one screen.
 *
 * Nothing here is a NEW kind of check. It is the checks the app already had, scattered
 * behind per-integration "Test connection" buttons in three different tabs, composed into
 * one read-only grid. Read-only is the whole design: no auto-fix, no restart button, no
 * writes of any kind, so the page can never be the thing that breaks a deployment.
 *
 * Admin-only and self-host-only (the tab is hidden on the managed SaaS, and this action
 * refuses there too): the numbers describe the HOST — Mongo latency, volume free space,
 * job queue — which in a multi-tenant deployment is shared infrastructure, not the
 * customer's to see.
 *
 * Fast by default. The one genuinely slow probe (a live FTP/SMB/OneDrive round trip, up
 * to 15s of hard timeout) only runs when the user explicitly presses "Test connections",
 * so opening the tab never hangs on a NAS that is asleep.
 */

// Mirrors lib/storage.ts (which keeps its root private) — same env, same default, so both
// resolve to the same volume.
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');

function idle(over: Partial<SystemHealth> = {}): SystemHealth {
  return { supported: true, checkedAt: new Date().toISOString(), deep: false, overall: 'unknown', checks: [], ...over };
}

type RawDbStats = { dataSize?: number; storageSize?: number; indexSize?: number; objects?: number; collections?: number };

/** Ping + size of the database this instance is actually using. */
async function databaseCheck(): Promise<HealthCheck> {
  const metrics: HealthCheck['metrics'] = [];
  let pingMs: number | undefined;
  let error = '';
  let stats: RawDbStats = {};
  try {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle');
    const t0 = Date.now();
    await db.admin().command({ ping: 1 });
    pingMs = Date.now() - t0;
    stats = (await db.stats()) as RawDbStats;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = databaseLevel({ error: error || undefined, pingMs });
  metrics.push({ key: 'sys.mLatency', value: formatMs(pingMs ?? null) });
  if (!error) {
    metrics.push({ key: 'sys.mDataSize', value: formatBytes((stats.storageSize ?? 0) + (stats.indexSize ?? 0)) });
    metrics.push({ key: 'sys.mDocs', value: String(stats.objects ?? 0) });
    metrics.push({ key: 'sys.mCollections', value: String(stats.collections ?? 0) });
  }
  return {
    id: 'database',
    level,
    noteKey: error ? 'sys.dbDown' : level === 'warn' ? 'sys.dbSlow' : 'sys.dbOk',
    noteVars: error ? { error } : { ping: formatMs(pingMs ?? null) },
    metrics,
  };
}

/** How much the stored receipts/photos weigh, and how much room is left for the next one. */
async function diskCheck(): Promise<HealthCheck> {
  let used = 0;
  let free: number | null = null;
  let total: number | null = null;
  let error = '';
  try {
    used = await measureDir(STORAGE_ROOT);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  try {
    // statfs landed in Node 18.15; a platform/filesystem without it reports "not measured"
    // rather than failing the whole check.
    const { statfs } = await import('node:fs/promises');
    const st = await statfs(STORAGE_ROOT);
    free = Number(st.bsize) * Number(st.bavail);
    total = Number(st.bsize) * Number(st.blocks);
  } catch {
    free = null;
    total = null;
  }

  const level = diskLevel({ freeBytes: free, totalBytes: total, error: error || undefined });
  return {
    id: 'disk',
    level,
    noteKey: error ? 'sys.diskError' : free == null ? 'sys.diskUnknown' : level === 'warn' ? 'sys.diskLow' : 'sys.diskOk',
    metrics: [
      { key: 'sys.mFiles', value: formatBytes(used) },
      { key: 'sys.mFree', value: free == null ? '—' : formatBytes(free) },
      { key: 'sys.mVolume', value: total == null ? '—' : formatBytes(total) },
    ],
  };
}

/** Whether the configured AI provider would answer if a receipt landed right now. */
async function aiCheck(): Promise<HealthCheck> {
  let provider = '';
  let model = '';
  let enabled = false;
  let ready = false;
  try {
    const cfg = await getAiConfig();
    enabled = cfg.aiEnabled;
    provider = cfg.provider;
    model = cfg.provider === 'ollama' ? cfg.ollamaModel : cfg.provider === 'anthropic' ? cfg.anthropicModel : '';
    if (enabled) ready = await isAiReady();
  } catch {
    /* a config read failure reads as "not ready", which is what the user would experience */
  }
  const level = aiLevel({ enabled, ready });
  return {
    id: 'ai',
    level,
    noteKey: !enabled ? 'sys.aiOff' : ready ? 'sys.aiReady' : 'sys.aiNotReady',
    noteVars: { provider },
    metrics: [
      { key: 'sys.mProvider', value: enabled ? provider : '—' },
      { key: 'sys.mModel', value: model || '—' },
    ],
  };
}

/** The background worker queue: anything running, wedged, or failed in the last day. */
async function jobsCheck(): Promise<HealthCheck> {
  let running = 0;
  let failed = 0;
  let stuck = 0;
  try {
    await connectDB();
    const now = Date.now();
    const since = new Date(now - 24 * 3600 * 1000);
    const [runningDocs, failedCount] = await Promise.all([
      Job.find({ status: 'running' }).select('updatedAt').lean(),
      Job.countDocuments({ status: 'error', updatedAt: { $gte: since } }),
    ]);
    running = runningDocs.length;
    failed = failedCount;
    stuck = runningDocs.filter((j) => isStuck((j as { updatedAt?: Date }).updatedAt, now)).length;
  } catch {
    /* the database check already reports a dead DB — do not double-alarm here */
  }
  const level = jobsLevel({ stuck, failed });
  return {
    id: 'jobs',
    level,
    noteKey: stuck > 0 ? 'sys.jobsStuck' : failed > 0 ? 'sys.jobsFailed' : running > 0 ? 'sys.jobsRunning' : 'sys.jobsIdle',
    noteVars: { stuck, failed, running, minutes: JOB_STUCK_MINUTES },
    metrics: [
      { key: 'sys.mRunning', value: String(running) },
      { key: 'sys.mFailed24h', value: String(failed) },
    ],
  };
}

/** The off-box copy: which backend, how long since it last succeeded, and (deep) can we reach it. */
async function syncCheck(deep: boolean): Promise<HealthCheck> {
  let backend = 'local';
  let mirror = false;
  let lastSyncAt: Date | null = null;
  let stale = false;
  let reachable: boolean | null = null;
  let error = '';
  try {
    const s = await getStorageConfig();
    backend = s.backend;
    mirror = s.mirror;
    if (backend !== 'local') {
      const settings = await getAppSettings();
      lastSyncAt = await getLastRemoteSync();
      stale = !!detectSyncStaleness({ backend, lastSyncAt, thresholdDays: settings.syncStaleDays, now: Date.now() });
      if (deep) {
        const r = backend === 'onedrive' ? await testOnedrive() : await testRemote(s.remote);
        reachable = r.ok;
        if (!r.ok) error = r.error || '';
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = syncLevel({ backend, reachable, stale });
  const days = lastSyncAt ? Math.floor((Date.now() - lastSyncAt.getTime()) / 86400000) : 0;
  return {
    id: 'sync',
    level,
    noteKey:
      backend === 'local'
        ? 'sys.syncOff'
        : reachable === false
          ? 'sys.syncDown'
          : stale
            ? 'sys.syncStale'
            : 'sys.syncOk',
    noteVars: { backend, error, days },
    metrics: [
      { key: 'sys.mBackend', value: backend },
      { key: 'sys.mMirror', value: backend === 'local' ? '—' : mirror ? 'on' : 'off' },
      { key: 'sys.mLastSync', value: lastSyncAt ? lastSyncAt.toISOString() : '' },
    ],
  };
}

/**
 * Run every check. `deep` adds the live remote-storage probe (slow, opt-in).
 *
 * Each check owns its own failure: one broken subsystem shows as a red tile, it never
 * takes the page down with it.
 */
export async function getSystemHealth(deep = false): Promise<SystemHealth> {
  await requireAdmin();
  // Host-level numbers are not a tenant's business; the tab is hidden there anyway.
  if (saasMode()) return idle({ supported: false });

  const checks = await Promise.all([databaseCheck(), diskCheck(), aiCheck(), jobsCheck(), syncCheck(deep)]);
  return {
    supported: true,
    checkedAt: new Date().toISOString(),
    deep,
    overall: overallLevel(checks),
    checks,
  };
}
