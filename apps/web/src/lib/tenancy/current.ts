import { DEFAULT_TENANT, dbNameFor, type TenantContext } from './context';

/** Compatibility wrapper: only the configured self-hosted database is supported. */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  dbNameFor(ctx);
  return fn();
}
export function currentTenant(): TenantContext { return DEFAULT_TENANT; }
export function hasTenantContext(): boolean { return false; }
