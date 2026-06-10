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
};

export type UnifiSnapshot = {
  ok: boolean;
  error?: string;
  wan: { status: string; ip: string; latency: number | null };
  devices: UnifiDevice[];
  clientsTotal: number;
  clientsWired: number;
  clientsWireless: number;
  byNetwork: { name: string; n: number }[];
  fetchedAt: string;
};

const EMPTY: Omit<UnifiSnapshot, 'ok' | 'error'> = {
  wan: { status: 'unknown', ip: '', latency: null },
  devices: [],
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

// Session cookie cache — UniFi OS issues a TOKEN cookie on login (~valid for hours).
let session: { host: string; cookie: string; t: number } | null = null;
const SESSION_TTL = 20 * 60 * 1000;

async function login(cfg: UnifiConfig): Promise<string> {
  if (session && session.host === cfg.host && Date.now() - session.t < SESSION_TTL) return session.cookie;
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
    throw new Error(msg);
  }
  const setCookie = res.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie || '']).map((c) => String(c).split(';')[0]).filter(Boolean);
  if (!cookies.length) throw new Error('login OK but no session cookie returned');
  const cookie = cookies.join('; ');
  session = { host: cfg.host, cookie, t: Date.now() };
  return cookie;
}

async function unifiGet<T>(cfg: UnifiConfig, path: string): Promise<T> {
  let cookie = await login(cfg);
  let res = await rawRequest(cfg.host, path, { headers: { cookie } });
  if (res.status === 401) {
    // expired session → one re-login retry
    session = null;
    cookie = await login(cfg);
    res = await rawRequest(cfg.host, path, { headers: { cookie } });
  }
  if (res.status !== 200) throw new Error(`${path} HTTP ${res.status}`);
  return JSON.parse(res.text) as T;
}

type HealthRow = { subsystem?: string; status?: string; wan_ip?: string; latency?: number };
type DeviceRow = {
  name?: string;
  model?: string;
  type?: string;
  state?: number;
  version?: string;
  uptime?: number;
  num_sta?: number;
  'system-stats'?: { cpu?: string; mem?: string };
};
type ClientRow = { network?: string; essid?: string; is_wired?: boolean };

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

    const wanRow = (health.data || []).find((h) => h.subsystem === 'wan');
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
    }));
    const cls = clients.data || [];
    const byNet = new Map<string, number>();
    for (const c of cls) {
      const k = c.network || c.essid || '—';
      byNet.set(k, (byNet.get(k) ?? 0) + 1);
    }
    const v: UnifiSnapshot = {
      ok: true,
      wan: {
        status: wanRow?.status || 'unknown',
        ip: wanRow?.wan_ip || '',
        latency: wanRow?.latency ?? null,
      },
      devices: devs.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
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
