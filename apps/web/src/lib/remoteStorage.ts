import 'server-only';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client as FtpClient } from 'basic-ftp';

export type RemoteBackend = 'ftp' | 'smb';

export type RemoteConfig = {
  backend: RemoteBackend;
  host: string;
  port?: number;
  user: string;
  pass: string;
  share?: string; // SMB share name
  basePath?: string; // prefix dir on the remote (e.g. "Pharos")
  secure?: boolean; // FTPS (explicit TLS)
};

export type RemoteResult = { ok: boolean; error?: string };
export type RemoteFile = { data: Buffer; remoteRelPath: string };
export type BatchResult = { pushed: number; failed: number; errors: string[] };

function joinRemote(base: string | undefined, rel: string): string {
  const b = (base || '').replace(/^[/\\]+|[/\\]+$/g, '');
  const r = rel.replace(/^[/\\]+/, '');
  return b ? `${b}/${r}` : r;
}

function splitDirFile(full: string, sep: '/' | '\\'): { dir: string; file: string } {
  const i = full.lastIndexOf(sep);
  return i >= 0 ? { dir: full.slice(0, i), file: full.slice(i + 1) } : { dir: '', file: full };
}

// ─── FTP / FTPS (basic-ftp) ───────────────────────────────────────────────────

async function ftpAccess(client: FtpClient, cfg: RemoteConfig): Promise<void> {
  await client.access({
    host: cfg.host,
    port: cfg.port && cfg.port > 0 ? cfg.port : 21,
    user: cfg.user,
    password: cfg.pass,
    secure: !!cfg.secure,
    secureOptions: { rejectUnauthorized: false }, // tolerate self-signed NAS certs
  });
}

/** Upload many files over ONE FTP session. cwd is reset to home before each file so
 *  ensureDir() (which changes directory) stays consistent across mixed target dirs. */
async function ftpBatch(cfg: RemoteConfig, files: RemoteFile[]): Promise<BatchResult> {
  const out: BatchResult = { pushed: 0, failed: 0, errors: [] };
  const client = new FtpClient(20_000);
  try {
    await ftpAccess(client, cfg);
    const home = await client.pwd();
    for (const f of files) {
      const full = joinRemote(cfg.basePath, f.remoteRelPath);
      const { dir, file } = splitDirFile(full, '/');
      try {
        await client.cd(home);
        if (dir) await client.ensureDir(dir);
        await client.uploadFrom(Readable.from(f.data), file);
        out.pushed++;
      } catch (err) {
        out.failed++;
        if (out.errors.length < 5) out.errors.push((err as Error).message);
      }
    }
  } finally {
    client.close();
  }
  return out;
}

// ─── SMB via the `smbclient` CLI (negotiates up to SMB3) ──────────────────────
// The pure-JS smb2 libraries top out at SMB 2.x and hang against SMB3-only shares
// (common on modern Synology/Windows). smbclient speaks SMB3, so we shell out to it.
// The password is passed through the PASSWD env var (never argv → not visible in `ps`).

const SMB_NT_STATUS: Record<string, string> = {
  NT_STATUS_LOGON_FAILURE: 'wrong username or password',
  NT_STATUS_ACCESS_DENIED: 'access denied — check the share permissions for this user',
  NT_STATUS_BAD_NETWORK_NAME: 'share not found — check the share name',
  NT_STATUS_CONNECTION_REFUSED: 'connection refused — check host/port and that SMB is enabled',
  NT_STATUS_HOST_UNREACHABLE: 'host unreachable — check the IP/hostname',
  NT_STATUS_NETWORK_UNREACHABLE: 'network unreachable — check the IP/hostname',
  NT_STATUS_IO_TIMEOUT: 'connection timed out — check host/port and firewall',
  NT_STATUS_INVALID_PARAMETER: 'protocol negotiation failed — enable SMB2/SMB3 on the NAS',
  NT_STATUS_NOT_SUPPORTED: 'protocol not supported — enable SMB2/SMB3 on the NAS',
  NT_STATUS_OBJECT_NAME_NOT_FOUND: 'path not found on the share',
};

function smbError(out: string): string {
  const m = /NT_STATUS_[A-Z_]+/.exec(out);
  if (m) return SMB_NT_STATUS[m[0]] || m[0];
  const line = out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return line || 'unknown SMB error';
}

