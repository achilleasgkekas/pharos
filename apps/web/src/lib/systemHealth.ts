/**
 * P77 — the verdict logic behind Settings → System status.
 *
 * PURE + DB-free on purpose: every function here turns raw measurements (a ping time, a
 * byte count, a job tally) into a traffic-light level, so the thresholds that decide
 * "is my deployment healthy?" are unit-tested instead of buried in a server action.
 * The IO half (who measures what) lives in app/settings/healthActions.ts.
 *
 * Levels, and what each one means to a self-hoster staring at the grid:
 *   ok      — measured, nothing to do.
 *   warn    — measured, works, but something will bite later (slow DB, disk nearly full,
 *             a mirror that stopped syncing, a job stuck since yesterday).
 *   down    — measured and broken right now (DB unreachable, remote storage refuses).
 *   unknown — deliberately NOT measured or not applicable (AI switched off, no remote
 *             backend configured, a platform without statfs). Grey, never alarming: a
 *             feature you chose not to use must not read as a failure.
 */

export type HealthLevel = 'ok' | 'warn' | 'down' | 'unknown';

/** One measured number in a check's row. `key` is an i18n key; `value` is already formatted. */
export type HealthMetric = { key: string; value: string };

export type HealthCheckId = 'database' | 'disk' | 'ai' | 'jobs' | 'sync';

export type HealthCheck = {
  id: HealthCheckId;
  level: HealthLevel;
  /** i18n key for the one-line verdict shown under the check title. */
  noteKey: string;
  /** Interpolation vars for `noteKey` (already formatted strings/numbers). */
  noteVars?: Record<string, string | number>;
  metrics: HealthMetric[];
};

export type SystemHealth = {
  /** False on the managed SaaS, where a tenant has no business seeing host internals. */
  supported: boolean;
  checkedAt: string; // ISO
  /** True when the run included the live remote-storage probe (the slow, opt-in part). */
  deep: boolean;
  overall: HealthLevel;
  checks: HealthCheck[];
};

// --- thresholds (exported so the tests pin the numbers, not a copy of them) -------------

/** A local Mongo answers a ping in single-digit ms; a quarter second means something is wrong. */
export const DB_PING_WARN_MS = 250;
/** Below either of these the next receipt upload is the one that fails. */
export const DISK_FREE_WARN_BYTES = 1024 * 1024 * 1024; // 1 GiB
export const DISK_FREE_WARN_RATIO = 0.05; // 5%
/** A job that has not moved in this long is wedged, not busy (AI items take ~2 min each). */
export const JOB_STUCK_MINUTES = 30;

// --- per-check verdicts ------------------------------------------------------------------

export function databaseLevel(input: { error?: string; pingMs?: number }): HealthLevel {
  if (input.error) return 'down';
  const ms = input.pingMs ?? -1;
  if (!(ms >= 0)) return 'unknown';
  return ms > DB_PING_WARN_MS ? 'warn' : 'ok';
}

export function diskLevel(input: { freeBytes?: number | null; totalBytes?: number | null; error?: string }): HealthLevel {
  if (input.error) return 'warn'; // the volume answered badly, but the app is still serving
  const free = input.freeBytes;
  const total = input.totalBytes;
  // statfs is unavailable on some platforms/filesystems — that is "not measured", not "bad".
  if (free == null || !Number.isFinite(free)) return 'unknown';
  if (free < DISK_FREE_WARN_BYTES) return 'warn';
  if (total && total > 0 && free / total < DISK_FREE_WARN_RATIO) return 'warn';
  return 'ok';
}

export function aiLevel(input: { enabled: boolean; ready: boolean }): HealthLevel {
  if (!input.enabled) return 'unknown'; // AI is optional, off is a valid steady state
  return input.ready ? 'ok' : 'warn';
}

export function jobsLevel(input: { stuck: number; failed: number }): HealthLevel {
  if (input.stuck > 0) return 'warn';
  return input.failed > 0 ? 'warn' : 'ok';
}

export function syncLevel(input: { backend: string; reachable?: boolean | null; stale: boolean }): HealthLevel {
  if (!input.backend || input.backend === 'local') return 'unknown'; // no mirror configured
  if (input.reachable === false) return 'down';
  return input.stale ? 'warn' : 'ok';
}

/**
 * How many minutes a running job has been silent, from its last progress timestamp.
 * Negative ages (clock skew) count as 0 rather than as a "very fresh" job.
 */
export function stuckMinutes(updatedAt: Date | string | number | null | undefined, now: number): number {
  if (!updatedAt) return 0;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

export function isStuck(updatedAt: Date | string | number | null | undefined, now: number): boolean {
  return stuckMinutes(updatedAt, now) >= JOB_STUCK_MINUTES;
}

/**
 * The headline light. Worst wins (down > warn > ok); `unknown` never drags the headline
 * down, so an instance with AI off and no remote mirror still reports a clean "ok".
 * All-unknown (nothing measurable at all) stays unknown rather than claiming health.
 */
export function overallLevel(checks: { level: HealthLevel }[]): HealthLevel {
  if (checks.some((c) => c.level === 'down')) return 'down';
  if (checks.some((c) => c.level === 'warn')) return 'warn';
  if (checks.some((c) => c.level === 'ok')) return 'ok';
  return 'unknown';
}

/** Milliseconds as "12 ms" / "1.4 s" — ping times, kept out of the component. */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
