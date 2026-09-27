import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@/test/mongo';

// Every schema's indexes must build on a real MongoDB (#331). A conflicting pair (same keys,
// different options), an invalid text index or a unique index on a field that the app writes
// duplicates to is only found by the server, at startup on someone's instance.
setupTestDatabase();

const MODEL_FILES = readdirSync(resolve(__dirname)).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));

describe('model indexes', () => {
  it('every model under src/models builds its indexes', async () => {
    for (const file of MODEL_FILES) await import(`./${file.replace(/\.ts$/, '')}`);
    const names = mongoose.modelNames();
    expect(names.length).toBeGreaterThanOrEqual(MODEL_FILES.length - 1);
    for (const n of names) {
      await expect(mongoose.model(n).syncIndexes(), n).resolves.toBeDefined();
    }
  });

  it('a statement period can be imported only once per card', async () => {
    const { Statement } = await import('./Statement');
    const doc = { card: 'Visa 1234', period: '2026-06', statementDate: new Date('2026-06-30'), totalAmount: 10 };
    await Statement.create(doc);
    await expect(Statement.create(doc)).rejects.toThrow(/duplicate key/);
  });
});
