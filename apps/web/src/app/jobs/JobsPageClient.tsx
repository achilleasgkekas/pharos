'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Activity, UploadCloud, ScanLine, Sparkles, Loader2, CheckCircle2, XCircle, X, RefreshCw, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';
import { getJobs, enqueueOnedriveSync, dismissJob, getJobDetail, type JobRow, type JobDetail, type JobItemResult } from '@/app/jobActions';

const KIND: Record<string, { label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  'sync-onedrive': { label: 'OneDrive sync', Icon: UploadCloud },
  'rescan-receipts': { label: 'Receipt re-scan', Icon: ScanLine },
  'ai-fill-items': { label: 'AI fill', Icon: Sparkles },
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function dur(fromIso: string, toIso: string | null): string {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function JobsPageClient({
  initialJobs,
  sync,
}: {
  initialJobs: JobRow[];
  sync: { ok: boolean; error?: string; count: number };
}) {
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);

  function openDetail(id: string) {
    setDetailOpen(true);
    setDetail(null);
    getJobDetail(id).then(setDetail);
  }

  const refresh = async () => {
    try { setJobs(await getJobs()); } catch { /* transient */ }
  };

  // Live poll while the page is open (a bit faster when something is running).
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running');
    const iv = setInterval(refresh, hasRunning ? 2000 : 5000);
    return () => clearInterval(iv);
  }, [jobs]);

  const syncRunning = jobs.some((j) => j.kind === 'sync-onedrive' && j.status === 'running');

  function startSync() {
    setMsg(null);
    start(async () => {
      const r = await enqueueOnedriveSync();
      if (!r.ok) setMsg(r.error || 'Could not start sync.');
      else setMsg(`Syncing ${r.count} file${r.count === 1 ? '' : 's'}…`);
      await refresh();
    });
  }

  function dismiss(id: string) {
    start(async () => {
      await dismissJob(id);
      await refresh();
    });
  }

  return (
    <main className="max-w-[900px] mx-auto px-4 py-6 pb-24">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2.5" style={{ fontFamily: 'var(--font-display)' }}>
          <Activity size={24} className="text-[color:var(--color-accent)]" />
          Jobs
          <span className="text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {jobs.length}
          </span>
        </h1>
        <button onClick={refresh} disabled={pending} className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <RefreshCw size={13} className={cn(pending && 'animate-spin')} /> refresh
        </button>
      </div>
      <p className="text-xs text-[color:var(--color-text-faint)] mb-5">
        Background tasks run on the server and keep going if you close the tab. Start them here and watch live progress.
      </p>

      {/* Start a job */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 mb-6">
        <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-3" style={{ fontFamily: 'var(--font-mono)' }}>Start a job</p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-[color:var(--color-cyan)]/10 text-[color:var(--color-cyan)] shrink-0">
              <UploadCloud size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">Sync files to OneDrive</div>
              <div className="text-[11px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                {sync.ok ? `${sync.count} file${sync.count === 1 ? '' : 's'} ready to mirror` : sync.error || 'Not available'}
              </div>
            </div>
          </div>
          {sync.ok ? (
            <Button variant="primary" size="md" onClick={startSync} disabled={pending || syncRunning}>
              {syncRunning ? <><Loader2 size={14} className="animate-spin" /> Syncing…</> : <><UploadCloud size={14} /> Sync now</>}
            </Button>
          ) : (
            <Link href="/settings" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]">
              <Settings size={13} /> Set up in Settings
            </Link>
          )}
        </div>
        {msg && <p className="mt-3 text-xs text-[color:var(--color-text-dim)]">{msg}</p>}
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-16 text-center">
          <Activity size={30} className="mx-auto text-[color:var(--color-text-faint)] opacity-40" />
          <p className="mt-3 text-sm text-[color:var(--color-text-dim)]">No jobs yet.</p>
          <p className="text-xs text-[color:var(--color-text-faint)]">AI fills, receipt re-scans and syncs show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const meta = KIND[j.kind] ?? { label: j.kind, Icon: Activity };
            const Icon = meta.Icon;
            const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : j.status === 'done' ? 100 : 0;
            const running = j.status === 'running';
            return (
              <div key={j._id} onClick={() => openDetail(j._id)} title="View details" className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 cursor-pointer hover:border-[color:var(--color-border-light)] transition-colors" style={{ fontFamily: 'var(--font-mono)' }}>
                <div className="flex items-center gap-2.5 mb-2">
                  <Icon size={16} className="shrink-0 text-[color:var(--color-text-dim)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[color:var(--color-text)] truncate" style={{ fontFamily: 'var(--font-body)' }}>{j.title}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="text-[10px] text-[color:var(--color-text-faint)]">
                      {meta.label} · {running ? `started ${ago(j.createdAt)}` : j.finishedAt ? `finished ${ago(j.finishedAt)}` : ago(j.createdAt)}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); dismiss(j._id); }} title={running ? 'Stop' : 'Dismiss'} className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)]">
                    <X size={15} />
                  </button>
                </div>

                <div className="h-1.5 bg-[color:var(--color-surface-3)] rounded-full overflow-hidden mb-1.5">
                  <div
                    className={cn('h-full rounded-full transition-all', j.status === 'error' ? 'bg-[color:var(--color-red)]' : 'bg-[color:var(--color-accent)]')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)]">
                  <span>
                    {j.done}/{j.total}{!running && j.total > 0 ? ` · ${j.ok} ok` : ''}
                  </span>
                  {running && <span className="truncate max-w-[55%]">{j.current ? `↻ ${j.current}` : 'starting…'}</span>}
                </div>
                {j.error && <p className="mt-1 text-[10px] text-[color:var(--color-red)] truncate">{j.error}</p>}
                {!j.error && j.lastLabel && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] truncate">
                    {j.lastOk ? <CheckCircle2 size={10} className="text-[color:var(--color-accent)] shrink-0" /> : <XCircle size={10} className="text-[color:var(--color-red)] shrink-0" />}
                    <span className="text-[color:var(--color-text-dim)] truncate">{j.lastLabel}{j.lastDetail ? ` — ${j.lastDetail}` : ''}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={detail?.title || 'Job'} size="lg">
        {!detail ? (
          <div className="py-12 grid place-items-center text-[color:var(--color-text-faint)]"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <JobDetailView d={detail} />
        )}
      </Modal>
    </main>
  );
}

