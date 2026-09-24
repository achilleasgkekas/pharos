// THE DATABASE GUARD. Read this before "finishing the cleanup" — the names are historical,
// the behaviour is not.
//
// This module used to route a query to one of many per-workspace databases. The hosted product
// is retired, so there is exactly one database now: the one MONGO_URI names. What is left here
// is deliberately NOT a no-op shim on the way out — it is the assertion that every query in the
// app lands in that database and nowhere else:
//
//   getTenantConnection(name) throws unless `name` is empty  → nothing can ask for another db
//   tenantModel(conn, model)  throws unless the model is bound to that connection
//
// ~729 call sites still go through `currentModel(...)`. Removing them would be a mechanical
// rename across the whole data layer whose only prize is tidier spelling, and whose cost is
// losing a runtime check that sits in front of every read and write of real data. It was
// weighed on 2026-09-24 and deliberately NOT done. If the wording bothers you, rename the
// functions — do not delete the checks.
import type { Connection, Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { dbNameFor, type TenantContext } from './context';

/** The one connection. A non-empty `dbName` is a caller that still believes in workspaces. */
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
