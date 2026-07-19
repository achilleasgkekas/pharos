import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { currentTenant } from './tenancy/current';

export type ImapConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  folder: string;
  lastUid: number;
  lastCheckedAt: string; // ISO, '' if never checked
  lastImportedAt: string; // ISO, '' if nothing imported yet
  hasPass: boolean;
};

/** Shape of the persisted AppConfig singleton fields consumed here (all optional). */
export type RawImapConfigDoc = {
  imapEnabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  imapSecure?: boolean;
  imapFolder?: string;
  imapLastUid?: number;
  imapLastCheckedAt?: Date | string | null;
  imapLastImportedAt?: Date | string | null;
} | null | undefined;

/** Pure, DB-free coercion of a persisted AppConfig doc into an ImapConfig. */
export function normalizeImapConfig(doc: RawImapConfigDoc): ImapConfig {
  return {
    enabled: !!doc?.imapEnabled,
    host: doc?.imapHost || '',
    port: doc?.imapPort || 993,
    user: doc?.imapUser || '',
    pass: doc?.imapPass || '',
    secure: doc?.imapSecure !== false, // default true
    folder: doc?.imapFolder || 'INBOX',
    lastUid: doc?.imapLastUid || 0,
    lastCheckedAt: doc?.imapLastCheckedAt ? new Date(doc.imapLastCheckedAt).toISOString() : '',
    lastImportedAt: doc?.imapLastImportedAt ? new Date(doc.imapLastImportedAt).toISOString() : '',
    hasPass: !!doc?.imapPass,
  };
}

// Keyed by tenant ('' = default/self-hosted), mirrors lib/storageConfig.ts.
const cache = new Map<string, { v: ImapConfig; t: number }>();
const TTL = 5000;

function tenantKey(): string {
  const ctx = currentTenant();
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

export async function getImapConfig(): Promise<ImapConfig> {
  const key = tenantKey();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  await connectDB();
  const Config = await currentModel(AppConfig);
  const doc = await Config.findOne({ key: 'singleton' }).lean();
  const v = normalizeImapConfig(doc as RawImapConfigDoc);
  cache.set(key, { v, t: Date.now() });
  return v;
}

/** Clear the IMAP-config cache. No arg → only the CURRENT tenant; `all` → every tenant. */
export function invalidateImapConfig(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey());
}
