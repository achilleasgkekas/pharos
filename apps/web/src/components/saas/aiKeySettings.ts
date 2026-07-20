// PURE + client-safe helpers for the workspace "AI key" (BYO-key) panel
// (WorkspaceSettingsPanel's sibling AiKeyPanel.tsx). Mirrors the server-side validation/error
// shapes for PUT/DELETE /api/saas/workspace/ai-key so the form gives instant feedback, same
// idiom as workspaceSettings.ts / authValidation.ts.
//
// PROVIDERS is a deliberate MIRROR of lib/billing/byoKey.ts's BYO_PROVIDERS, not a re-export:
// that module pulls in lib/tenancy/secretCrypto (node:crypto), which must never enter a client
// bundle. Keep this list in lockstep by hand if the server list ever changes (same trade-off the
// codebase already makes for authValidation's EMAIL_RE / MIN_PASSWORD mirrors).
//
// No DOM, no server bindings — safe to unit test and to import from a client component.

export const AI_KEY_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'custom'] as const;
export type AiKeyProvider = (typeof AI_KEY_PROVIDERS)[number];

const PROVIDER_LABELS: Record<AiKeyProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  custom: 'Custom (OpenAI-compatible)',
};

export function isAiKeyProvider(v: unknown): v is AiKeyProvider {
  return typeof v === 'string' && (AI_KEY_PROVIDERS as readonly string[]).includes(v);
}

/** Human label for a provider id; falls back to the raw id for an unrecognized value. */
export function aiKeyProviderLabel(provider: string): string {
  return isAiKeyProvider(provider) ? PROVIDER_LABELS[provider] : provider;
}

/**
 * A proposed key is submittable when the crypto backend is configured, the provider is one of
 * the supported ids, and the key is non-blank once trimmed — mirrors encodeAiKey's guard on the
 * server so the Save button naturally disables before a round-trip that would 400/503.
 */
export function aiKeySaveReady(provider: string, key: string, cryptoReady: boolean): boolean {
  if (!cryptoReady) return false;
  if (!isAiKeyProvider(provider)) return false;
  return (key || '').trim().length > 0;
}

/**
 * Map an ai-key API failure (PUT/DELETE) to a human message. Prefers the server-provided
 * `error` string (already user-facing: "provider must be one of …", "server is not configured
 * to store secrets …") and falls back to a status-derived line, same idiom as
 * describeWorkspaceSettingsError / describeAuthError.
 */
export function describeAiKeyError(status: number, serverError?: unknown): string {
  if (typeof serverError === 'string' && serverError.trim()) return serverError.trim();
  if (status === 401) return 'Please sign in again';
  if (status === 403) return 'You do not have permission to do that';
  if (status === 404) return 'That workspace was not found';
  if (status === 503) return 'This server is not set up to store secrets yet';
  if (status >= 500) return 'Something went wrong. Please try again';
  return 'Could not save the key. Please check the details and try again';
}
