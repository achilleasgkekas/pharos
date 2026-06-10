import 'server-only';
import https from 'node:https';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';

// ─── UniFi Controller client (UniFi OS gateway: UCG-Fiber / UDM / UCG-Ultra) ──
// Talks to the LOCAL controller API on the gateway with a read-only local user.
// The gateway serves a self-signed cert on the LAN, so requests go through
// node:https with rejectUnauthorized:false (LAN-only traffic, never the internet).

export type UnifiConfig = { host: string; user: string; pass: string; enabled: boolean };

export type UnifiDevice = {
  name: string;
  model: string;
  type: string; // ugw/udm = gateway, usw = switch, uap = AP
  online: boolean;
  version: string;
  uptimeSec: number;
  clients: number;
  cpu: number | null;
  mem: number | null;
  tempC: number | null; // CPU temperature (gateways report it; APs usually don't)
  satisfaction: number | null; // experience score 0-100
  loadAvg: number | null; // 1-min load average
  upgradable: boolean; // firmware update available
  overheating: boolean;
  poeMaxW: number | null; // PoE power budget (switches/gateways)
  uplinkTo: string; // name of the device this one uplinks through
};

export type UnifiClient = {
  name: string;
  ip: string;
  vendor: string; // OUI
  network: string; // VLAN / network name
  wired: boolean;
  signal: number | null; // dBm (wifi only)
  rxBytes: number;
  txBytes: number;
  uptimeSec: number;
};

export type UnifiWan = {
  status: string;
  ip: string;
  latency: number | null;
  isp: string;
  asn: string;
  uptimeSec: number;
  drops: number | null;
  availability: number | null; // % from the gateway's uplink monitor
  dns: string[];
  speedtest: { down: number; up: number; ping: number; server: string; runAt: number } | null;
};

export type UnifiVpn = { remoteUser: boolean; siteToSite: boolean; siteToSiteActive: number } | null;

export type UnifiSnapshot = {
  ok: boolean;
  error?: string;
  wan: UnifiWan;
  vpn: UnifiVpn;
  devices: UnifiDevice[];
  clients: UnifiClient[];
  clientsTotal: number;
  clientsWired: number;
  clientsWireless: number;
  byNetwork: { name: string; n: number }[];
  fetchedAt: string;
};

const EMPTY: Omit<UnifiSnapshot, 'ok' | 'error'> = {
  wan: { status: 'unknown', ip: '', latency: null, isp: '', asn: '', uptimeSec: 0, drops: null, availability: null, dns: [], speedtest: null },
  vpn: null,
  devices: [],
  clients: [],
  clientsTotal: 0,
  clientsWired: 0,
  clientsWireless: 0,
  byNetwork: [],
  fetchedAt: '',
};

let cfgCache: { v: UnifiConfig; t: number } | null = null;

export async function getUnifiConfig(): Promise<UnifiConfig> {
  if (cfgCache && Date.now() - cfgCache.t < 5000) return cfgCache.v;
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).select('unifiHost unifiUser unifiPass unifiEnabled').lean();
  const v: UnifiConfig = {
    host: (doc?.unifiHost || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
    user: doc?.unifiUser || '',
    pass: doc?.unifiPass || '',
    enabled: !!doc?.unifiEnabled,
  };
  cfgCache = { v, t: Date.now() };
  return v;
}

export function invalidateUnifiConfig(): void {
  cfgCache = null;
  session = null;
  snapCache = null;
  loginBackoff = null; // user saved new credentials → try fresh immediately
}

/** Minimal https JSON request that tolerates the gateway's self-signed cert. */
function rawRequest(
  host: string,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        port: 443,
        path,
        method: opts.method || 'GET',
        headers: { accept: 'application/json', ...(opts.headers || {}) },
        rejectUnauthorized: false, // LAN gateway with self-signed cert
        timeout: 8000,
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('UniFi request timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// Session cookie cache — UniFi OS issues a TOKEN cookie + an X-CSRF-Token on login
// (the latter is required to send POST commands, e.g. trigger a speedtest).
let session: { host: string; cookie: string; csrf: string; t: number } | null = null;
const SESSION_TTL = 20 * 60 * 1000;

// Failed-login backoff: UniFi locks accounts after a few bad attempts, and every
// /network load triggers a login — so after a failure we STOP trying for a while
// instead of hammering the gateway and extending its lockout window.
let loginBackoff: { until: number; error: string } | null = null;

async function login(cfg: UnifiConfig): Promise<{ cookie: string; csrf: string }> {
  if (session && session.host === cfg.host && Date.now() - session.t < SESSION_TTL) return { cookie: session.cookie, csrf: session.csrf };
  if (loginBackoff && Date.now() < loginBackoff.until) throw new Error(loginBackoff.error);
  const body = JSON.stringify({ username: cfg.user, password: cfg.pass });
  const res = await rawRequest(cfg.host, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
    body,
  });
  if (res.status !== 200) {
    let msg = `login HTTP ${res.status}`;
    try {
      const j = JSON.parse(res.text) as { message?: string; code?: string };
      if (j.message) msg = j.message;
    } catch {
      /* non-JSON error body */
    }
    const locked = /locked|attempt limit/i.test(msg);
    loginBackoff = {
      until: Date.now() + (locked ? 5 * 60_000 : 45_000),
      error: locked ? `${msg} — pausing login attempts for 5 min so the lock can clear` : msg,
    };
    throw new Error(loginBackoff.error);
  }
  loginBackoff = null;
  const setCookie = res.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie || '']).map((c) => String(c).split(';')[0]).filter(Boolean);
  if (!cookies.length) throw new Error('login OK but no session cookie returned');
  const cookie = cookies.join('; ');
  const csrf = String(res.headers['x-csrf-token'] || '');
  session = { host: cfg.host, cookie, csrf, t: Date.now() };
  return { cookie, csrf };
}