/** Run smbclient feeding commands on stdin; resolve with exit code + combined output. */
function runSmbclient(cfg: RemoteConfig, commands: string[], timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const share = (cfg.share || '').replace(/^[\\/]+|[\\/]+$/g, '');
    const service = `//${cfg.host}/${share}`;
    const args = [service, '-U', cfg.user || 'guest', '-p', String(cfg.port && cfg.port > 0 ? cfg.port : 445), '--max-protocol=SMB3'];
    if (!cfg.pass) args.push('-N'); // guest / no-password

    const child = spawn('smbclient', args, { env: { ...process.env, PASSWD: cfg.pass || '' } });
    let out = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        child.kill('SIGKILL');
        reject(new Error(`SMB timed out after ${Math.round(timeoutMs / 1000)}s — check host/port/share, that SMB2/SMB3 is enabled on the NAS, and the firewall.`));
      });
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', (err) =>
      finish(() => reject(new Error(`smbclient could not start: ${err.message}`)))
    );
    child.on('close', (code) => finish(() => resolve({ code: code ?? 1, out })));

    child.stdin.write('prompt OFF\n'); // never block on interactive confirmations
    for (const c of commands) child.stdin.write(`${c}\n`);
    child.stdin.end();
  });
}

async function smbBatch(cfg: RemoteConfig, files: RemoteFile[]): Promise<BatchResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pharos-smb-'));
  const cmds: string[] = [];
  const made = new Set<string>();
  try {
    for (let i = 0; i < files.length; i++) {
      const local = path.join(tmpDir, `f${i}`);
      await fs.writeFile(local, files[i].data);
      const full = joinRemote(cfg.basePath, files[i].remoteRelPath).replace(/\//g, '\\');
      const { dir } = splitDirFile(full, '\\');
      if (dir) {
        const segs = dir.split('\\').filter(Boolean);
        let cur = '';
        for (const s of segs) {
          cur = cur ? `${cur}\\${s}` : s;
          if (!made.has(cur)) {
            made.add(cur);
            cmds.push(`mkdir "${cur}"`); // collision on existing dir is ignored below
          }
        }
      }
      cmds.push(`put "${local}" "${full}"`);
    }

    const { code, out } = await runSmbclient(cfg, cmds, Math.max(60_000, files.length * 3_000));
    const pushed = (out.match(/putting file/gi) || []).length;
    const failed = Math.max(0, files.length - pushed);
    const errors = [...new Set((out.match(/NT_STATUS_[A-Z_]+/g) || []).filter((e) => !/COLLISION/.test(e)))]
      .slice(0, 5)
      .map((e) => SMB_NT_STATUS[e] || e);
    if (pushed === 0 && failed > 0 && errors.length === 0 && code !== 0) errors.push(smbError(out));
    return { pushed, failed, errors };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function smbTest(cfg: RemoteConfig): Promise<RemoteResult> {
  if (!cfg.share) return { ok: false, error: 'No SMB share set' };
  const base = (cfg.basePath || '').replace(/^[\\/]+|[\\/]+$/g, '').replace(/\//g, '\\');
  const cmd = base ? `ls "${base}\\*"` : 'ls';
  const { code, out } = await runSmbclient(cfg, [cmd], 15_000);
  if (code === 0 && !/NT_STATUS/.test(out)) return { ok: true };
  return { ok: false, error: smbError(out) };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Upload many files over a single connection (efficient for sync). */
export async function pushBatchToRemote(cfg: RemoteConfig, files: RemoteFile[]): Promise<BatchResult> {
  if (files.length === 0) return { pushed: 0, failed: 0, errors: [] };
  try {
    return cfg.backend === 'ftp' ? await ftpBatch(cfg, files) : await smbBatch(cfg, files);
  } catch (err) {
    return { pushed: 0, failed: files.length, errors: [(err as Error).message] };
  }
}

/** Upload a single file (used for the optional on-verify mirror). */
export async function pushToRemote(cfg: RemoteConfig, data: Buffer, remoteRelPath: string): Promise<RemoteResult> {
  const r = await pushBatchToRemote(cfg, [{ data, remoteRelPath }]);
  return r.pushed > 0 ? { ok: true } : { ok: false, error: r.errors[0] || 'upload failed' };
}

/** Verify the remote is reachable + credentials work (no file written). */
export async function testRemote(cfg: RemoteConfig): Promise<RemoteResult> {
  try {
    if (!cfg.host) return { ok: false, error: 'No host set' };
    if (cfg.backend === 'ftp') {
      const client = new FtpClient(15_000);
      try {
        await ftpAccess(client, cfg);
        await client.list(joinRemote(cfg.basePath, '') || '/');
      } finally {
        client.close();
      }
      return { ok: true };
    }
    return await smbTest(cfg);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
