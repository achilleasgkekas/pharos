'use server';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Job } from '@/models/Job';
import { AppConfig } from '@/models/AppConfig';
import { requireAdmin } from '@/lib/auth';
import { saasMode } from '@/lib/tenancy/saasMode';
import { getAiConfig } from '@/lib/aiConfig';
import { isAiReady } from '@/lib/ollama';
import { getStorageConfig } from '@/lib/storageConfig';
import { getLastRemoteSync } from '@/lib/syncState';
import { detectSyncStaleness } from '@/lib/syncStaleness';
import { getAppSettings } from '@/lib/appSettings';
import { measureDir } from '@/lib/storage';
import { testRemote } from '@/lib/remoteStorage';
import { testOnedrive } from '@/lib/onedrive';
import { formatBytes } from '@/lib/bytes';
import {
  databaseLevel,
  diskLevel,
  aiLevel,
  searchLevel,
  browserLevel,
  scraperLevel,
  jobsLevel,
  syncLevel,
  cronLevel,
  isStuck,
  overallLevel,
  formatMs,
  redactEndpoint,
  JOB_STUCK_MINUTES,
  CRON_STALE_HOURS,
  type HealthCheck,
  type SystemHealth,
} from '@/lib/systemHealth';
import { getCronHeartbeats } from '@/lib/cronHeartbeat';
import { getScraperStatus } from '@/lib/scraperStatus';

/**
 * P77 & #390 — Settings → System status: service readiness and diagnostics.
 *
 * Covers all host and companion services (Mongo, volume disk, AI, SearXNG metasearch,
 * FlareSolverr headless sandbox browser, standalone price scraper, background jobs,
 * remote backup sync, and crontab tasks).
 *
 * Fast by default: quick reachability checks on opening Settings (refresh). Deep functional
 * tests (search query, solver session check, remote storage probe) run on "Test connections".
 *
 * Each check is strictly isolated with bounded timeouts and independent try/catch boundaries:
 * one unreachable or throwing service can NEVER block or crash the rest of the diagnostics.
 * Read-only diagnostics: no Docker socket access, no writes, all credentials redacted.
 */

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), 'storage');
const METRIC_FAILED_24H = 'sys.mFailed24h';
function getSearxngUrl(): string {
  return (process.env.SEARXNG_URL ?? 'http://localhost:8888').trim();
}
function getSolverUrl(): string {
  return (process.env.SOLVER_URL ?? '').trim().replace(/\/+$/, '');
}

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
    /* a config read failure reads as "not ready" */
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

