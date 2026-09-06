'use server';
import { connectDB } from '@/lib/db';
import { Job } from '@/models/Job';
import { ensureProcessor } from '@/lib/jobRunner';
import { getAiConfig } from '@/lib/aiConfig';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { AppConfig as AppConfigModel } from '@/models/AppConfig';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getSyncManifest } from './settings/actions';
import { assertCanWrite } from '@/lib/auth';

/** Cost-guard info for a bulk AI run: whether to confirm + the active provider/model
 *  (so the client can show a rough cost estimate before starting a paid job). */
export async function getBulkAiGuard(): Promise<{ confirm: boolean; provider: string; model: string }> {
  await connectDB();
  // Both halves must answer for the SAME workspace: the toggle lives in this tenant's
  // AppConfig, and getAiConfig() reads whatever tenant is ambient. Outside a wrap the
  // ambient tenant is the DEFAULT one, so in SaaS every workspace was shown the default
  // workspace's confirm toggle and provider/model, i.e. someone else's cost estimate.
  // Self-hosted is unchanged: with no tenant established currentModel(X) is X.
  return withRequestTenant(async () => {
    const AppConfig = await currentModel(AppConfigModel);
    const [cfg, doc] = await Promise.all([
      getAiConfig(),
      AppConfig.findOne({ key: 'singleton' }).select('aiConfirmBulk').lean(),
    ]);
    return {
      confirm: doc?.aiConfirmBulk !== false, // default ON
      provider: cfg.provider,
      model: cfg.provider === 'anthropic' ? cfg.anthropicModel : cfg.ollamaModel,
    };
  });
}

export type SerializedJob = {
  _id: string;
  kind: string;
  title: string;
  href: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  ok: number;
  current: string;
  lastLabel: string;
  lastOk: boolean;
  lastDetail: string;
  error: string;
};

export async function enqueueRescanReceipts(
  itemIds: string[],
  labels: string[],
  useOcr = true
): Promise<{ ok: boolean }> {
  await assertCanWrite();
  if (!itemIds.length) return { ok: false };
  if (!(await isFeatureEnabled('receipts'))) return { ok: false };
  await connectDB();
  await Job.create({
    kind: 'rescan-receipts',
    title: 'Re-scan receipts',
    href: '/receipts',
    itemIds,
    labels,
    useOcr,
    total: itemIds.length,
    status: 'running',
  });
  void ensureProcessor();
  return { ok: true };
}

export async function enqueueAiFillItems(
  itemIds: string[],
  labels: string[],
  href: string,
  title: string
): Promise<{ ok: boolean }> {
  await assertCanWrite();
  if (!itemIds.length) return { ok: false };
  if (!(await isFeatureEnabled('itemsImport'))) return { ok: false };
  await connectDB();
  await Job.create({
    kind: 'ai-fill-items',
    title,
    href,
    itemIds,
    labels,
    total: itemIds.length,
    status: 'running',
  });
  void ensureProcessor();
  return { ok: true };
}

/** Queue a OneDrive sync as a background job — one file per work item, with live
 *  progress. Runs through the same worker as the AI jobs (lib/jobRunner). */
export async function enqueueOnedriveSync(): Promise<{ ok: boolean; error?: string; count?: number }> {
  await assertCanWrite();
  await connectDB();
  if (await Job.countDocuments({ kind: 'sync-onedrive', status: 'running' })) {
    return { ok: false, error: 'A sync is already running.' };
  }
  const manifest = await getSyncManifest();
  if (!manifest.ok) return { ok: false, error: manifest.error || 'Sync is not available.' };
  if (!manifest.items.length) return { ok: false, error: 'Nothing to sync.' };
  await Job.create({
    kind: 'sync-onedrive',
    title: 'Sync to OneDrive',
    href: '/jobs',
    itemIds: manifest.items.map((i) => i.filePath),
    labels: manifest.items.map((i) => i.rel),
    total: manifest.items.length,
    status: 'running',
  });
  void ensureProcessor();
  return { ok: true, count: manifest.items.length };
}

