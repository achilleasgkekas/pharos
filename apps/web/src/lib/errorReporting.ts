// Error reporting (Sentry) — OFF unless the operator sets SENTRY_DSN.
//
// Why runtime env and not NEXT_PUBLIC_SENTRY_DSN: both deploy stacks (SaaS and self-hosted) are
// built from the same source on the same box, and the AGPL image must not phone anywhere by
// default. A NEXT_PUBLIC_ value would be baked into the client bundle at build time — one DSN for
// every install, including strangers' self-hosted ones. So the server reads the DSN per request
// and hands it to <SentryInit> as a prop; no DSN ⇒ the SDK is never even loaded.
//
// Privacy stance: this app holds personal finances. We send ERRORS only (no performance
// tracing, no session replay), never default PII, and scrub whatever the SDK attaches that could
// identify a person or a session before the event leaves the process.

// Minimal structural type: keeps this module importable from tests and client components without
// pulling the SDK's types into every bundle.
export interface ScrubbableEvent {
  user?: Record<string, unknown> | null;
  request?: {
    cookies?: unknown;
    headers?: Record<string, string> | null;
    query_string?: unknown;
    data?: unknown;
    url?: string;
  } | null;
  breadcrumbs?: Array<{ category?: string; data?: Record<string, unknown> | null; message?: string }> | null;
  [key: string]: unknown;
}

type Env = Record<string, string | undefined>;

const SENSITIVE_HEADERS = ['cookie', 'authorization', 'x-api-key', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'];

export function sentryDsn(env: Env = process.env): string | null {
  const dsn = (env.SENTRY_DSN || '').trim();
  return /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/.test(dsn) ? dsn : null;
}

/** 'saas' | 'self-hosted' — lets one Sentry project tell the two stacks apart. */
export function sentryEnvironment(isSaas: boolean, env: Env = process.env): string {
  return (env.SENTRY_ENVIRONMENT || '').trim() || (isSaas ? 'saas' : 'self-hosted');
}

/** Options shared by the server and browser SDKs. */
export function baseSentryOptions(dsn: string, environment: string) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0, // errors only: keeps the free quota for what matters and leaks less
    maxBreadcrumbs: 30,
  };
}

/** Strip identifying data. Mutates and returns the event (Sentry's beforeSend contract). */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) {
    // Keep only an opaque id if the SDK set one; never email, username or IP.
    const id = typeof event.user.id === 'string' || typeof event.user.id === 'number' ? event.user.id : undefined;
    event.user = id !== undefined ? { id } : null;
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data; // form bodies: amounts, names, notes
    delete event.request.query_string;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(h.toLowerCase())) delete event.request.headers[h];
      }
    }
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      // fetch/xhr breadcrumbs carry full URLs with query strings (search terms, ids).
      if (b.data && typeof b.data.url === 'string') b.data.url = b.data.url.split('?')[0];
    }
  }
  return event;
}