/** SearXNG metasearch service readiness and query diagnostics (#390). */
async function searchCheck(deep: boolean): Promise<HealthCheck> {
  const searxngUrl = getSearxngUrl();
  const configured = !['off', 'false', 'none', 'disabled'].includes(searxngUrl.toLowerCase()) && Boolean(searxngUrl);
  if (!configured) {
    return {
      id: 'search',
      level: 'unknown',
      noteKey: 'sys.searchDisabled',
      metrics: [
        { key: 'sys.mEndpoint', value: '—' },
        { key: 'sys.mFunctional', value: 'sys.mDisabled' },
      ],
    };
  }

  const endpointDisplay = redactEndpoint(searxngUrl);
  let pingMs: number | undefined;
  let reachable = false;
  let functional: boolean | null = null;
  let reachabilityError = '';
  let functionalError = '';
  let httpStatus: number | undefined;

  try {
    const t0 = Date.now();
    const res = await fetch(new URL('/healthz', searxngUrl), {
      headers: { Accept: 'application/json', 'User-Agent': 'homepage-health/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    pingMs = Date.now() - t0;
    httpStatus = res.status;
    reachable = res.ok;
    if (!res.ok) {
      reachabilityError = `HTTP ${res.status}`;
    } else if (deep) {
      try {
        const fUrl = new URL('/search', searxngUrl);
        fUrl.searchParams.set('q', 'test');
        fUrl.searchParams.set('format', 'json');
        const fRes = await fetch(fUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'homepage-health/1.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (!fRes.ok) {
          functional = false;
          functionalError = `HTTP ${fRes.status} on /search`;
        } else {
          const data = (await fRes.json()) as { results?: unknown };
          functional = Array.isArray(data?.results);
          if (!functional) functionalError = 'Malformed search response';
        }
      } catch (fe) {
        functional = false;
        functionalError = fe instanceof Error ? fe.message : String(fe);
      }
    }
  } catch (e) {
    reachable = false;
    reachabilityError = e instanceof Error ? e.message : String(e);
  }

  const level = searchLevel({
    configured,
    reachable,
    functional,
    error: reachabilityError || undefined,
    latencyMs: pingMs,
  });

  const error = reachabilityError || functionalError;
  let noteKey = 'sys.searchOk';
  if (!reachable) {
    noteKey = httpStatus ? 'sys.searchHttpError' : 'sys.searchDown';
  } else if (functional === false) {
    noteKey = 'sys.searchDegraded';
  }

  return {
    id: 'search',
    level,
    noteKey,
    noteVars: { error, status: String(httpStatus ?? ''), ping: formatMs(pingMs) },
    metrics: [
      { key: 'sys.mLatency', value: formatMs(pingMs) },
      { key: 'sys.mEndpoint', value: endpointDisplay },
      {
        key: 'sys.mFunctional',
        value: functional === true ? 'sys.mFunctionalOk' : functional === false ? 'sys.mFunctionalFail' : reachable ? 'sys.mReachable' : '—',
      },
    ],
  };
}

/** FlareSolverr headless sandbox browser readiness (#390). */
async function browserCheck(deep: boolean): Promise<HealthCheck> {
  const solverUrl = getSolverUrl();
  const configured = Boolean(solverUrl) && !['off', 'false', 'none', 'disabled'].includes(solverUrl.toLowerCase());
  if (!configured) {
    return {
      id: 'browser',
      level: 'unknown',
      noteKey: 'sys.flareOff',
      metrics: [
        { key: 'sys.mEndpoint', value: '—' },
        { key: 'sys.mFunctional', value: 'sys.mDisabled' },
      ],
    };
  }

  const endpointDisplay = redactEndpoint(solverUrl);
  let pingMs: number | undefined;
  let reachable = false;
  let functional: boolean | null = null;
  let reachabilityError = '';
  let functionalError = '';
  let version = '';
  let httpStatus: number | undefined;

  try {
    const t0 = Date.now();
    const res = await fetch(`${solverUrl}/`, {
      headers: { Accept: 'application/json', 'User-Agent': 'homepage-health/1.0' },
      signal: AbortSignal.timeout(3000),
    });
    pingMs = Date.now() - t0;
    httpStatus = res.status;
    reachable = res.ok;
    if (!res.ok) {
      reachabilityError = `HTTP ${res.status}`;
    } else {
      try {
        const data = (await res.json()) as { version?: string };
        version = typeof data?.version === 'string' ? data.version : '';
      } catch {
        /* ignore non-json response */
      }
      if (deep) {
        try {
          const sRes = await fetch(`${solverUrl}/v1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'homepage-health/1.0' },
            body: JSON.stringify({ cmd: 'sessions.list' }),
            signal: AbortSignal.timeout(4000),
          });
          if (!sRes.ok) {
            functional = false;
            functionalError = `HTTP ${sRes.status} on /v1`;
          } else {
            const sData = (await sRes.json()) as { status?: string; message?: string };
            functional = sData.status === 'ok';
            if (!functional) functionalError = sData.message || 'Solver sessions check failed';
          }
        } catch (fe) {
          functional = false;
          functionalError = fe instanceof Error ? fe.message : String(fe);
        }
      }
    }
  } catch (e) {
    reachable = false;
    reachabilityError = e instanceof Error ? e.message : String(e);
  }

  const level = browserLevel({
    configured,
    reachable,
    functional,
    error: reachabilityError || undefined,
    latencyMs: pingMs,
  });

  const error = reachabilityError || functionalError;
  let noteKey = 'sys.flareOk';
  if (!reachable) {
    noteKey = httpStatus ? 'sys.flareHttpError' : 'sys.flareDown';
  } else if (functional === false) {
    noteKey = 'sys.flareDegraded';
  }

  return {
    id: 'browser',
    level,
    noteKey,
    noteVars: { error, status: String(httpStatus ?? ''), ping: formatMs(pingMs) },
    metrics: [
      { key: 'sys.mLatency', value: formatMs(pingMs) },
      { key: 'sys.mVersion', value: version || '—' },
      { key: 'sys.mEndpoint', value: endpointDisplay },
      {
        key: 'sys.mFunctional',
        value: functional === true ? 'sys.mFunctionalOk' : functional === false ? 'sys.mFunctionalFail' : reachable ? 'sys.mReachable' : '—',
      },
    ],
  };
}

/** Standalone price scraper / cron worker diagnostics (#390). */
async function scraperCheck(): Promise<HealthCheck> {
  let enabled = true;
  let schedule = '0 */6 * * *';
  let lastRunAt: string | null = null;
  let heartbeatAt: string | null = null;
  let lastError: string | null = null;
  let lastStats: { items?: number; checks?: number; updates?: number; alerts?: number } | null = null;
  let error = '';

  try {
    await connectDB();
    const [appCfg, statusDoc, beats] = await Promise.all([
      AppConfig.findOne({ key: 'singleton' }).select('scraperEnabled').lean() as Promise<{ scraperEnabled?: boolean } | null>,
      getScraperStatus(),
      getCronHeartbeats().catch(() => []),
    ]);
    if (appCfg && appCfg.scraperEnabled === false) {
      enabled = false;
    }
    if (statusDoc) {
      if (statusDoc.schedule) schedule = statusDoc.schedule;
      lastRunAt = statusDoc.lastRunAt || statusDoc.lastCompleteAt || null;
      heartbeatAt = statusDoc.heartbeatAt || null;
      lastError = statusDoc.lastError || null;
      lastStats = statusDoc.lastStats || null;
    }
    // Also consider cron heartbeat for 'prices' if standalone scraper hasn't reported a newer run
    const priceBeat = beats.find((b) => b.name === 'prices');
    if (priceBeat?.lastRunAt) {
      if (!lastRunAt || new Date(priceBeat.lastRunAt).getTime() > new Date(lastRunAt).getTime()) {
        lastRunAt = priceBeat.lastRunAt;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = scraperLevel({
    enabled,
    lastRunAt,
    heartbeatAt,
    lastError: error || lastError,
    now: Date.now(),
  });

  let noteKey = 'sys.scraperOk';
  if (!enabled) {
    noteKey = 'sys.scraperDisabled';
  } else if (!lastRunAt && !heartbeatAt) {
    noteKey = 'sys.scraperNotConfigured';
  } else if (error || lastError) {
    noteKey = 'sys.scraperError';
  } else if (level === 'warn') {
    noteKey = 'sys.scraperStale';
  }

  const outcomeStr = error || lastError
    ? 'sys.mFunctionalFail'
    : lastStats
      ? `${lastStats.updates ?? 0} up / ${lastStats.checks ?? 0} chk`
      : lastRunAt
        ? 'sys.mFunctionalOk'
        : 'sys.mNotRunning';

  return {
    id: 'scraper',
    level,
    noteKey,
    noteVars: { error: error || lastError || '', hours: CRON_STALE_HOURS, time: lastRunAt ? lastRunAt : '' },
    metrics: [
      { key: 'sys.mSchedule', value: enabled ? schedule : '—' },
      { key: 'sys.mLastPass', value: lastRunAt || '—' },
      { key: 'sys.mPassOutcome', value: enabled ? outcomeStr : 'sys.mDisabled' },
    ],
  };
}

/** The background worker queue: anything running, wedged, or failed in the last day (#392 Item 5). */
async function jobsCheck(dbAlive = true): Promise<HealthCheck> {
  let running = 0;
  let failed = 0;
  let stuck = 0;
  let error = '';

  if (!dbAlive) {
    return {
      id: 'jobs',
      level: 'unknown',
      noteKey: 'sys.jobsUnmeasured',
      metrics: [
        { key: 'sys.mRunning', value: '—' },
        { key: METRIC_FAILED_24H, value: '—' },
      ],
    };
  }

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
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = jobsLevel({ stuck, failed, error: error || undefined });
  return {
    id: 'jobs',
    level,
    noteKey: error
      ? 'sys.jobsError'
      : stuck > 0
        ? 'sys.jobsStuck'
        : failed > 0
          ? 'sys.jobsFailed'
          : running > 0
            ? 'sys.jobsRunning'
            : 'sys.jobsIdle',
    noteVars: error ? { error } : { stuck, failed, running, minutes: JOB_STUCK_MINUTES },
    metrics: [
      { key: 'sys.mRunning', value: error ? '—' : String(running) },
      { key: METRIC_FAILED_24H, value: error ? '—' : String(failed) },
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
        try {
          const r = backend === 'onedrive' ? await testOnedrive() : await testRemote(s.remote);
          reachable = r.ok;
          if (!r.ok) error = r.error || '';
        } catch (probeErr) {
          reachable = false;
          error = probeErr instanceof Error ? probeErr.message : String(probeErr);
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = syncLevel({ backend, reachable, stale, error: error || undefined });
  const days = lastSyncAt ? Math.floor((Date.now() - lastSyncAt.getTime()) / 86400000) : 0;
  return {
    id: 'sync',
    level,
    noteKey:
      backend === 'local' && !error
        ? 'sys.syncOff'
        : reachable === false || error
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

/** The scheduled self-host crons (alerts, price scrape): did they run, and recently? */
async function cronCheck(): Promise<HealthCheck> {
  let beats: Awaited<ReturnType<typeof getCronHeartbeats>> = [];
  let error = '';
  try {
    beats = await getCronHeartbeats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const level = cronLevel(beats, Date.now(), error || undefined);
  const ranCount = beats.filter((b) => b.lastRunAt).length;
  const byName = (n: string) => beats.find((b) => b.name === n)?.lastRunAt ?? '';
  return {
    id: 'cron',
    level,
    noteKey: error ? 'sys.cronError' : ranCount === 0 ? 'sys.cronNever' : level === 'warn' ? 'sys.cronStale' : 'sys.cronOk',
    noteVars: error ? { error } : { hours: CRON_STALE_HOURS },
    metrics: [
      { key: 'sys.mCronPrices', value: error ? '—' : byName('prices') || '—' },
      { key: 'sys.mCronAlerts', value: error ? '—' : byName('alerts') || '—' },
    ],
  };
}

/**
 * Run every check. `deep` adds live functional probes on search, browser and remote storage.
 *
 * Each check owns its own failure: one broken subsystem shows as a red/warn tile, it never
 * takes the page down or hangs other checks.
 */
export async function getSystemHealth(deep = false): Promise<SystemHealth> {
  await requireAdmin();
  if (saasMode()) return idle({ supported: false });

  // Probe database first to know if it is reachable, but with isolation
  let dbCheckResult: HealthCheck;
  try {
    dbCheckResult = await databaseCheck();
  } catch (e) {
    dbCheckResult = {
      id: 'database',
      level: 'down',
      noteKey: 'sys.dbDown',
      noteVars: { error: e instanceof Error ? e.message : String(e) },
      metrics: [{ key: 'sys.mLatency', value: '—' }],
    };
  }
  const dbAlive = dbCheckResult.level !== 'down';

  const checkFns: Promise<HealthCheck>[] = [
    Promise.resolve(dbCheckResult),
    diskCheck().catch((err): HealthCheck => ({
      id: 'disk',
      level: 'warn',
      noteKey: 'sys.diskError',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mFiles', value: '—' }, { key: 'sys.mFree', value: '—' }, { key: 'sys.mVolume', value: '—' }],
    })),
    aiCheck().catch((): HealthCheck => ({
      id: 'ai',
      level: 'warn',
      noteKey: 'sys.aiNotReady',
      noteVars: { provider: 'unknown' },
      metrics: [{ key: 'sys.mProvider', value: '—' }, { key: 'sys.mModel', value: '—' }],
    })),
    searchCheck(deep).catch((err): HealthCheck => ({
      id: 'search',
      level: 'down',
      noteKey: 'sys.searchDown',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mLatency', value: '—' }, { key: 'sys.mEndpoint', value: '—' }],
    })),
    browserCheck(deep).catch((err): HealthCheck => ({
      id: 'browser',
      level: 'down',
      noteKey: 'sys.flareDown',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mLatency', value: '—' }, { key: 'sys.mVersion', value: '—' }, { key: 'sys.mEndpoint', value: '—' }],
    })),
    scraperCheck().catch((err): HealthCheck => ({
      id: 'scraper',
      level: 'warn',
      noteKey: 'sys.scraperError',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mSchedule', value: '—' }, { key: 'sys.mLastPass', value: '—' }],
    })),
    jobsCheck(dbAlive).catch((err): HealthCheck => ({
      id: 'jobs',
      level: 'down',
      noteKey: 'sys.jobsError',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mRunning', value: '—' }, { key: METRIC_FAILED_24H, value: '—' }],
    })),
    syncCheck(deep).catch((err): HealthCheck => ({
      id: 'sync',
      level: 'down',
      noteKey: 'sys.syncDown',
      noteVars: { backend: 'remote', error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mBackend', value: 'remote' }, { key: 'sys.mMirror', value: '—' }, { key: 'sys.mLastSync', value: '' }],
    })),
    cronCheck().catch((err): HealthCheck => ({
      id: 'cron',
      level: 'down',
      noteKey: 'sys.cronError',
      noteVars: { error: err instanceof Error ? err.message : String(err) },
      metrics: [{ key: 'sys.mCronPrices', value: '—' }, { key: 'sys.mCronAlerts', value: '—' }],
    })),
  ];

  const checks = await Promise.all(checkFns);
  return {
    supported: true,
    checkedAt: new Date().toISOString(),
    deep,
    overall: overallLevel(checks),
    checks,
  };
}
