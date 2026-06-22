'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Activity, UploadCloud, ScanLine, Sparkles, Loader2, CheckCircle2, XCircle, X, RefreshCw, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { getJobs, enqueueOnedriveSync, dismissJob, type JobRow } from '@/app/jobActions';

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
              <div key={j._id} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3" style={{ fontFamily: 'var(--font-mono)' }}>
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
                  <button onClick={() => dismiss(j._id)} title={running ? 'Stop' : 'Dismiss'} className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)]">
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
    </main>
  );
}

function StatusBadge({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running')
    return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-accent)]"><Loader2 size={10} className="animate-spin" /> running</span>;
  if (status === 'error')
    return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-red)]"><XCircle size={10} /> error</span>;
  return <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)]"><CheckCircle2 size={10} className="text-[color:var(--color-accent)]" /> done</span>;
}
