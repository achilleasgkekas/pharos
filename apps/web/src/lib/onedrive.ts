import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';

// ─── OneDrive (Microsoft Graph) ──────────────────────────────────────────────
// Auth uses the OAuth 2.0 DEVICE CODE flow: ideal for a self-hosted app reached
// over WireGuard with no public redirect URI. The user registers a free Azure
// "public client" app (the Settings wizard walks them through it), then signs in
// once at microsoft.com/devicelogin. We keep only the refresh token and mint
// short-lived access tokens on demand. Uploads go to /Apps/Pharos in their drive.

const TENANT = 'common'; // personal + work/school accounts
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'Files.ReadWrite offline_access openid profile';

export type DeviceCode = {
  ok: boolean;
  error?: string;
  userCode?: string;
  verificationUri?: string;
  deviceCode?: string;
  interval?: number;
  expiresIn?: number;
};

/** Step 1: ask Microsoft for a device code the user types at the verification URL. */
export async function startDeviceCode(clientId: string): Promise<DeviceCode> {
  if (!clientId) return { ok: false, error: 'Enter the Application (client) ID first' };
  try {
    const res = await fetch(`${AUTH_BASE}/devicecode`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: SCOPE }),
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
  clientId: string,
  deviceCode: string
): Promise<{ status: 'ok' | 'pending' | 'error'; error?: string; account?: string }> {
  try {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCode,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (res.ok && j.refresh_token) {
      const account = await accountName(String(j.access_token));
      await connectDB();
      await AppConfig.updateOne(
        { key: 'singleton' },
        { $set: { onedriveClientId: clientId, onedriveRefreshToken: String(j.refresh_token), onedriveAccount: account } },
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
    const res = await fetch(`${GRAPH}/me/drive/root:/Apps/Pharos/${clean}:/content`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Graph HTTP ${res.status}: ${body.slice(0, 160)}` };
    }
    return { ok: true };
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
