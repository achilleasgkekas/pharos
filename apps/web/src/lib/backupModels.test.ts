import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BACKUP_MODELS, BACKUP_EXCLUDED } from './backupModels';

// lib/backupModels.ts is the registry behind Settings → Storage & backup → Export / Restore.
//
// WHY A GUARD TEST RATHER THAN JUST A LIST: the map used to be a local const inside
// settings/actions.ts, and every model added after it was written silently stayed out of
// the backup. By 2026-07-26 seven had piled up that way — Expense (the entire Income/
// Expenses module), Bill, Goal, GiftCard, LoyaltyCard, NetWorthSnapshot, ShoppingListItem
// — so exporting and restoring looked successful while quietly dropping them. The failure
// mode is silent and only shows up when someone actually needs the backup, so the fix is
// not only "add the seven" but "make omission loud": every model file under src/models must
// be either backed up or explicitly excluded WITH a reason.
//
// Behaviour pinned:
//  - completeness: no model can exist without a decision (backed up / excluded), and no
//    entry may linger for a model file that has been deleted;
//  - the seven that were missing are in, keyed the way the file format expects;
//  - existing keys are frozen (renaming one makes older backup files stop restoring that
//    collection, since importData looks collections up by key);
//  - nothing holding credentials or password hashes is in the backup: the JSON is
//    downloaded to the user's machine, so AppConfig/User/Account stay out by design.

const modelsDir = fileURLToPath(new URL('../models', import.meta.url));
const modelFiles = readdirSync(modelsDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => f.replace(/\.ts$/, ''));

/** modelName() as mongoose knows it, e.g. 'ShoppingListItem' — matches the file name. */
const backedUpNames = Object.values(BACKUP_MODELS).map((m) => m.modelName);

describe('backup registry completeness', () => {
  it('finds the model files (guards against the glob silently matching nothing)', () => {
    expect(modelFiles.length).toBeGreaterThan(20);
    expect(modelFiles).toContain('Expense');
  });

  it('every model is either backed up or explicitly excluded with a reason', () => {
    const undecided = modelFiles.filter(
      (name) => !backedUpNames.includes(name) && !(name in BACKUP_EXCLUDED)
    );
    // If this fails you added a model: put it in BACKUP_MODELS (user data) or in
    // BACKUP_EXCLUDED with the reason (secret / control-plane / transient).
    expect(undecided).toEqual([]);
  });

  it('has no exclusion entry for a model that no longer exists', () => {
    const stale = Object.keys(BACKUP_EXCLUDED).filter((name) => !modelFiles.includes(name));
    expect(stale).toEqual([]);
  });

  it('gives every exclusion a non-empty reason', () => {
    for (const [name, reason] of Object.entries(BACKUP_EXCLUDED)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
    }
  });

  it('never lists a model as both backed up and excluded', () => {
    const both = backedUpNames.filter((name) => name in BACKUP_EXCLUDED);
    expect(both).toEqual([]);
  });
});

describe('backup registry contents', () => {
  it('includes the seven models that were silently missing before 2026-07-26', () => {
    for (const name of [
      'Expense',
      'Bill',
      'Goal',
      'GiftCard',
      'LoyaltyCard',
      'NetWorthSnapshot',
      'ShoppingListItem',
    ]) {
      expect(backedUpNames, `${name} must be in the backup`).toContain(name);
    }
  });

  it('keeps the original eight keys unchanged (older backup files restore by key)', () => {
    for (const key of ['items', 'receipts', 'statements', 'subscriptions', 'vouchers', 'cards', 'tasks', 'stores']) {
      expect(Object.keys(BACKUP_MODELS)).toContain(key);
    }
  });

  it('maps each key to the model it names', () => {
    expect(BACKUP_MODELS.expenses.modelName).toBe('Expense');
    expect(BACKUP_MODELS.giftCards.modelName).toBe('GiftCard');
    expect(BACKUP_MODELS.netWorthSnapshots.modelName).toBe('NetWorthSnapshot');
    expect(BACKUP_MODELS.shoppingList.modelName).toBe('ShoppingListItem');
    expect(BACKUP_MODELS.meterReadings.modelName).toBe('MeterReading');
  });

  it('uses a distinct model for every key', () => {
    expect(new Set(backedUpNames).size).toBe(backedUpNames.length);
  });

  it('excludes every model that can hold credentials or password hashes', () => {
    // The export lands in the user's Downloads folder; a leaked API key or scrypt hash
    // there is a different class of problem from a lost expense row.
    for (const name of ['AppConfig', 'User', 'Account']) {
      expect(backedUpNames, `${name} must never be exported`).not.toContain(name);
      expect(BACKUP_EXCLUDED[name]).toBeTruthy();
    }
  });

  it('excludes the SaaS control-plane models (they live in the registry DB)', () => {
    for (const name of ['Tenant', 'Membership', 'Invite', 'Usage', 'AuditEvent']) {
      expect(backedUpNames).not.toContain(name);
    }
  });
});