export type JobRow = SerializedJob & { createdAt: string; finishedAt: string | null };

/** All recent jobs (running first, then newest) — the full /jobs page view. */
export async function getJobs(): Promise<JobRow[]> {
  await connectDB();
  void ensureProcessor(); // self-heal a running job after a server restart
  const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(60).lean();
  const rows: JobRow[] = jobs.map((j) => ({
    _id: String(j._id),
    kind: j.kind,
    title: j.title,
    href: j.href ?? '',
    status: j.status as SerializedJob['status'],
    total: j.total ?? 0,
    done: j.done ?? 0,
    ok: j.ok ?? 0,
    current: j.current ?? '',
    lastLabel: j.lastLabel ?? '',
    lastOk: j.lastOk ?? true,
    lastDetail: j.lastDetail ?? '',
    error: j.error ?? '',
    createdAt: (j as { createdAt: Date }).createdAt.toISOString(),
    finishedAt: j.finishedAt ? (j.finishedAt as Date).toISOString() : null,
  }));
  const rank = (s: string) => (s === 'running' ? 0 : 1);
  return rows.sort((a, b) => rank(a.status) - rank(b.status) || (a.createdAt < b.createdAt ? 1 : -1));
}

export type JobItemResult = { label: string; ok: boolean; detail: string };
export type JobDetail = JobRow & { labels: string[]; itemCount: number; useOcr: boolean; results: JobItemResult[] };

/** Full detail for one job — incl. the work list (labels) and per-item outcomes. */
export async function getJobDetail(id: string): Promise<JobDetail | null> {
  await connectDB();
  const j = await Job.findById(id).lean();
  if (!j) return null;
  return {
    _id: String(j._id),
    kind: j.kind,
    title: j.title,
    href: j.href ?? '',
    status: j.status as SerializedJob['status'],
    total: j.total ?? 0,
    done: j.done ?? 0,
    ok: j.ok ?? 0,
    current: j.current ?? '',
    lastLabel: j.lastLabel ?? '',
    lastOk: j.lastOk ?? true,
    lastDetail: j.lastDetail ?? '',
    error: j.error ?? '',
    createdAt: (j as { createdAt: Date }).createdAt.toISOString(),
    finishedAt: j.finishedAt ? (j.finishedAt as Date).toISOString() : null,
    labels: (j.labels ?? []).map(String),
    itemCount: (j.itemIds ?? []).length,
    useOcr: j.useOcr ?? false,
    results: (j.results ?? []).map((r) => ({ label: String(r.label ?? ''), ok: !!r.ok, detail: String(r.detail ?? '') })),
  };
}

/** Running jobs + ones finished in the last 10 min (so the "done" state lingers
 *  briefly for the notification). Polled by every device — identical view. */
export async function getActiveJobs(): Promise<SerializedJob[]> {
  await connectDB();
  void ensureProcessor(); // self-heal: resume a running job after a server restart
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const jobs = await Job.find({ $or: [{ status: 'running' }, { finishedAt: { $gte: cutoff } }] })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();
  return jobs.map((j) => ({
    _id: String(j._id),
    kind: j.kind,
    title: j.title,
    href: j.href ?? '',
    status: j.status as SerializedJob['status'],
    total: j.total ?? 0,
    done: j.done ?? 0,
    ok: j.ok ?? 0,
    current: j.current ?? '',
    lastLabel: j.lastLabel ?? '',
    lastOk: j.lastOk ?? true,
    lastDetail: j.lastDetail ?? '',
    error: j.error ?? '',
  }));
}

/** Stop (if running) or dismiss (if finished) a job. The worker loop re-checks the
 *  job's status before each item, so deleting a running job halts it within one item. */
export async function dismissJob(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await Job.deleteOne({ _id: id });
  return { ok: true };
}

export async function isJobRunning(kind: string): Promise<boolean> {
  await connectDB();
  return (await Job.countDocuments({ kind, status: 'running' })) > 0;
}
