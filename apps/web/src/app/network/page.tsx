import Link from 'next/link';
import { getUnifiSnapshot, type UnifiDevice } from '@/lib/unifi';
import { Wifi, Router, Network as NetworkIcon, Cable, Settings, RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

const mono = { fontFamily: 'var(--font-mono)' } as const;
const display = { fontFamily: 'var(--font-display)' } as const;

function uptimeLabel(sec: number): string {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function deviceIcon(type: string) {
  if (type === 'uap') return <Wifi size={18} />;
  if (type === 'usw') return <Cable size={18} />;
  return <Router size={18} />; // ugw / udm / gateway
}

function deviceKind(type: string): string {
  if (type === 'uap') return 'Access Point';
  if (type === 'usw') return 'Switch';
  return 'Gateway';
}

export default async function NetworkPage() {
  const snap = await getUnifiSnapshot();

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-16">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={display}>
          Network
          {snap.ok && (
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={mono}>
              {snap.clientsTotal} clients
            </span>
          )}
        </h1>
        <Link href="/network" prefetch={false} className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors" style={mono}>
          <RefreshCw size={13} /> refresh
        </Link>
      </div>

      {!snap.ok ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 text-center">
          <NetworkIcon size={32} className="mx-auto mb-3 text-[color:var(--color-text-faint)]" />
          {snap.error === 'not-configured' ? (
            <>
              <p className="font-semibold mb-1">UniFi is not connected yet</p>
              <p className="text-sm text-[color:var(--color-text-dim)] mb-4">
                Add the gateway address and a read-only local user, then enable it.
              </p>
              <Link href="/settings" prefetch={false} className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90">
                <Settings size={15} /> Open Settings
              </Link>
            </>
          ) : (
            <>
              <p className="font-semibold mb-1 text-[color:var(--color-red)]">Can&apos;t reach the controller</p>
              <p className="text-sm text-[color:var(--color-text-dim)]" style={mono}>{snap.error}</p>
              <p className="text-xs text-[color:var(--color-text-faint)] mt-3">
                Check the host/credentials in Settings → Network, and that the gateway is reachable from this machine.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* WAN banner */}
          <div className="mb-5 rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface)] to-[color:var(--color-surface-2)] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${snap.wan.status === 'ok' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-red)]'}`} />
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={mono}>WAN</p>
                <p className="font-bold text-lg" style={display}>{snap.wan.status === 'ok' ? 'Online' : snap.wan.status}</p>
              </div>
            </div>
            <div className="flex gap-6 text-xs" style={mono}>
              {snap.wan.ip && (
                <div>
                  <span className="text-[color:var(--color-text-faint)] block mb-0.5">Public IP</span>
                  <span className="text-[color:var(--color-text)]">{snap.wan.ip}</span>
                </div>
              )}
              {snap.wan.latency != null && (
                <div>
                  <span className="text-[color:var(--color-text-faint)] block mb-0.5">Latency</span>
                  <span className="text-[color:var(--color-text)]">{snap.wan.latency} ms</span>
                </div>
              )}
              <div>
                <span className="text-[color:var(--color-text-faint)] block mb-0.5">Clients</span>
                <span className="text-[color:var(--color-text)]">{snap.clientsTotal} ({snap.clientsWireless} wifi · {snap.clientsWired} wired)</span>
              </div>
            </div>
          </div>

          {/* Devices */}
          <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-3" style={mono}>
            Devices ({snap.devices.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {snap.devices.map((d: UnifiDevice, i) => (
              <div key={i} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid place-items-center w-9 h-9 rounded-xl border ${d.online ? 'text-[color:var(--color-accent)] border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10' : 'text-[color:var(--color-red)] border-[color:var(--color-red)]/30 bg-[color:var(--color-red)]/10'}`}>
                      {deviceIcon(d.type)}
                    </span>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{d.name}</p>
                      <p className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>{deviceKind(d.type)} · {d.model}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.online ? 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10' : 'text-[color:var(--color-red)] bg-[color:var(--color-red)]/10'}`} style={mono}>
                    {d.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]" style={mono}>
                  <div><span className="text-[color:var(--color-text-faint)] block">Uptime</span>{uptimeLabel(d.uptimeSec)}</div>
                  <div><span className="text-[color:var(--color-text-faint)] block">Clients</span>{d.clients}</div>
                  <div><span className="text-[color:var(--color-text-faint)] block">Version</span><span className="truncate block">{d.version || '—'}</span></div>
                  {d.cpu != null && <div><span className="text-[color:var(--color-text-faint)] block">CPU</span>{d.cpu}%</div>}
                  {d.mem != null && <div><span className="text-[color:var(--color-text-faint)] block">RAM</span>{d.mem}%</div>}
                  {d.tempC != null && (
                    <div>
                      <span className="text-[color:var(--color-text-faint)] block">Temp</span>
                      <span className={d.tempC >= 80 ? 'text-[color:var(--color-red)]' : d.tempC >= 70 ? 'text-[color:var(--color-gold)]' : ''}>{d.tempC}°C</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Clients per network */}
          {snap.byNetwork.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-3" style={mono}>
                Clients by network
              </p>
              <div className="flex flex-wrap gap-2">
                {snap.byNetwork.map((n) => (
                  <span key={n.name} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)]" style={mono}>
                    {n.name} <span className="text-[color:var(--color-accent)] font-bold">{n.n}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-6" style={mono}>
            via UniFi Controller @ local gateway · snapshot {new Date(snap.fetchedAt).toLocaleTimeString('en-GB')} · cached 30s
          </p>
        </>
      )}
    </main>
  );
}
