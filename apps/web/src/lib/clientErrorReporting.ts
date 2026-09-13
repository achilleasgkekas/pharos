// Browser half of error reporting. The server writes `window.__PHAROS_SENTRY__` in an inline
// <head> script ONLY when SENTRY_DSN is set (see app/layout.tsx), which runs before any bundle, so
// instrumentation-client.ts can start the SDK before hydration — early enough to see startup and
// hydration failures. No config ⇒ every function here is a no-op and the SDK is never downloaded.
import { baseSentryOptions, scrubEvent } from './errorReporting';

export interface ClientSentryConfig { dsn: string; environment: string }

declare global {
  interface Window { __PHAROS_SENTRY__?: ClientSentryConfig }
}

export function clientSentryConfig(): ClientSentryConfig | null {
  if (typeof window === 'undefined') return null;
  const c = window.__PHAROS_SENTRY__;
  return c && typeof c.dsn === 'string' && c.dsn ? c : null;
}

let loading: Promise<typeof import('@sentry/nextjs') | null> | null = null;

/** Load + init the SDK once. Resolves to null when reporting is off or the SDK fails to load. */
export function ensureClientSentry(): Promise<typeof import('@sentry/nextjs') | null> {
  const cfg = clientSentryConfig();
  if (!cfg) return Promise.resolve(null);
  loading ??= import('@sentry/nextjs')
    .then((Sentry) => {
      if (!Sentry.getClient()) {
        Sentry.init({
          ...baseSentryOptions(cfg.dsn, cfg.environment),
          beforeSend: (event) => scrubEvent(event as never),
        });
      }
      return Sentry;
    })
    .catch(() => null); // reporting must never break the app
  return loading;
}

/**
 * React error boundaries (app/error.tsx, app/global-error.tsx) swallow render errors, so the SDK's
 * global handlers never see them — report explicitly.
 */
export function reportClientError(error: unknown): void {
  void ensureClientSentry().then((Sentry) => { Sentry?.captureException(error); });
}
