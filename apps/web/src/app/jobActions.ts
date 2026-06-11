'use server';
import { connectDB } from '@/lib/db';
import { Job } from '@/models/Job';
import { ensureProcessor } from '@/lib/jobRunner';
import { getAiConfig } from '@/lib/aiConfig';
import { isFeatureEnabled } from '@/lib/aiFeatures.server';
import { AppConfig } from '@/models/AppConfig';

/** Cost-guard info for a bulk AI run: whether to confirm + the active provider/model
 *  (so the client can show a rough cost estimate before starting a paid job). */
export async function getBulkAiGuard(): Promise<{ confirm: boolean; provider: string; model: string }> {
  await connectDB();
  const [cfg, doc] = await Promise.all([
    getAiConfig(),
    AppConfig.findOne({ key: 'singleton' }).select('aiConfirmBulk').lean(),
  ]);
  return {
    confirm: doc?.aiConfirmBulk !== false, // default ON
    provider: cfg.provider,
    model: cfg.provider === 'anthropic' ? cfg.anthropicModel : cfg.ollamaModel,
  };
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
  await connectDB();
  await Job.deleteOne({ _id: id });
  return { ok: true };
}

export async function isJobRunning(kind: string): Promise<boolean> {
  await connectDB();
  return (await Job.countDocuments({ kind, status: 'running' })) > 0;
}
