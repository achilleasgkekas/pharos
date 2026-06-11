// Server-only AI feature gating. Imports the AI config + provider readiness (which
// pull in node-only deps), so this must NEVER be imported by a client component —
// use ./aiFeatures for the client-safe registry/types instead.
import { getAiConfig } from './aiConfig';
import { isAiReady } from './ollama';
import type { AiFeatureKey, AiFeatureStatus } from './aiFeatures';

/** True when the master switch is on AND this feature isn't explicitly disabled.
 *  Does NOT check provider readiness (use aiFeatureStatus for that). */
export async function isFeatureEnabled(key: AiFeatureKey): Promise<boolean> {
  const cfg = await getAiConfig();
  return cfg.aiEnabled && cfg.aiFeatures[key] !== false;
}

/** Combined: 'disabled' (toggle off) | 'no-provider' (on but no working AI) | 'ready'. */
export async function aiFeatureStatus(key: AiFeatureKey): Promise<AiFeatureStatus> {
  if (!(await isFeatureEnabled(key))) return 'disabled';
  return (await isAiReady()) ? 'ready' : 'no-provider';
}
