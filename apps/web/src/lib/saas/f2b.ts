// fail2ban bridge, APP SIDE. The container reads one file and writes request files. It never
// executes anything, never opens the fail2ban socket, never runs a shell.
//
// WHY the indirection (decided with Achilleas, ASK `pharos-cloud-guard-20260805-1525`): the
// fail2ban socket is not a "ban API" — it accepts action definitions, i.e. commands the fail2ban
// server runs as ROOT on the host. Mounting it into a web app that serves anonymous POSTs on
// /login and /signup would turn any RCE in this app into host root. So the app only ASKS: it drops
// a one-line request file, and `deploy/f2b-bridge.sh` (cron, every minute, on the host) validates
// it again from scratch and is the only thing that ever calls fail2ban-client. The validation here
// is a courtesy that gives the operator an instant error message; the AUTHORITATIVE validation is
// the shell script's, because this side is the untrusted one.
//
// The request wire format is one line of plain text, NOT json, matching the script's `read`:
//     unban <jail> <ip>
//
// Only meaningful in SAAS_MODE (the /admin segment that uses this is gated); the self-hosted app
// never mounts it and, with no bridge directory present, every read here reports "unknown" rather
// than a reassuring empty list.
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Jails the app is allowed to name. Mirrors ALLOWED_JAILS in deploy/f2b-bridge.sh — the script
 *  enforces its own copy, so a drift here can only make this side stricter, never looser. */
export const F2B_JAILS = ['sshd'] as const;
export type F2bJail = (typeof F2B_JAILS)[number];

/** How old the bridge's state file may be before the UI must stop presenting it as current.
 *  Cron writes it every minute; 5 minutes means "several runs have been missed". */
export const F2B_STALE_AFTER_MS = 5 * 60 * 1000;

/** Bridge directory inside the container (bind-mounted from ./f2b on the host). */
export function f2bDir(): string {
  return process.env.SAAS_F2B_DIR || '/var/lib/pharos/f2b';
}

export type BanRow = {
  jail: string;
  ip: string;
  /** Host-local timestamps as fail2ban prints them ('YYYY-MM-DD HH:MM:SS'), or null when the
   *  bridge could not parse them. Deliberately kept as strings: they are not ISO/UTC, and
   *  re-interpreting them as UTC would silently shift an incident window. */
  bannedAt: string | null;
  until: string | null;
};

export type BanState =
  | {
      known: true;
      generatedAt: Date;
      ageMs: number;
      /** True when the file is older than F2B_STALE_AFTER_MS: the list below is the last thing
       *  the bridge managed to write, not the state of the firewall now. */
      stale: boolean;
      bans: BanRow[];
    }
  | {
      known: false;
      /** missing = no bridge deployed here (or never ran); unreadable = permissions/IO;
       *  malformed = the file exists but is not the shape we expect. */
      reason: 'missing' | 'unreadable' | 'malformed';
      detail: string;
    };

// Strict address shapes. Same intent as the shell's regex: nothing that reaches a command line
// may contain anything but hex digits, dots and colons.
const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;
const IPV6_RE = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;

/** True for a plain IPv4 or IPv6 literal. No CIDR, no port, no zone id, no hostname: the bridge
 *  passes this string to `fail2ban-client set <jail> unbanip <ip>` as an argv element, and the
 *  only safe input there is one that cannot be read as anything but an address. */
export function isBanIp(ip: unknown): boolean {
  if (typeof ip !== 'string') return false;
  const v = ip.trim();
  if (!v || v.length > 45) return false;
  return IPV4_RE.test(v) || IPV6_RE.test(v);
}

/** True for a jail this app is allowed to name. */
export function isBanJail(jail: unknown): jail is F2bJail {
  return typeof jail === 'string' && (F2B_JAILS as readonly string[]).includes(jail);
}

/**
 * The exact line written to a request file, or null when the input is not something we are
 * willing to hand the host. PURE, and the single place the wire format is built — the route, the
 * tests and any future caller all go through it, so the format cannot drift per call site.
 *
 * A trailing newline is deliberate: the script counts lines with `wc -l` and rejects >1, and a
 * file with no terminator at all is still one line, so exactly one '\n' is the safe shape.
 */
export function unbanRequestLine(jail: unknown, ip: unknown): string | null {
  if (!isBanJail(jail)) return null;
  if (!isBanIp(ip)) return null;
  return `unban ${jail} ${String(ip).trim()}\n`;
}

/** Shape of one entry as the bridge writes it. Everything is optional on purpose: this is
 *  parsing FOREIGN input (a file written by a shell script), not our own serialization. */
function toBanRow(jail: string, raw: unknown): BanRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // An entry whose ip is not an address is dropped rather than displayed: the list is used to
  // decide who to unban, and an unusable row invites a click that can only fail.
  if (!isBanIp(r.ip)) return null;
  const str = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : null;
  };
  return { jail, ip: String(r.ip).trim(), bannedAt: str(r.bannedAt), until: str(r.until) };
}

