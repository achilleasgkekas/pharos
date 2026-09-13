'use client';

// Browser-side error reporting. Rendered by the root layout ONLY when the server has a DSN, and
// the SDK is imported lazily, so installs without Sentry never download it.
import { useEffect } from 'react';
import { baseSentryOptions, scrubEvent } from '@/lib/errorReporting';

export function SentryInit({ dsn, environment }: { dsn: string; environment: string }) {
  useEffect(() => {
    let cancelled = false;
    import('@sentry/nextjs').then((Sentry) => {
      if (cancelled || Sentry.getClient()) return; // once per page load, survives soft navigation
      Sentry.init({
        ...baseSentryOptions(dsn, environment),
        // Default integrations only (global error/rejection handlers, breadcrumbs). Replay is
        // never added and tracesSampleRate is 0, so nothing beyond errors is sent.
        beforeSend: (event) => scrubEvent(event as never),
      });
    }).catch(() => { /* reporting must never break the app */ });
    return () => { cancelled = true; };
  }, [dsn, environment]);
  return null;
}
