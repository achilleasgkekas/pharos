import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from './roles';

// Only authenticated entry points and the persisted job worker establish this context.
// This is separate from actor attribution, which is never an authorization credential.
const globalAuth = globalThis as typeof globalThis & { __pharosWriteAuth?: AsyncLocalStorage<Role> };
const auth = (globalAuth.__pharosWriteAuth ??= new AsyncLocalStorage<Role>());
export function authorizedWriteRole(): Role | undefined { return auth.getStore(); }
export function withWriteAuthorization<T>(role: Role, fn: () => T): T { return auth.run(role, fn); }
