import { cur } from "@/lib/money";
import { connectDB } from '@/lib/db';
import { Job } from '@/models/Job';
import { rescanReceipt } from '@/app/receipts/actions';
import { aiFillItem } from '@/app/items/actions';

// ── In-process background worker ──────────────────────────────────────────────
// Runs in the persistent Next standalone Node server, independent of any browser.
// Jobs are MongoDB docs (models/Job) so progress survives reloads and is identical
// from every device. Each running job gets its OWN concurrent loop — so a small
// "AI fill 5" job doesn't wait hours behind a 238-item re-scan (they interleave;
// Ollama serialises the actual inference). `ensureProcessor()` is called on enqueue
// AND on every poll, so new jobs start at once and a server restart auto-resumes
// running jobs from `job.done`.

const active = new Set<string>(); // job ids whose loop is already running here
const PER_ITEM_TIMEOUT = 120_000; // a single hung item can't stall its job

export async function ensureProcessor(): Promise<void> {
  await connectDB();
  const jobs = await Job.find({ status: 'running' }).sort({ createdAt: 1 }).lean();
  for (const job of jobs) {
    const id = String(job._id);
    if (active.has(id)) continue;
    active.add(id);
    void runJobLoop(id, job.kind, job.useOcr, job.itemIds ?? [], job.labels ?? [], job.done ?? 0)
      .catch(async (e) => {
        await Job.updateOne(
          { _id: id },
          { $set: { status: 'error', error: ((e as Error).message || 'failed').slice(0, 200), current: '' } }
        ).catch(() => {});
      })
      .finally(() => active.delete(id));
  }
}

async function runJobLoop(
  id: string,
  kind: string,
  useOcr: boolean,
  itemIds: string[],
  labels: string[],
  startAt: number
): Promise<void> {
  for (let i = startAt; i < itemIds.length; i++) {
    // A job can be cancelled/finished out-of-band — stop if it's no longer running.
    const live = await Job.findById(id).select('status').lean();
    if (!live || live.status !== 'running') return;

    const label = labels[i] || '…';
    await Job.updateOne({ _id: id }, { $set: { current: label } });
    let res: { ok: boolean; detail: string };
    try {
      res = await withTimeout(runOne(kind, itemIds[i], useOcr), PER_ITEM_TIMEOUT, {
        ok: false,
        detail: 'timed out',
      });
    } catch (e) {
      res = { ok: false, detail: ((e as Error).message || 'failed').slice(0, 80) };
    }
    await Job.updateOne(
      { _id: id },
      {
        $set: { done: i + 1, current: '', lastLabel: label, lastOk: res.ok, lastDetail: res.detail },
        $inc: { ok: res.ok ? 1 : 0 },
      }
    );
  }
  await Job.updateOne({ _id: id }, { $set: { status: 'done', current: '', finishedAt: new Date() } });
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

async function runOne(kind: string, id: string, useOcr: boolean): Promise<{ ok: boolean; detail: string }> {
  if (kind === 'rescan-receipts') {
    const r = await rescanReceipt(id, useOcr);
    const ok = !!(r.ok && r.receipt && ((r.receipt.total ?? 0) > 0 || (r.receipt.lineItems?.length ?? 0) > 0));
    return {
      ok,
      detail: (ok ? `${r.receipt!.store} ${cur()}${r.receipt!.total}` : r.aiError || r.error || 'still empty').slice(0, 80),
    };
  }
  if (kind === 'ai-fill-items') {
    const r = await aiFillItem(id);
    return {
      ok: !!(r.ok && r.filled.length > 0),
      detail: (r.filled?.length ? r.filled.join(', ') : r.error || '—').slice(0, 80),
    };
  }
  return { ok: false, detail: 'unknown job kind' };
}
