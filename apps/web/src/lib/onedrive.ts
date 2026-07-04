import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';

// ─── OneDrive (Microsoft Graph) ──────────────────────────────────────────────
// Auth uses the OAuth 2.0 DEVICE CODE flow: ideal for a self-hosted app reached
// over WireGuard with no public redirect URI. The user registers a free Azure
// "public client" app (the Settings wizard walks them through it), then signs in
// once at microsoft.com/devicelogin. We keep only the refresh token and mint
// short-lived access tokens on demand. Uploads go to /Apps/Pharos in their drive.

// 'consumers' = personal Microsoft accounts (personal OneDrive). The 'common'
// endpoint routed personal accounts through an org-style flow whose http://localhost
// redirect misfired ("must include a response_type"). 'consumers' uses the
// microsoft.com/link device flow that completes cleanly for MSA accounts.
// (Work/school OneDrive would need 'organizations' — not the home-user case here.)
const TENANT = 'consumers';
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'Files.ReadWrite offline_access openid profile';

// Built-in public client so the user registers NOTHING — they just sign in. This
// is Microsoft's own "Microsoft Graph Command Line Tools" first-party public
// client (no secret, device-code capable, personal + work accounts). Same pattern
// rclone uses. A power user can still supply their own client id (then the consent
// screen says "Pharos" instead) — handled transparently below.
export const DEFAULT_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
const resolveClient = (id?: string) => (id && id.trim()) || DEFAULT_CLIENT_ID;

export type DeviceCode = {
  ok: boolean;
  error?: string;
  userCode?: string;
  verificationUri?: string;
  deviceCode?: string;
  interval?: number;
  expiresIn?: number;
};

/** Step 1: ask Microsoft for a device code the user types at the verification URL.
 *  clientId is optional — empty → the built-in public client (zero setup). */
export async function startDeviceCode(clientId?: string): Promise<DeviceCode> {
  try {
    const res = await fetch(`${AUTH_BASE}/devicecode`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: resolveClient(clientId), scope: SCOPE }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: String(j.error_description || j.error || `HTTP ${res.status}`) };
    return {
      ok: true,
      userCode: String(j.user_code),
      verificationUri: String(j.verification_uri),
      deviceCode: String(j.device_code),
      interval: Number(j.interval) || 5,
      expiresIn: Number(j.expires_in) || 900,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Step 2: poll once — returns 'pending' until the user finishes signing in. */
export async function pollDeviceToken(
  clientId: string | undefined,
  deviceCode: string
): Promise<{ status: 'ok' | 'pending' | 'error'; error?: string; account?: string }> {
  const cid = resolveClient(clientId);
  try {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: cid,
        device_code: deviceCode,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (res.ok && j.refresh_token) {
      // Prefer the id_token claims (no extra Graph permission needed); fall back to /me.
      const account = accountFromIdToken(String(j.id_token || '')) || (await accountName(String(j.access_token)));
      await connectDB();
      // Persist the EFFECTIVE client id (default or custom) so refreshes use it.
      await AppConfig.updateOne(
        { key: 'singleton' },
        { $set: { onedriveClientId: cid, onedriveRefreshToken: String(j.refresh_token), onedriveAccount: account } },
        { upsert: true }
      );
      return { status: 'ok', account };
    }
    // authorization_pending → keep polling; anything else is terminal
    if (j.error === 'authorization_pending' || j.error === 'slow_down') return { status: 'pending' };
    return { status: 'error', error: String(j.error_description || j.error || `HTTP ${res.status}`) };
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
}

/** Pull the email/name out of the id_token JWT (middle segment is base64url JSON).
 *  Claim precedence: preferred_username → email → name → '' (never throws; a
 *  malformed/missing token yields '' so onedriveAccount just stays blank). Exported
 *  for unit testing — the runtime call site is pollDeviceToken. */
export function accountFromIdToken(idToken: string): string {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return '';
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      preferred_username?: string; email?: string; name?: string;
    };
    return json.preferred_username || json.email || json.name || '';
  } catch {
    return '';
  }
}

async function accountName(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`${GRAPH}/me`, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return '';
    const j = (await res.json()) as { userPrincipalName?: string; mail?: string; displayName?: string };
    return j.userPrincipalName || j.mail || j.displayName || '';
  } catch {
    return '';
  }
}

// Cache the short-lived access token in memory (valid ~1h).
let tokenCache: { token: string; exp: number } | null = null;

async function accessTokenFor(clientId: string, refreshToken: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, scope: SCOPE }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !j.access_token) throw new Error(String(j.error_description || j.error || `token HTTP ${res.status}`));
  // Microsoft rotates refresh tokens — persist the new one so we don't expire.
  if (j.refresh_token && j.refresh_token !== refreshToken) {
    await connectDB();
    await AppConfig.updateOne({ key: 'singleton' }, { $set: { onedriveRefreshToken: String(j.refresh_token) } });
  }
  const token = String(j.access_token);
  tokenCache = { token, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  return token;
}

