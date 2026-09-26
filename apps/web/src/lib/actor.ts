import { AsyncLocalStorage } from 'node:async_hooks';
import { isValidObjectId } from 'mongoose';

// P75 (#20) — "who is doing this", for attribution only. NEVER an authorisation input: the
// permission checks stay in assertCanWrite / withAuth, and a wrong or missing answer here only
// means a record shows no "added by" line.
//
// Two sources, in order:
//  1. An explicit actor set by an entry point that does not use the session cookie. The
//     /api/v1 routes and the MCP endpoint authenticate with a bearer token, so they wrap their
//     work in runAsActor(user.id, ...).
//  2. The session cookie of the current request (server actions, pages). Outside a request
//     (background jobs, cron, scripts, tests) next/headers throws, which reads as "nobody".
//
// The store lives on globalThis rather than in module scope, the same way lib/db.ts keeps its
// connection on `global`: runAsActor (in a route) and the model hook that reads it must share
// one store, and a dev-server reload or a second copy of this module in another server bundle
// would otherwise give each side its own, silently dropping the attribution.
const globalActor = globalThis as typeof globalThis & { __pharosActorStore?: AsyncLocalStorage<string> };
const actorStore = (globalActor.__pharosActorStore ??= new AsyncLocalStorage<string>());

/** Run `fn` with `userId` as the actor for every record it creates. */
export function runAsActor<T>(userId: string | null | undefined, fn: () => T): T {
  return userId ? actorStore.run(userId, fn) : fn();
}

/** The user id to stamp on a new record, or null when nobody can be named. */
export async function currentActorId(): Promise<string | null> {
  const explicit = actorStore.getStore();
  if (explicit) return isValidObjectId(explicit) ? explicit : null;
  try {
    // Imported lazily: the models load this module, and they also run where next/headers
    // does not exist (the job runner, scripts, unit tests).
    const [{ cookies }, { verifySession, SESSION_COOKIE }] = await Promise.all([import('next/headers'), import('./session')]);
    const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
    return claims?.sub && isValidObjectId(claims.sub) ? claims.sub : null;
  } catch {
    return null; // no request scope
  }
}
