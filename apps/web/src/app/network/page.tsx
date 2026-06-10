import Link from 'next/link';
import { getUnifiSnapshot, type UnifiDevice } from '@/lib/unifi';
import { SpeedtestButton, ClientTable } from './NetworkClient';
import { Wifi, Router, Network as NetworkIcon, Cable, Settings, RefreshCw, Gauge, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

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

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[color:var(--color-text-faint)] block">{label}</span>
      {children}
    </div>
  );
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
        <div className="flex items-center gap-3">
          {snap.ok && <SpeedtestButton />}
          <Link href="/network" prefetch={false} className="flex items-center gap-1.5 text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] transition-colors" style={mono}>
            <RefreshCw size={13} /> refresh
          </Link>
        </div>
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
          {/* WAN / Internet banner */}
          <div className="mb-5 rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface)] to-[color:var(--color-surface-2)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${snap.wan.status === 'ok' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-red)]'}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)]" style={mono}>
                    Internet {snap.wan.isp && `· ${snap.wan.isp}`} {snap.wan.asn && <span className="opacity-60">{snap.wan.asn}</span>}
                  </p>
                  <p className="font-bold text-lg" style={display}>{snap.wan.status === 'ok' ? 'Online' : snap.wan.status}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs" style={mono}>
                {snap.wan.ip && <Stat label="Public IP"><span className="text-[color:var(--color-text)]">{snap.wan.ip}</span></Stat>}
                {snap.wan.latency != null && <Stat label="Latency"><span className="text-[color:var(--color-text)]">{snap.wan.latency} ms</span></Stat>}
                {snap.wan.uptimeSec > 0 && <Stat label="WAN uptime"><span className="text-[color:var(--color-text)]">{uptimeLabel(snap.wan.uptimeSec)}</span></Stat>}
                {snap.wan.availability != null && (
                  <Stat label="Availability">
                    <span className={snap.wan.availability >= 99.9 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-gold)]'}>{snap.wan.availability.toFixed(1)}%</span>
                  </Stat>
                )}
                {snap.wan.drops != null && (
                  <Stat label="Drops">
                    <span className={snap.wan.drops > 0 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text)]'}>{snap.wan.drops}</span>
                  </Stat>
                )}
                <Stat label="Clients"><span className="text-[color:var(--color-text)]">{snap.clientsTotal} ({snap.clientsWireless} wifi · {snap.clientsWired} wired)</span></Stat>
              </div>
            </div>

            {/* Speedtest row */}
            {snap.wan.speedtest && (
              <div className="mt-4 pt-4 border-t border-[color:var(--color-border)] flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={mono}>
                <span className="flex items-center gap-1.5 text-[color:var(--color-cyan)]"><Gauge size={13} /> Last speedtest</span>
                <Stat label="Download"><span className="text-[color:var(--color-accent)] font-bold">{snap.wan.speedtest.down} Mbps</span></Stat>
                <Stat label="Upload"><span className="text-[color:var(--color-cyan)] font-bold">{snap.wan.speedtest.up} Mbps</span></Stat>
                <Stat label="Ping"><span className="text-[color:var(--color-text)]">{snap.wan.speedtest.ping} ms</span></Stat>
                {snap.wan.speedtest.server && <Stat label="Server"><span className="text-[color:var(--color-text-dim)]">{snap.wan.speedtest.server}</span></Stat>}
                {snap.wan.speedtest.runAt > 0 && (
                  <Stat label="When"><span className="text-[color:var(--color-text-dim)]">{new Date(snap.wan.speedtest.runAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></Stat>
                )}
              </div>
            )}
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
                      <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                        {d.name}
                        {d.upgradable && <span title="Firmware update available"><ShieldCheck size={12} className="text-[color:var(--color-gold)]" /></span>}
                        {d.overheating && <span title="Overheating"><AlertTriangle size={12} className="text-[color:var(--color-red)]" /></span>}
                      </p>
                      <p className="text-[10px] text-[color:var(--color-text-faint)]" style={mono}>
                        {deviceKind(d.type)} · {d.model}{d.uplinkTo ? ` · ↑ ${d.uplinkTo}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.online ? 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10' : 'text-[color:var(--color-red)] bg-[color:var(--color-red)]/10'}`} style={mono}>
                    {d.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]" style={mono}>
                  <Stat label="Uptime">{uptimeLabel(d.uptimeSec)}</Stat>
                  <Stat label="Clients">{d.clients}</Stat>
                  <Stat label="Version"><span className="truncate block">{d.version || '—'}</span></Stat>
                  {d.cpu != null && <Stat label="CPU">{d.cpu}%</Stat>}
                  {d.mem != null && <Stat label="RAM">{d.mem}%</Stat>}
                  {d.tempC != null && (
                    <Stat label="Temp">
                      <span className={d.tempC >= 80 ? 'text-[color:var(--color-red)]' : d.tempC >= 70 ? 'text-[color:var(--color-gold)]' : ''}>{d.tempC}°C</span>
                    </Stat>
                  )}
                  {d.loadAvg != null && <Stat label="Load">{d.loadAvg.toFixed(2)}</Stat>}
                  {d.satisfaction != null && (
                    <Stat label="Health">
                      <span className={d.satisfaction >= 90 ? 'text-[color:var(--color-accent)]' : d.satisfaction >= 70 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-red)]'}>{d.satisfaction}%</span>
                    </Stat>
                  )}
                  {d.poeMaxW != null && d.poeMaxW > 0 && <Stat label="PoE max">{d.poeMaxW}W</Stat>}
                </div>

                {/* WiFi radios (APs) */}
                {d.radios.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[color:var(--color-border)] flex flex-wrap gap-1.5">
                    {d.radios.map((r) => (
                      <span key={r.band} className="text-[10px] px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]" style={mono} title={`${r.txPower != null ? `${r.txPower} dBm · ` : ''}${r.clients} clients`}>
                        <span className="text-[color:var(--color-text)] font-semibold">{r.band}G</span>
                        {r.channel != null && <span className="text-[color:var(--color-text-faint)]"> ch{r.channel}</span>}
                        <span className="text-[color:var(--color-text-dim)]"> · {r.clients}</span>
                        {r.utilization != null && (
                          <span className={r.utilization >= 60 ? 'text-[color:var(--color-red)]' : r.utilization >= 35 ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-accent)]'}> · {r.utilization}%</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Active ports (gateways/switches) */}
                {d.ports.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[color:var(--color-border)] flex flex-wrap gap-1.5">
                    {d.ports.map((p, pi) => (
                      <span key={pi} className="text-[10px] px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]" style={mono} title={p.name}>
                        <span className="text-[color:var(--color-accent)]">●</span>{' '}
                        <span className="text-[color:var(--color-text-dim)]">{p.name.replace(/^Port /, 'P')}</span>{' '}
                        <span className={p.speedMbps >= 2500 ? 'text-[color:var(--color-cyan)] font-semibold' : 'text-[color:var(--color-text-faint)]'}>{p.speedMbps >= 1000 ? `${p.speedMbps / 1000}G` : `${p.speedMbps}M`}</span>
                        {p.poeW != null && p.poeW > 0 && <span className="text-[color:var(--color-gold)]"> ⚡{p.poeW}W</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Client table */}
          <div className="mb-6">
            <ClientTable clients={snap.clients} />
          </div>

          {/* Networks + VPN */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {snap.byNetwork.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-3" style={mono}>Clients by network</p>
                <div className="flex flex-wrap gap-2">
                  {snap.byNetwork.map((n) => (
                    <span key={n.name} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)]" style={mono}>
                      {n.name} <span className="text-[color:var(--color-accent)] font-bold">{n.n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {snap.vpn && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-3" style={mono}>VPN</p>
                <div className="flex flex-wrap gap-2 text-xs" style={mono}>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)]">
                    <Lock size={12} className={snap.vpn.remoteUser ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'} />
                    Remote users <span className={snap.vpn.remoteUser ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'}>{snap.vpn.remoteUser ? 'on' : 'off'}</span>
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--color-surface)] border border-[color:var(--color-border)]">
                    <NetworkIcon size={12} className={snap.vpn.siteToSite ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'} />
                    Site-to-site <span className={snap.vpn.siteToSite ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)]'}>{snap.vpn.siteToSite ? `${snap.vpn.siteToSiteActive} active` : 'off'}</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-6" style={mono}>
            via UniFi Controller @ local gateway · snapshot {new Date(snap.fetchedAt).toLocaleTimeString('en-GB')} · cached 30s
          </p>
        </>
      )}
    </main>
  );
}