async function unifiGet<T>(cfg: UnifiConfig, path: string): Promise<T> {
  let { cookie } = await login(cfg);
  let res = await rawRequest(cfg.host, path, { headers: { cookie } });
  if (res.status === 401) {
    // expired session → one re-login retry
    session = null;
    cookie = (await login(cfg)).cookie;
    res = await rawRequest(cfg.host, path, { headers: { cookie } });
  }
  if (res.status !== 200) throw new Error(`${path} HTTP ${res.status}`);
  return JSON.parse(res.text) as T;
}

async function unifiPost(cfg: UnifiConfig, path: string, payload: Record<string, unknown>): Promise<void> {
  const { cookie, csrf } = await login(cfg);
  const body = JSON.stringify(payload);
  const res = await rawRequest(cfg.host, path, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body,
  });
  if (res.status !== 200) throw new Error(`${path} HTTP ${res.status}`);
}

/** Trigger a WAN speedtest on the gateway. Result lands in the next snapshot. */
export async function runUnifiSpeedtest(): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getUnifiConfig();
  if (!cfg.enabled || !cfg.host || !cfg.user) return { ok: false, error: 'not-configured' };
  try {
    await unifiPost(cfg, '/proxy/network/api/s/default/cmd/devmgr', { cmd: 'speedtest' });
    snapCache = null; // force a fresh snapshot so the result shows once it finishes
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 160) };
  }
}

type Monitor = { availability?: number; latency_average?: number; target?: string };
type HealthRow = {
  subsystem?: string;
  status?: string;
  wan_ip?: string;
  latency?: number;
  isp_name?: string;
  asn?: string;
  uptime?: number;
  drops?: number;
  speedtest_lastrun?: number;
  speedtest_ping?: number;
  xput_down?: number;
  xput_up?: number;
  nameservers?: string[];
  uptime_stats?: { WAN?: { alerting_monitors?: Monitor[] } };
  // vpn subsystem
  remote_user_enabled?: boolean;
  site_to_site_enabled?: boolean;
  site_to_site_num_active?: number;
};
type DeviceRow = {
  name?: string;
  model?: string;
  type?: string;
  state?: number;
  version?: string;
  uptime?: number;
  num_sta?: number;
  satisfaction?: number;
  upgradable?: boolean;
  overheating?: boolean;
  total_max_power?: number;
  'system-stats'?: { cpu?: string; mem?: string };
  sys_stats?: { loadavg_1?: string };
  temperatures?: { name?: string; type?: string; value?: number }[];
  uplink?: { uplink_device_name?: string };
  'speedtest-status'?: { xput_download?: number; xput_upload?: number; latency?: number; rundate?: number; server?: { city?: string; country?: string } };
};
type ClientRow = {
  name?: string;
  hostname?: string;
  ip?: string;
  oui?: string;
  network?: string;
  essid?: string;
  is_wired?: boolean;
  signal?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  uptime?: number;
};

// Short snapshot cache so page loads + alert checks don't hammer the gateway.
let snapCache: { v: UnifiSnapshot; t: number } | null = null;

