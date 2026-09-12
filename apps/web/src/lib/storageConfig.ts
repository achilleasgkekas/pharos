import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { currentTenant } from './tenancy/current';
import type { RemoteConfig } from './remoteStorage';
import { DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE } from './storagePath';

export type StorageBackend = 'local' | 'ftp' | 'smb' | 'onedrive';

export type StorageConfig = {
  backend: StorageBackend;
  mirror: boolean; // auto-push on receipt/statement verify
  folderTemplate: string;
  fileNameTemplate: string;
  remote: RemoteConfig; // valid when backend is ftp/smb
  hasPass: boolean;
  // P99: optional SECOND remote mirror (FTP/SMB), for 3-2-1. null when not configured — the
  // common case. Pushed alongside the primary, best-effort and independent of it.
  mirror2: RemoteConfig | null;
  hasPass2: boolean;
};

/** Shape of the persisted secondary-mirror sub-doc (P99). */
export type RawMirror2 = {
  backend?: string; // '' | 'ftp' | 'smb'
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  share?: string;
  basePath?: string;
  secure?: boolean;
};

/** Shape of the persisted AppConfig singleton fields consumed here (all optional). */
export type RawStorageConfigDoc = {
  storageBackend?: string;
  storageMirror?: boolean;
  folderTemplate?: string;
  fileNameTemplate?: string;
  remoteHost?: string;
  remotePort?: number;
  remoteUser?: string;
  remotePass?: string;
  remoteShare?: string;
  remoteBasePath?: string;
  remoteSecure?: boolean;
  storageMirror2?: RawMirror2;
} | null | undefined;

/** Parse the secondary-mirror sub-doc into a RemoteConfig, or null when it isn't a usable
 *  FTP/SMB destination (no backend, or no host). Pure — shared by config + tests. */
export function normalizeMirror2(m: RawMirror2 | undefined | null): RemoteConfig | null {
  const backend = m?.backend === 'smb' || m?.backend === 'ftp' ? m.backend : null;
  if (!backend || !m?.host) return null;
  return {
    backend,
    host: m.host,
    port: m.port || 0,
    user: m.user || '',
    pass: m.pass || '',
    share: m.share || '',
    basePath: m.basePath || '',
    secure: !!m.secure,
  };
}

/**
 * Pure, DB-free coercion of a persisted AppConfig doc into a StorageConfig.
 * Extracted from getStorageConfig so it is unit-testable without a DB mock.
 */
export function normalizeStorageConfig(doc: RawStorageConfigDoc): StorageConfig {
  const backend: StorageBackend =
    doc?.storageBackend === 'ftp' || doc?.storageBackend === 'smb' || doc?.storageBackend === 'onedrive'
      ? doc.storageBackend
      : 'local';
  return {
    backend,
    mirror: !!doc?.storageMirror,
    folderTemplate: doc?.folderTemplate || DEFAULT_FOLDER_TEMPLATE,
    fileNameTemplate: doc?.fileNameTemplate || DEFAULT_NAME_TEMPLATE,
    remote: {
      backend: backend === 'smb' ? 'smb' : 'ftp',
      host: doc?.remoteHost || '',
      port: doc?.remotePort || 0,
      user: doc?.remoteUser || '',
      pass: doc?.remotePass || '',
      share: doc?.remoteShare || '',
      basePath: doc?.remoteBasePath || '',
      secure: !!doc?.remoteSecure,
    },
    hasPass: !!doc?.remotePass,
    mirror2: normalizeMirror2(doc?.storageMirror2),
    hasPass2: !!doc?.storageMirror2?.pass,
  };
}

// Keyed by tenant. Default/self-hosted tenant uses the '' key → identical behaviour and
// TTL to the old single-slot cache; SaaS tenants each get their own slot so one tenant's
// storage backend + remote credentials never leak into another's.
const cache = new Map<string, { v: StorageConfig; t: number }>();
const TTL = 5000;

/** Stable cache key for the current tenant ('' = default/self-hosted). */
function tenantKey(): string {
  const ctx = currentTenant();
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const key = tenantKey();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  await connectDB();
  // Route to the current tenant's database (default tenant → AppConfig untouched).
  const Config = await currentModel(AppConfig);
  const doc = await Config.findOne({ key: 'singleton' }).lean();
  const v = normalizeStorageConfig(doc as RawStorageConfigDoc);
  cache.set(key, { v, t: Date.now() });
  return v;
}

/** Clear the storage-config cache. No arg → only the CURRENT tenant; `all` → every tenant. */
export function invalidateStorageConfig(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey());
}
