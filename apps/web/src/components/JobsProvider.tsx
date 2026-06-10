'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, X, ArrowUpRight } from 'lucide-react';
import { getActiveJobs, dismissJob, type SerializedJob } from '@/app/jobActions';

// ── Global background-job status ─────────────────────────────────────────────
// Jobs run SERVER-SIDE (lib/jobRunner) and live in MongoDB. Every device just polls
// getActiveJobs() and renders the same floating widget — so the status is identical
// from laptop and phone, survives page reloads / server restarts, and a job started
// on one device shows up everywhere. A browser notification fires when a job finishes.

type Ctx = {
  jobs: SerializedJob[];
  isRunning: (kind: string) => boolean;
  refresh: () => void;
};

const JobsContext = createContext<Ctx | null>(null);

export function useJobs(): Ctx {
  const c = useContext(JobsContext);
  if (!c) throw new Error('useJobs must be used within <JobsProvider>');
  return c;
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<SerializedJob[]>([]);
  const router = useRouter();
  const seenDone = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const js = await getActiveJobs();
      setJobs(js);
      for (const j of js) {
        if (j.status !== 'running' && !seenDone.current.has(j._id)) {
          seenDone.current.add(j._id);
          notify(j.title, `${j.ok}/${j.total} done`, j.href, router);
        }
      }
    } catch {
      /* transient — try again next tick */
    }
  }, [router]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [poll]);

  const isRunning = useCallback(
    (kind: string) => jobs.some((j) => j.status === 'running' && j.kind === kind),
    [jobs]
  );

  return (
    <JobsContext.Provider value={{ jobs, isRunning, refresh: poll }}>
      {children}
      <JobsWidget
        jobs={jobs}
        onDismiss={(id) => void dismissJob(id).then(poll)}
        onOpen={(href) => href && router.push(href)}
      />
    </JobsContext.Provider>
  );
}

function notify(title: string, body: string, href: string, router: ReturnType<typeof useRouter>) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: title });
      n.onclick = () => {
        window.focus();
        if (href) router.push(href);
        n.close();
      };
    }
  } catch {
    /* best-effort */
  }
}

function JobsWidget({
  jobs,
  onDismiss,
  onOpen,
}: {
  jobs: SerializedJob[];
  onDismiss: (id: string) => void;
  onOpen: (href: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[300px] max-w-[calc(100vw-2rem)]">
      {jobs.map((j) => {
        const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : 0;
        const running = j.status === 'running';
        return (
          <div
            key={j._id}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] shadow-lg p-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--color-text)] truncate">
                {running ? (
                  <Loader2 size={13} className="animate-spin text-[color:var(--color-accent)] shrink-0" />
                ) : j.status === 'error' ? (
                  <XCircle size={13} className="text-[color:var(--color-red)] shrink-0" />
                ) : (
                  <CheckCircle2 size={13} className="text-[color:var(--color-accent)] shrink-0" />
                )}
                <span className="truncate">{j.title}</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {j.href && (
                  <button onClick={() => onOpen(j.href)} title="Open" className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]">
                    <ArrowUpRight size={13} />
                  </button>
                )}
                <button
                  onClick={() => onDismiss(j._id)}
                  title={running ? 'Stop this job' : 'Dismiss'}
                  className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"
                >
                  <X size={13} />
                </button>
              </span>
            </div>

            <div className="h-1.5 bg-[color:var(--color-surface-3)] rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full bg-[color:var(--color-accent)] transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)]">
              <span>
                {j.done}/{j.total}
                {!running ? ` · ${j.ok} ok` : ''}
              </span>
              {running && (
                <span className="truncate max-w-[150px]">{j.current ? `↻ ${j.current}` : 'starting…'}</span>
              )}
            </div>

            {j.lastLabel && (
              <div className="flex items-center gap-1 mt-1 text-[10px] truncate">
                {j.lastOk ? (
                  <CheckCircle2 size={10} className="text-[color:var(--color-accent)] shrink-0" />
                ) : (
                  <XCircle size={10} className="text-[color:var(--color-red)] shrink-0" />
                )}
                <span className="text-[color:var(--color-text-dim)] truncate">
                  {j.lastLabel}
                  {j.lastDetail ? ` — ${j.lastDetail}` : ''}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