/** One consolidated, cached (30s) view of the network: WAN, devices, clients. */
export async function getUnifiSnapshot(): Promise<UnifiSnapshot> {
  if (snapCache && Date.now() - snapCache.t < 30000) return snapCache.v;
  const cfg = await getUnifiConfig();
  if (!cfg.enabled || !cfg.host || !cfg.user) {
    return { ok: false, error: 'not-configured', ...EMPTY };
  }
  try {
    const [health, devices, clients] = await Promise.all([
      unifiGet<{ data?: HealthRow[] }>(cfg, '/proxy/network/api/s/default/stat/health'),
      unifiGet<{ data?: DeviceRow[] }>(cfg, '/proxy/network/api/s/default/stat/device'),
      unifiGet<{ data?: ClientRow[] }>(cfg, '/proxy/network/api/s/default/stat/sta'),
    ]);

    const rows = health.data || [];
    const wanRow = rows.find((h) => h.subsystem === 'wan');
    const wwwRow = rows.find((h) => h.subsystem === 'www');
    const vpnRow = rows.find((h) => h.subsystem === 'vpn');
    const monitor = wanRow?.uptime_stats?.WAN?.alerting_monitors?.[0];
    const st = (devices.data || []).map((d) => d['speedtest-status']).find(Boolean);

    const devs: UnifiDevice[] = (devices.data || []).map((d) => ({
      name: d.name || d.model || 'device',
      model: d.model || '',
      type: d.type || '',
      online: d.state === 1,
      version: d.version || '',
      uptimeSec: d.uptime || 0,
      clients: d.num_sta || 0,
      cpu: d['system-stats']?.cpu != null ? Number(d['system-stats'].cpu) : null,
      mem: d['system-stats']?.mem != null ? Number(d['system-stats'].mem) : null,
      tempC: (() => {
        const t = d.temperatures?.find((x) => x.type === 'cpu') ?? d.temperatures?.[0];
        return t?.value != null ? Math.round(t.value * 10) / 10 : null;
      })(),
      satisfaction: d.satisfaction != null && d.satisfaction >= 0 ? d.satisfaction : null,
      loadAvg: d.sys_stats?.loadavg_1 != null ? Number(d.sys_stats.loadavg_1) : null,
      upgradable: !!d.upgradable,
      overheating: !!d.overheating,
      poeMaxW: d.total_max_power ?? null,
      uplinkTo: d.uplink?.uplink_device_name || '',
    }));
    const cls = clients.data || [];
    const byNet = new Map<string, number>();
    for (const c of cls) {
      const k = c.network || c.essid || '—';
      byNet.set(k, (byNet.get(k) ?? 0) + 1);
    }
    const clientList: UnifiClient[] = cls
      .map((c) => ({
        name: c.name || c.hostname || c.oui || c.ip || 'unknown',
        ip: c.ip || '',
        vendor: c.oui || '',
        network: c.network || c.essid || '—',
        wired: !!c.is_wired,
        signal: c.is_wired ? null : (c.signal ?? null),
        rxBytes: c.rx_bytes || 0,
        txBytes: c.tx_bytes || 0,
        uptimeSec: c.uptime || 0,
      }))
      .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes)); // top talkers first

    const v: UnifiSnapshot = {
      ok: true,
      wan: {
        status: wanRow?.status || 'unknown',
        ip: wanRow?.wan_ip || '',
        latency: wwwRow?.latency ?? wanRow?.latency ?? null,
        isp: wanRow?.isp_name || '',
        asn: wanRow?.asn ? `AS${wanRow.asn}` : '',
        uptimeSec: wwwRow?.uptime || 0,
        drops: wwwRow?.drops ?? null,
        availability: monitor?.availability ?? null,
        dns: wanRow?.nameservers?.filter(Boolean) || [],
        speedtest: st
          ? {
              down: Math.round((st.xput_download || wwwRow?.xput_down || 0) * 10) / 10,
              up: Math.round((st.xput_upload || wwwRow?.xput_up || 0) * 10) / 10,
              ping: st.latency ?? wwwRow?.speedtest_ping ?? 0,
              server: [st.server?.city, st.server?.country].filter(Boolean).join(', '),
              runAt: (st.rundate || wwwRow?.speedtest_lastrun || 0) * 1000,
            }
          : null,
      },
      vpn: vpnRow
        ? {
            remoteUser: !!vpnRow.remote_user_enabled,
            siteToSite: !!vpnRow.site_to_site_enabled,
            siteToSiteActive: vpnRow.site_to_site_num_active || 0,
          }
        : null,
      devices: devs.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      clients: clientList,
      clientsTotal: cls.length,
      clientsWired: cls.filter((c) => c.is_wired).length,
      clientsWireless: cls.filter((c) => !c.is_wired).length,
      byNetwork: [...byNet.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      fetchedAt: new Date().toISOString(),
    };
    snapCache = { v, t: Date.now() };
    return v;
  } catch (err) {
    const v: UnifiSnapshot = { ok: false, error: (err as Error).message.slice(0, 160), ...EMPTY };
    // cache failures briefly too, so a down gateway doesn't add 8s to every load
    snapCache = { v, t: Date.now() };
    return v;
  }
}