function JobDetailView({ d }: { d: JobDetail }) {
  const [failedOnly, setFailedOnly] = useState(false);
  const meta = KIND[d.kind] ?? { label: d.kind, Icon: Activity };
  const Icon = meta.Icon;
  const failed = Math.max(0, d.done - d.ok);
  const hasOutcomes = d.results.length > 0;
  const failedResults = d.results.filter((r) => !r.ok);
  const baseRows: JobItemResult[] = hasOutcomes ? d.results : d.labels.map((label) => ({ label, ok: true, detail: '' }));
  const rows = hasOutcomes && failedOnly ? failedResults : baseRows;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        <span className="flex items-center gap-1"><Icon size={12} /> {meta.label}</span>
        <StatusBadge status={d.status} />
        <span>started {ago(d.createdAt)}</span>
        {d.finishedAt && <span>· finished {ago(d.finishedAt)}</span>}
        <span>· took {dur(d.createdAt, d.finishedAt)}</span>
        {d.kind === 'rescan-receipts' && <span>· {d.useOcr ? 'OCR' : 'text'} mode</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="total" value={d.total} />
        <Stat label="ok" value={d.ok} tone="ok" />
        {d.status === 'running' ? <Stat label="done" value={d.done} /> : <Stat label="failed" value={failed} tone={failed ? 'bad' : undefined} />}
      </div>

      {d.error && <p className="text-xs text-[color:var(--color-red)] bg-[color:var(--color-red)]/10 rounded-lg px-3 py-2 break-words">{d.error}</p>}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {hasOutcomes ? (failedOnly ? `Failed · ${failedResults.length}` : `Items · ${baseRows.length}`) : `Work list · ${d.itemCount}`}
          </p>
          {hasOutcomes && failedResults.length > 0 && (
            <button
              onClick={() => setFailedOnly((v) => !v)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                failedOnly
                  ? 'border-[color:var(--color-red)]/40 text-[color:var(--color-red)] bg-[color:var(--color-red)]/10'
                  : 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {failedOnly ? 'show all' : `failed only · ${failedResults.length}`}
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)]">{failedOnly ? 'No failures.' : 'No items recorded.'}</p>
        ) : (
          <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-[color:var(--color-border)] divide-y divide-[color:var(--color-border)]">
            {rows.map((r, i) => {
              const bad = hasOutcomes && !r.ok;
              return (
                <div key={i} className={cn('flex items-start gap-2 px-3 py-2', bad && 'bg-[color:var(--color-red)]/[0.05]')}>
                  {hasOutcomes ? (
                    r.ok ? <CheckCircle2 size={13} className="text-[color:var(--color-accent)] shrink-0 mt-0.5" /> : <XCircle size={13} className="text-[color:var(--color-red)] shrink-0 mt-0.5" />
                  ) : (
                    <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-[color:var(--color-text-faint)]" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs text-[color:var(--color-text)] break-words">{r.label || '—'}</div>
                    {r.detail && (
                      <div
                        className={cn('text-[10px] break-words mt-0.5', bad ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-text-faint)]')}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {bad ? '⚠ ' : ''}{r.detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!hasOutcomes && d.status !== 'running' && (
          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5">Per-item outcomes weren&apos;t recorded for this older job — showing its work list. Run it again to capture per-item results.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2 text-center', tone === 'ok' ? 'border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/5' : tone === 'bad' ? 'border-[color:var(--color-red)]/30 bg-[color:var(--color-red)]/5' : 'border-[color:var(--color-border)]')}>
      <div className={cn('text-xl font-bold', tone === 'ok' ? 'text-[color:var(--color-accent)]' : tone === 'bad' ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-text)]')} style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running')
    return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-accent)]"><Loader2 size={10} className="animate-spin" /> running</span>;
  if (status === 'error')
    return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-red)]"><XCircle size={10} /> error</span>;
  return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)]"><CheckCircle2 size={10} className="text-[color:var(--color-accent)]" /> done</span>;
}
