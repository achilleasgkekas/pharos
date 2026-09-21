import { DEFAULT_TENANT, type TenantContext } from './context';

// Compatibility exports keep feature actions stable while removing all host-based
// database routing. Authentication remains in middleware, session and bearer guards.
export async function resolveRequestTenant(): Promise<TenantContext> { return DEFAULT_TENANT; }
export async function resolveRequestTenantOrNull(): Promise<TenantContext | null> { return DEFAULT_TENANT; }
export async function softRequestTenant(): Promise<TenantContext> { return DEFAULT_TENANT; }
export async function withRequestTenant<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
export async function assertKnownWorkspaceHost(): Promise<void> { /* no hosted workspaces */ }
