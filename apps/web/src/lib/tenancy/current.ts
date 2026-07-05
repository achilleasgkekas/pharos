// Request-scoped "current tenant" store — the missing piece that lets deeply-nested code
// (the AI dispatch in lib/ollama.ts, storage writes, …) know which tenant it is running
// for WITHOUT threading a TenantContext through every function signature.
//
// It uses AsyncLocalStorage so a value set at the top of a request (server action / route
// handler) is transparently readable anywhere in the same async call tree, and isolated
// between concurrent requests. This is the standard Next.js Node-runtime pattern for
// per-request context; it is NODE-ONLY (async_hooks) — never import from the edge/middleware.
//
// OSS PARITY (critical): when nothing runs `withTenant(...)` — which is the ENTIRE
// self-hosted app, since only SaaS entrypoints establish a tenant — `currentTenant()`
// returns the frozen DEFAULT_TENANT. Every consumer (metering, quotas) already treats the
// default tenant as unmetered + unlimited with zero DB access, so the self-hosted app is
// byte-for-byte unchanged and never touches this store's write path.
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_TENANT, type TenantContext } from './context';

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` with `ctx` as the ambient current tenant for the whole async subtree. SaaS
 * entrypoints (a tenant-resolved route handler / server action) wrap their work in this so
 * that anything they call can read the tenant via `currentTenant()`.
 */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * The ambient tenant for the current async context, or DEFAULT_TENANT when none was
 * established (self-hosted app, or code paths that never entered `withTenant`). Never
 * throws and never returns undefined — callers can always rely on a valid context.
 */
export function currentTenant(): TenantContext {
  return storage.getStore() ?? DEFAULT_TENANT;
}

/**
 * True when a tenant has been explicitly established for this async context (i.e. we are
 * inside a `withTenant`). Useful to distinguish "genuinely the default tenant" from "no
 * context was set" — though for metering purposes both behave identically (unmetered).
 */
export function hasTenantContext(): boolean {
  return storage.getStore() !== undefined;
}
