/**
 * Activation codes — the ONLY way a workspace gets a paid plan right now.
 *
 * Self-serve payment is not open yet: Stripe checkout answers 503 without keys, and the
 * business decision is that nobody buys by themselves until it is. So a plan is switched on
 * by redeeming a code that Achilleas hands out personally, and every other route to a paid
 * plan is refused rather than left half-working.
 *
 * Codes live in `SAAS_ACTIVATION_CODES` as `CODE:plan` pairs, comma-separated:
 *
 *     SAAS_ACTIVATION_CODES="FRIENDS-2026:shared,ACME-PILOT:dedicated"
 *
 * PURE (env injectable) so the matching rule is unit-testable and never reaches for a DB.
 * Nothing here logs a code: they are shared secrets, short-lived by intent but still secrets.
 */
import type { PlanKey } from './plans';

/** The plans a code may grant. `free` is not one: nobody needs a code to stay free. */
export const ACTIVATABLE_PLANS = ['shared', 'dedicated'] as const;
export type PaidPlan = (typeof ACTIVATABLE_PLANS)[number];

export type ActivationCode = { code: string; plan: PaidPlan };

// Compile-time tie to the canonical plan list: if PlanKey ever loses one of these, this breaks.
const _planKeyCheck: readonly PlanKey[] = ACTIVATABLE_PLANS;
void _planKeyCheck;

type Env = { SAAS_ACTIVATION_CODES?: string | undefined; [k: string]: string | undefined };

/** Case- and whitespace-insensitive, so a code read off a phone screen still works. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function isPaidPlan(v: string): v is PaidPlan {
  return (ACTIVATABLE_PLANS as readonly string[]).includes(v);
}

/**
 * Parse the configured pairs. Anything malformed is DROPPED, not guessed: a typo in the env
 * must fail closed (that code simply does not work) rather than quietly granting a plan
 * nobody meant to give away.
 */
export function parseActivationCodes(env: Env = process.env): ActivationCode[] {
  const raw = (env.SAAS_ACTIVATION_CODES || '').trim();
  if (!raw) return [];
  const out: ActivationCode[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(',')) {
    const [codePart, planPart] = entry.split(':');
    const code = normalizeCode(codePart);
    const plan = String(planPart ?? '').trim().toLowerCase();
    if (!code || !isPaidPlan(plan)) continue;
    if (seen.has(code)) continue; // first definition wins; a dupe is a config mistake
    seen.add(code);
    out.push({ code, plan });
  }
  return out;
}

/** True when at least one code is configured, i.e. activation is possible at all. */
export function activationConfigured(env: Env = process.env): boolean {
  return parseActivationCodes(env).length > 0;
}

/**
 * Which plan a submitted code grants, or null.
 *
 * Null covers every rejection with one answer on purpose — unknown code, blank, wrong
 * plan, nothing configured — so the endpoint cannot accidentally tell an attacker which
 * part of their guess was close.
 */
export function planForCode(submitted: unknown, env: Env = process.env): PaidPlan | null {
  const code = normalizeCode(submitted);
  if (!code) return null;
  const match = parseActivationCodes(env).find((c) => c.code === code);
  return match ? match.plan : null;
}

/**
 * The full decision for an activation attempt: the plan the caller ASKED for must be the
 * plan the code actually grants.
 *
 * Checking both matters. Without it, a code issued for the €9 shared plan would activate the
 * €29 dedicated one just by changing one field in the request body, because the code itself
 * verified fine.
 */
export function resolveActivation(
  submittedCode: unknown,
  requestedPlan: unknown,
  env: Env = process.env
): { ok: true; plan: PaidPlan } | { ok: false; reason: 'not-configured' | 'invalid' | 'plan-mismatch' } {
  if (!activationConfigured(env)) return { ok: false, reason: 'not-configured' };
  const granted = planForCode(submittedCode, env);
  if (!granted) return { ok: false, reason: 'invalid' };
  const asked = String(requestedPlan ?? '').trim().toLowerCase();
  // No requested plan → take the code's own. An explicit one must agree with it.
  if (asked && asked !== granted) return { ok: false, reason: 'plan-mismatch' };
  return { ok: true, plan: granted };
}
