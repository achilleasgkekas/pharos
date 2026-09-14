// Next.js instrumentation hook: server-side error reporting. Loads the Sentry SDK only when the
// operator configured SENTRY_DSN (see lib/errorReporting.ts for why it is runtime-configured and
// off by default). Edge runtime (middleware) is deliberately not instrumented: it holds no
// business logic, and a second SDK build there would only add weight.
import { sentryDsn, sentryEnvironment, baseSentryOptions, scrubEvent } from '@/lib/errorReporting';
import { saasMode } from '@/lib/tenancy/saasMode';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const dsn = sentryDsn();
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    ...baseSentryOptions(dsn, sentryEnvironment(saasMode())),
    beforeSend: (event) => scrubEvent(event as never),
  });
}

// Errors thrown while rendering server components, route handlers and server actions.
export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !sentryDsn()) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
