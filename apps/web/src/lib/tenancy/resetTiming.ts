// SaaS CONTROL-PLANE — constant-time response floor for the UNAUTHENTICATED password-reset
// request endpoint. Closes D6 (timing side-channel). Only meaningful when SAAS_MODE is on.
//
// The problem: POST /api/saas/account/reset/request returns the SAME { ok: true } body whether
// or not the email is registered (anti-enumeration on the body). But the WALL-CLOCK time differs
// — a non-existent email returns right after the account lookup, while a registered one also
// mints + persists a reset token (a DB write). An attacker timing that difference could still
// enumerate which emails have accounts. We normalise it by padding every reset-request response
// up to a fixed floor, so both branches settle at ~the same time. (The route additionally hands
// the outbound email off WITHOUT awaiting it, so network latency never enters the timed path.)
//
// Only resetResponseDelayMs is pure and unit-tested; settleMinResponseTime just sleeps for it.
// Nothing here is imported by feature code — only the reset-request SaaS route calls it.

/**
 * Minimum wall-clock time (ms) a reset-request response must take. Generous enough to mask a
 * single indexed account write + token mint, small enough to stay tolerable on a rare,
 * unauthenticated endpoint.
 */
export const RESET_MIN_RESPONSE_MS = 500;

/**
 * Remaining delay (ms) needed to reach the floor, given how long the handler has already run.
 * PURE. Clamped to [0, floor]:
 *   - elapsed already past the floor → 0 (no wait).
 *   - a non-finite / negative elapsed is treated as 0 elapsed → the FULL floor, i.e. we fail
 *     safe toward MORE masking, never less.
 *   - a non-finite / non-positive floor disables the floor → 0.
 */
export function resetResponseDelayMs(
  elapsedMs: number,
  floorMs: number = RESET_MIN_RESPONSE_MS,
): number {
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : 0;
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const remaining = floor - elapsed;
  return remaining > 0 ? remaining : 0;
}

/**
 * Sleep out the remaining floor for a handler that began at `startedAtMs`. `nowMs` is
 * injectable for tests. Resolves immediately (no timer scheduled) when the floor is already
 * met, so it never hangs a request that already took long enough.
 */
export async function settleMinResponseTime(
  startedAtMs: number,
  nowMs: number = Date.now(),
): Promise<void> {
  const delay = resetResponseDelayMs(nowMs - startedAtMs);
  if (delay > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