/**
 * Parse the bridge's state.json. PURE (no fs, no clock — `now` is passed in) so staleness and
 * malformed-input handling are unit-testable.
 *
 * Contract that matters more than the parsing: this NEVER returns an empty ban list to mean
 * "I could not tell". Empty is only ever "the bridge ran and reported nothing banned". Anything
 * else is `known: false`, because an empty list reads as reassuring and a silent lie about the
 * firewall is exactly the failure this feature exists to prevent.
 */
export function parseBanState(raw: string, now: Date): BanState {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { known: false, reason: 'malformed', detail: 'state.json is not valid JSON' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { known: false, reason: 'malformed', detail: 'state.json is not an object' };
  }
  const d = doc as Record<string, unknown>;
  const ts = typeof d.generatedAt === 'string' ? Date.parse(d.generatedAt) : NaN;
  if (!Number.isFinite(ts)) {
    // No timestamp means no way to tell fresh from ancient, which makes the list unusable for
    // the only question it answers ("is this the firewall right now?").
    return { known: false, reason: 'malformed', detail: 'state.json has no usable generatedAt' };
  }
  const jails = d.jails;
  if (!jails || typeof jails !== 'object' || Array.isArray(jails)) {
    return { known: false, reason: 'malformed', detail: 'state.json has no jails object' };
  }

  const bans: BanRow[] = [];
  for (const [jail, list] of Object.entries(jails as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const row = toBanRow(jail, entry);
      if (row) bans.push(row);
    }
  }
  // Newest ban first when the bridge gave us times; unknown times sink to the bottom rather than
  // sorting as epoch-zero and pretending to be the oldest bans on the box.
  bans.sort((a, b) => (b.bannedAt ?? '').localeCompare(a.bannedAt ?? ''));

  const ageMs = Math.max(0, now.getTime() - ts);
  return { known: true, generatedAt: new Date(ts), ageMs, stale: ageMs > F2B_STALE_AFTER_MS, bans };
}

/** Read + parse the bridge's state file. Never throws. */
export async function readBanState(now: Date = new Date()): Promise<BanState> {
  const file = path.join(f2bDir(), 'state.json');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {
        known: false,
        reason: 'missing',
        detail: `no ${file} — the host bridge has not run, or this deployment has no fail2ban`,
      };
    }
    return { known: false, reason: 'unreadable', detail: `cannot read ${file} (${code || 'error'})` };
  }
  return parseBanState(raw, now);
}

export type UnbanRequest =
  | { ok: true; file: string }
  | { ok: false; reason: 'invalid-ip' | 'invalid-jail' | 'write-failed'; detail: string };

/** Filename for a request. Includes the ip so a queue backlog is readable at a glance, with
 *  every character outside [0-9a-f.:] already excluded by isBanIp, plus a random suffix so two
 *  clicks in the same millisecond cannot collide. Colons are swapped for '-' (IPv6 in a
 *  filename), which is cosmetic: the ip the script acts on comes from the file's CONTENT. */
function requestFileName(ip: string, now: Date, rand: string): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${ip.replace(/:/g, '-')}-${rand}.req`;
}

/**
 * Queue an unban. Writes the request file ATOMICALLY (temp file + rename in the same directory),
 * so the cron drain can never `read` a half-written request and reject a legitimate one as
 * malformed.
 *
 * Returns ok on QUEUED, which is not the same as unbanned: the host acts within a minute. Callers
 * must say "queued" in the UI, never "unbanned".
 */
export async function requestUnban(
  ip: unknown,
  jail: unknown = 'sshd',
  now: Date = new Date()
): Promise<UnbanRequest> {
  if (!isBanJail(jail)) return { ok: false, reason: 'invalid-jail', detail: 'unknown jail' };
  const line = unbanRequestLine(jail, ip);
  if (!line) return { ok: false, reason: 'invalid-ip', detail: 'not a valid IP address' };

  const dir = path.join(f2bDir(), 'requests');
  const rand = Math.random().toString(36).slice(2, 8);
  const name = requestFileName(String(ip).trim(), now, rand);
  const tmp = path.join(dir, `.${name}.tmp`);
  const dest = path.join(dir, name);
  try {
    await fs.writeFile(tmp, line, { encoding: 'utf8', mode: 0o644 });
    await fs.rename(tmp, dest);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // Best-effort cleanup; a leftover dotfile is ignored by the drain loop's glob anyway.
    await fs.unlink(tmp).catch(() => {});
    return {
      ok: false,
      reason: 'write-failed',
      detail:
        code === 'ENOENT'
          ? `no ${dir} — the f2b bridge directory is not mounted into this container`
          : `cannot write to ${dir} (${code || 'error'})`,
    };
  }
  return { ok: true, file: name };
}