export type OnedriveCreds = { clientId: string; refreshToken: string; account: string };

export async function getOnedriveCreds(): Promise<OnedriveCreds | null> {
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).select('onedriveClientId onedriveRefreshToken onedriveAccount').lean();
  if (!doc?.onedriveClientId || !doc?.onedriveRefreshToken) return null;
  return { clientId: doc.onedriveClientId, refreshToken: doc.onedriveRefreshToken, account: doc.onedriveAccount || '' };
}

export async function disconnectOnedrive(): Promise<void> {
  await connectDB();
  await AppConfig.updateOne({ key: 'singleton' }, { $unset: { onedriveRefreshToken: '', onedriveAccount: '' } });
  tokenCache = null;
}

/**
 * Upload one file to OneDrive under /Apps/Pharos/<relPath>. Small-file path
 * (simple PUT, fine for receipts/statements up to ~60MB via Graph). Never throws
 * fatally to callers that fire-and-forget; returns ok/error.
 */
export async function uploadToOnedrive(relPath: string, data: Buffer): Promise<{ ok: boolean; error?: string }> {
  try {
    const creds = await getOnedriveCreds();
    if (!creds) return { ok: false, error: 'OneDrive not connected' };
    const token = await accessTokenFor(creds.clientId, creds.refreshToken);
    const clean = relPath.split('/').map((s) => encodeURIComponent(s)).join('/');
    const url = `${GRAPH}/me/drive/root:/Apps/Pharos/${clean}:/content`;

    // Graph throttles bursts (429) and occasionally 503s. Honour Retry-After and
    // retry a few times — this is the usual reason a bulk sync drops some files.
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        body: new Uint8Array(data),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) return { ok: true };
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        const wait = Math.min(30, Number(res.headers.get('retry-after')) || (attempt + 1) * 3);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Graph HTTP ${res.status}: ${body.slice(0, 160)}` };
    }
    return { ok: false, error: 'throttled — retries exhausted' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Download one file from OneDrive at /Apps/Pharos/<relPath>. Counterpart to
 * uploadToOnedrive — used for on-demand re-cache when the local copy is missing
 * (e.g. fresh host, restored DB). Returns the bytes or an error; never throws.
 */
export async function downloadFromOnedrive(relPath: string): Promise<{ ok: boolean; data?: Buffer; error?: string }> {
  try {
    const creds = await getOnedriveCreds();
    if (!creds) return { ok: false, error: 'OneDrive not connected' };
    const token = await accessTokenFor(creds.clientId, creds.refreshToken);
    const clean = relPath.split('/').map((s) => encodeURIComponent(s)).join('/');
    const url = `${GRAPH}/me/drive/root:/Apps/Pharos/${clean}:/content`;

    // Graph 302-redirects to a pre-authed download URL (fetch follows it); honour
    // Retry-After on the same 429/503 bursts the upload path handles.
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) return { ok: true, data: Buffer.from(await res.arrayBuffer()) };
      if (res.status === 404) return { ok: false, error: 'not found on OneDrive' };
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        const wait = Math.min(30, Number(res.headers.get('retry-after')) || (attempt + 1) * 3);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Graph HTTP ${res.status}: ${body.slice(0, 160)}` };
    }
    return { ok: false, error: 'throttled — retries exhausted' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Create (or reuse) an anonymous, view-only share link for a file under
 * /Apps/Pharos/<relPath>. Powers an optional "Open in OneDrive" action. Graph
 * returns the existing link if one of the same type already exists.
 */
export async function createShareLink(relPath: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const creds = await getOnedriveCreds();
    if (!creds) return { ok: false, error: 'OneDrive not connected' };
    const token = await accessTokenFor(creds.clientId, creds.refreshToken);
    const clean = relPath.split('/').map((s) => encodeURIComponent(s)).join('/');
    const url = `${GRAPH}/me/drive/root:/Apps/Pharos/${clean}:/createLink`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => ({}))) as { link?: { webUrl?: string }; error?: { message?: string } };
    if (!res.ok || !j.link?.webUrl) return { ok: false, error: j.error?.message || `Graph HTTP ${res.status}` };
    return { ok: true, url: j.link.webUrl };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Connectivity check: refresh a token + read the drive name. */
export async function testOnedrive(): Promise<{ ok: boolean; error?: string; drive?: string }> {
  try {
    const creds = await getOnedriveCreds();
    if (!creds) return { ok: false, error: 'Connect OneDrive first' };
    const token = await accessTokenFor(creds.clientId, creds.refreshToken);
    const res = await fetch(`${GRAPH}/me/drive`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, error: `Graph HTTP ${res.status}` };
    const j = (await res.json()) as { name?: string; owner?: { user?: { displayName?: string } } };
    return { ok: true, drive: j.name || j.owner?.user?.displayName || 'OneDrive' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
