'use client';
import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Loader2, Search, Cable, Wifi } from 'lucide-react';
import type { UnifiClient } from '@/lib/unifi';
import { triggerSpeedtest } from '../settings/actions';

const mono = { fontFamily: 'var(--font-mono)' } as const;

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

/** Signal colour: stronger (closer to 0) is greener. */
function signalColor(dbm: number): string {
  if (dbm >= -55) return 'var(--color-accent)';
  if (dbm >= -67) return 'var(--color-gold)';
  return 'var(--color-red)';
}

export function SpeedtestButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setMsg('Running… (takes ~15s, refresh to see the result)');
    startTransition(async () => {
      const r = await triggerSpeedtest();
      if (r.ok) {
        setMsg('Started ✓ — refreshing in 20s…');
        setTimeout(() => router.refresh(), 20000);
      } else {
        setMsg(`Failed: ${r.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={pending}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] transition-colors disabled:opacity-50"
        style={mono}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />} Run speedtest
      </button>
      {msg && <span className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>{msg}</span>}
    </div>
  );
}

type SortKey = 'data' | 'name' | 'signal';

export function ClientTable({ clients }: { clients: UnifiClient[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('data');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? clients.filter((c) => `${c.name} ${c.ip} ${c.vendor} ${c.network}`.toLowerCase().includes(needle))
      : clients;
    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'signal') sorted.sort((a, b) => (b.signal ?? -999) - (a.signal ?? -999));
    else sorted.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));
    return sorted;
  }, [clients, q, sort]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={mono}>
          Clients ({clients.length})
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search name / IP / vendor"
              className="text-xs pl-7 pr-2 py-1.5 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none w-52"
              style={mono}
            />
          </div>
          <div className="flex gap-0.5 text-[10px]" style={mono}>
            {(['data', 'name', 'signal'] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-2 py-1.5 rounded-md border transition-colors ${
                  sort === k
                    ? 'bg-[color:var(--color-accent)] text-black border-transparent'
                    : 'bg-[color:var(--color-surface)] border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--color-border)] overflow-hidden">
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-xs" style={mono}>
            <thead className="sticky top-0 bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-3 py-2">Device</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">IP</th>
                <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Network</th>
                <th className="text-left font-medium px-3 py-2">Signal</th>
                <th className="text-right font-medium px-3 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.ip}-${i}`} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.wired ? <Cable size={12} className="shrink-0 text-[color:var(--color-text-faint)]" /> : <Wifi size={12} className="shrink-0 text-[color:var(--color-text-faint)]" />}
                      <div className="min-w-0">
                        <span className="block truncate text-[color:var(--color-text)] max-w-[14rem]">{c.name}</span>
                        {c.vendor && <span className="block truncate text-[9px] text-[color:var(--color-text-faint)] max-w-[14rem]">{c.vendor}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--color-text-dim)] hidden sm:table-cell">{c.ip}</td>
                  <td className="px-3 py-2 text-[color:var(--color-text-dim)] hidden md:table-cell">{c.network}</td>
                  <td className="px-3 py-2">
                    {c.wired ? (
                      <span className="text-[color:var(--color-text-faint)]">wired</span>
                    ) : c.signal != null ? (
                      <span style={{ color: signalColor(c.signal) }}>{c.signal} dBm</span>
                    ) : (
                      <span className="text-[color:var(--color-text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[color:var(--color-text)]">{fmtBytes(c.rxBytes + c.txBytes)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--color-text-faint)]">No matching clients.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
