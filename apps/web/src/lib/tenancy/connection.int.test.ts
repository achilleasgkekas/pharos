import mongoose, { Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@/test/mongo';
import { currentModel, getTenantConnection, tenantModel } from './connection';
import { Item } from '@/models/Item';

// The single-database guard (lib/tenancy/connection.ts) against a real connection (#331): every
// query must land in the database MONGO_URI names, and a model bound to any other connection
// must be refused rather than silently read.
const { name } = setupTestDatabase();

describe('database guard', () => {
  it('currentModel resolves to the configured database', async () => {
    const M = await currentModel(Item);
    expect(M.db.name).toBe(name);
    await M.create({ title: 'Guarded' });
    const raw = await mongoose.connection.db!.collection('items').countDocuments({ title: 'Guarded' });
    expect(raw).toBe(1);
  });

  it('refuses a named workspace database', async () => {
    await expect(getTenantConnection('someone_else')).rejects.toThrow(/no longer supported/);
  });

  it('refuses a model bound to another connection', async () => {
    const other = mongoose.createConnection(process.env.MONGO_URI!.replace(name, `${name}_other`));
    try {
      const Foreign = other.model('Foreign', new Schema({ x: Number }));
      const conn = await getTenantConnection('');
      expect(() => tenantModel(conn, Foreign as never)).toThrow(/configured self-hosted database/);
    } finally {
      await other.dropDatabase();
      await other.close();
    }
  });
});
