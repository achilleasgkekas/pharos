// Per-tenant connection layer (increment 3).
//
// Database-per-tenant data plane: every tenant's feature data lives in its own database
// (`tenant_<slug>`), but they all share ONE MongoDB client / socket pool. Mongoose's
// `connection.useDb(name)` gives us a lightweight Connection scoped to another database on
// the same client — exactly what we want: full data isolation, one pool.
//
// Backward-compatibility contract (see SAAS_PROGRESS.md → Architecture):
//   - SAAS_MODE off, or an empty dbName (the DEFAULT_TENANT) → we return the DEFAULT
//     connection UNCHANGED. No `useDb` switch, no extra pool. This is byte-for-byte the
//     self-hosted single-user behaviour.
//   - SAAS_MODE on with a real dbName → a cached `useDb` connection for that tenant.
//
// This is ADDITIVE: it does not touch `connectDB()` and nothing imports it yet. It is
// NODE-ONLY (Mongoose) — never import from middleware / the edge runtime.
import type { Connection, Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { dbNameFor, type TenantContext } from './context';
import { currentTenant } from './current';

// Per-database Connection cache, HMR-safe (survives Next.js dev hot reloads) the same way
// lib/db.ts caches the base connection on globalThis.
interface TenantConnCache {
  conns: Map<string, Connection>;
}

declare global {
  // eslint-disable-next-line no-var
  var __pharosTenantConns: TenantConnCache | undefined;
}

const cache: TenantConnCache = global.__pharosTenantConns ?? { conns: new Map() };
if (!global.__pharosTenantConns) {
  global.__pharosTenantConns = cache;
}

/**
 * Get a Mongoose Connection for a given data database.
 *   - Empty `dbName` (self-hosted default) → the default MONGO_URI connection unchanged.
 *   - Non-empty → a cached `useDb(dbName)` connection sharing the default client's pool.
 *
 * Always ensures the base connection is established first (via connectDB), so callers
 * never have to sequence `connectDB()` themselves.
 */
export async function getTenantConnection(dbName: string): Promise<Connection> {
  const base = await connectDB();
  const defaultConn = base.connection;

  // Self-hosted default (or SAAS_MODE off) → default connection as-is.
  if (!dbName) return defaultConn;

  const existing = cache.conns.get(dbName);
  // Reuse only while the underlying connection is still open; a dropped socket would make
  // a stale entry unusable, so fall through and rebuild it.
  if (existing && existing.readyState !== 99 /* uninitialized */) return existing;

  // useCache lets Mongoose reuse the same scoped connection internally too; our Map is the
  // explicit, process-wide handle we hand back to callers.
  const conn = defaultConn.useDb(dbName, { useCache: true });
  cache.conns.set(dbName, conn);
  return conn;
}

/**
 * Convenience: resolve the Connection for a whole TenantContext. `dbNameFor` returns the
 * empty string for the default tenant, so this transparently yields the default connection
 * in self-hosted mode.
 */
export async function tenantDb(ctx: TenantContext): Promise<Connection> {
  return getTenantConnection(dbNameFor(ctx));
}

/**
 * Bind an existing Mongoose Model to a tenant Connection so its queries hit that tenant's
 * database. The app's feature models are all compiled on the DEFAULT connection; to run
 * the very same schema against a tenant db we recompile it on that connection (Mongoose
 * caches per-connection, so this is a cheap lookup after the first call).
 *
 *   const Item = tenantModel(await tenantDb(ctx), ItemModel);
 *   await Item.find(...); // runs in the tenant's database
 *
 * When `conn` is the default connection this returns the original model untouched.
 */
export function tenantModel<T>(conn: Connection, model: Model<T>): Model<T> {
  const existing = conn.models[model.modelName] as Model<T> | undefined;
  if (existing) return existing;
  return conn.model<T>(model.modelName, model.schema);
}

/**
 * The tenant-bound version of a feature model for the CURRENT request. This is the single
 * accessor feature actions use in place of importing a model directly:
 *
 *   const R = await currentModel(Receipt);
 *   await R.find(...); // runs in the current tenant's database
 *
 * It reads the ambient tenant from `currentTenant()` (established by `withRequestTenant`),
 * resolves that tenant's connection, and rebinds the model to it.
 *
 * OSS PARITY (critical): for the self-hosted DEFAULT_TENANT — which is what `currentTenant()`
 * returns whenever no `withTenant` is active (the entire self-hosted app) — `dbNameFor` is
 * the empty string, `tenantDb` yields the DEFAULT connection, and `tenantModel` returns the
 * original model UNTOUCHED. So a self-hosted `await currentModel(Receipt)` is `Receipt` with
 * one cheap `connectDB()` (already required before any query) and nothing else changes.
 */
export async function currentModel<T>(model: Model<T>): Promise<Model<T>> {
  const conn = await tenantDb(currentTenant());
  return tenantModel(conn, model);
}
