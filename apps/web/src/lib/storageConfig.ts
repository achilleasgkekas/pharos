import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
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
} | null | undefined;

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
  };
}

let cache: { v: StorageConfig; t: number } | null = null;
const TTL = 5000;

export async function getStorageConfig(): Promise<StorageConfig> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).lean();
  const v = normalizeStorageConfig(doc as RawStorageConfigDoc);
  cache = { v, t: Date.now() };
  return v;
}

export function invalidateStorageConfig(): void {
  cache = null;
}
