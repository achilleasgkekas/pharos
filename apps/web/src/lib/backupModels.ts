import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Subscription } from '@/models/Subscription';
import { Voucher } from '@/models/Voucher';
import { Card } from '@/models/Card';
import { Task } from '@/models/Task';
import { Store } from '@/models/Store';
import { Expense } from '@/models/Expense';
import { Bill } from '@/models/Bill';
import { Goal } from '@/models/Goal';
import { GiftCard } from '@/models/GiftCard';
import { LoyaltyCard } from '@/models/LoyaltyCard';
import { NetWorthSnapshot } from '@/models/NetWorthSnapshot';
import { ShoppingListItem } from '@/models/ShoppingListItem';

/**
 * The single source of truth for what the JSON backup (Settings → Storage & backup →
 * Export / Restore) carries. `exportData` writes one array per key, `importData`
 * upserts each array back by `_id`.
 *
 * WHY THIS LIVES IN ITS OWN MODULE: the map used to be a local const inside
 * settings/actions.ts, so every model added after it was written silently stayed out
 * of the backup. Seven of them had accumulated that way (the whole Expense/Income
 * module among them), which means a user who restored from a backup lost their entire
 * expense history without any warning. Keeping the registry here lets
 * `backupModels.test.ts` assert that EVERY model under src/models is either backed up
 * or listed in `BACKUP_EXCLUDED` below with a reason, so the same drift cannot happen
 * again quietly: adding a model without deciding fails the suite.
 *
 * Keys are the JSON field names and are part of the backup file format — renaming one
 * makes older backups stop restoring that collection, so treat them as frozen.
 */
export const BACKUP_MODELS = {
  items: Item,
  receipts: Receipt,
  statements: Statement,
  subscriptions: Subscription,
  vouchers: Voucher,
  cards: Card,
  tasks: Task,
  stores: Store,
  // Added 2026-07-26 — all seven were user-owned data that the backup silently skipped.
  expenses: Expense,
  bills: Bill,
  goals: Goal,
  giftCards: GiftCard,
  loyaltyCards: LoyaltyCard,
  netWorthSnapshots: NetWorthSnapshot,
  shoppingList: ShoppingListItem,
} as const;

export type BackupKey = keyof typeof BACKUP_MODELS;

/**
 * The same registry as a plain key list, for code that must know WHICH collections a
 * backup should carry without pulling in the Mongoose models (lib/backupVerify.ts is
 * pure and model-free by design, so it takes this as an argument).
 */
export const BACKUP_KEYS: readonly string[] = Object.keys(BACKUP_MODELS);

/**
 * Models deliberately kept OUT of the JSON backup, each with the reason. This is not
 * documentation only: the guard test reads src/models and requires every file to appear
 * either here or in BACKUP_MODELS, so a new model forces an explicit decision.
 *
 * Three reasons appear below, and the first one matters most: the backup file is
 * downloaded to the user's machine and can be mailed around, so anything holding
 * credentials or password hashes must never be written into it. A full disaster-recovery
 * copy (including settings and logins) is what `scripts/backup.sh` mongodump does.
 */
export const BACKUP_EXCLUDED: Record<string, string> = {
  // — Secrets: never write these to a file the user downloads —
  PlatformConfig:
    'Operator-only, control-plane singleton holding the encrypted PLATFORM AI key. It belongs to nobody\'s workspace: putting it in a tenant backup would hand every customer who exports their data the key the whole fleet runs on. Restore it by setting it again in the admin console.',
  AppConfig:
    'Holds live credentials (AI provider keys, SMB/FTP password, OneDrive refresh token, ntfy URL) alongside settings. Budgets/prompts/taxonomies would be nice to restore, but only behind a field-level redaction pass; use mongodump for a full copy.',
  User: 'Login accounts with scrypt password hashes.',
  Account: 'SaaS control-plane login identity with password hash + MFA secrets.',

  // — SaaS control-plane: lives in the central registry DB, not in a tenant's data —
  Tenant: 'SaaS control-plane (central registry DB), not per-tenant data.',
  Membership: 'SaaS control-plane join table between Account and Tenant.',
  Invite: 'SaaS control-plane pending invitation, short-lived by design.',
  Usage: 'SaaS control-plane metering ledger, rebuilt from billing, not user content.',
  AuditEvent: 'SaaS control-plane append-only security log; restoring a log would forge its history.',

  // — Transient / regenerable state —
  Job: 'Background job queue state; a finished or interrupted job means nothing after a restore.',
  Notification: 'Alert instances, re-derived by the next alert check (dedupeKey keeps them unique).',
  Conversation:
    'AI command-bar chat log (/history). User-visible but large and regenerable; the backup stays a data-recovery file rather than a log archive.',
  Phase: 'Legacy setup-phases model from the original tracker import; no UI imports it any more.',
};
