/**
 * Private beta: who may create an account at all.
 *
 * Distinct from `lib/billing/activationCode`, and the distinction is the point. Activation
 * codes grant a PAID PLAN to a workspace that already exists. This gates the door one step
 * earlier — whether a stranger can make a free account in the first place.
 *
 *     SAAS_SIGNUP_CODES="ALPHA-1,ALPHA-2"
 *
 * UNSET MEANS OPEN, deliberately. Defaulting to closed would silently break signup on any
 * deployment that upgrades without setting the variable, including the self-hosted app where
 * this is meaningless. A deployment that wants a closed beta says so.
 *
 * PURE (env injectable), so the rule is unit-testable and never reaches for a DB.
 */
type Env = { SAAS_SIGNUP_CODES?: string | undefined; [k: string]: string | undefined };

/** Case- and whitespace-insensitive, so a code read off a phone or an email still works. */
export function normalizeSignupCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

/** The configured codes. Blank entries are dropped rather than becoming a code that matches ''. */
export function signupCodes(env: Env = process.env): string[] {
  return (env.SAAS_SIGNUP_CODES || '')
    .split(',')
    .map((c) => normalizeSignupCode(c))
    .filter((c) => c.length > 0);
}

/** True when signup is gated at all on this deployment. */
export function signupGated(env: Env = process.env): boolean {
  return signupCodes(env).length > 0;
}

/**
 * May this signup proceed?
 *
 * `hasInvite` is the carve-out that matters: a workspace invitation IS an authorisation,
 * issued by someone already inside, and the accept flow resolves to the invite's own email.
 * Requiring a beta code on top would mean an owner could invite a colleague who then could
 * not get in — the invite would look broken while behaving exactly as configured.
 */
export function signupAllowed(
  submittedCode: unknown,
  hasInvite: boolean,
  env: Env = process.env
): boolean {
  if (!signupGated(env)) return true;
  if (hasInvite) return true;
  const code = normalizeSignupCode(submittedCode);
  if (!code) return false;
  return signupCodes(env).includes(code);
}
