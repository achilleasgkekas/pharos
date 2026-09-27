import { afterAll, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

/**
 * Integration-test database (#331). Points the app's own `connectDB()` at a fresh, uniquely named
 * database on the MongoDB that MONGO_URI names, so the code under test runs its real connection
 * path. Call `setupTestDatabase()` at the top of a `*.int.test.ts` file; the database is dropped
 * after the file's tests.
 */
export function setupTestDatabase(): { name: string } {
  const base = process.env.MONGO_URI;
  if (!base) throw new Error('Integration tests need MONGO_URI (e.g. mongodb://127.0.0.1:27017)');
  const name = `pharos_int_${randomBytes(4).toString('hex')}`;
  const url = new URL(base);
  url.pathname = `/${name}`;
  process.env.MONGO_URI = url.toString();

  beforeAll(async () => {
    await connectDB();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    // db.ts caches the connection on `global`, which a worker can carry into the next file.
    if (global.mongoose) global.mongoose = { conn: null, promise: null };
  });
  return { name };
}
