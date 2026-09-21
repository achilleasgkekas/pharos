import type { Connection, Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { dbNameFor, type TenantContext } from './context';

/** Always use the existing MONGO_URI connection. No useDb, migration or new database. */
export async function getTenantConnection(dbName: string): Promise<Connection> {
  if (dbName) throw new Error('Hosted workspace databases are no longer supported');
  return (await connectDB()).connection;
}
export async function tenantDb(ctx: TenantContext): Promise<Connection> {
  return getTenantConnection(dbNameFor(ctx));
}
export function tenantModel<T>(conn: Connection, model: Model<T>): Model<T> {
  if (conn !== model.db) throw new Error('Model must use the configured self-hosted database');
  return model;
}
export async function currentModel<T>(model: Model<T>): Promise<Model<T>> {
  return tenantModel(await getTenantConnection(''), model);
}
