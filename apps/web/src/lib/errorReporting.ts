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
  message?: unknown;
  exception?: unknown;
  extra?: unknown;
  tags?: unknown;
  contexts?: unknown;
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

// Free text is where personal data actually leaks: `throw new Error(\`no bill for ${email}\`)`,
// a breadcrumb logging a form value, an `extra` blob. Structural scrubbing alone cannot see that, so
// every string that reaches Sentry also goes through these patterns. Deliberately greedy: a
// redacted digit run in a stack message costs nothing, a leaked IBAN costs a lot.
const REDACTIONS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '[auth]'],
  [/\b(?:sk|pk|rk|whsec|sntry[a-z]?|ghp|gho|xox[abp])_[A-Za-z0-9_-]{10,}\b/g, '[secret]'],
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[iban]'],
  [/(?:€|\$|£|EUR|USD|GBP)\s?-?\d[\d.,\s]*\d|\b-?\d[\d.,]*\s?(?:€|EUR|USD|GBP)/g, '[amount]'],
  [/\b\d(?:[\s-]?\d){7,}\b/g, '[number]'], // cards, phones, tax/ids
];

export function redactText(text: string): string {
  let out = text;
  for (const [re, repl] of REDACTIONS) out = out.replace(re, repl);
  return out;
}

// SDK-generated environment descriptors: no user content, and redacting them would only blur
// debugging (browser/os versions look like "numbers").
const SAFE_CONTEXTS = new Set(['os', 'browser', 'runtime', 'device', 'trace', 'app', 'culture', 'cloud_resource', 'nextjs']);

function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, depth + 1);
  return out;
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
  // Free text: messages, exception values, breadcrumb messages/data, extras, tags, custom contexts.
  if (typeof event.message === 'string') event.message = redactText(event.message);
  const exc = event.exception as { values?: Array<{ value?: string }> } | undefined;
  for (const v of exc?.values ?? []) if (typeof v.value === 'string') v.value = redactText(v.value);
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === 'string') b.message = redactText(b.message);
    if (b.data) b.data = redactDeep(b.data) as Record<string, unknown>;
  }
  if (event.extra) event.extra = redactDeep(event.extra);
  if (event.tags) event.tags = redactDeep(event.tags);
  if (event.contexts && typeof event.contexts === 'object') {
    const ctx = event.contexts as Record<string, unknown>;
    for (const k of Object.keys(ctx)) if (!SAFE_CONTEXTS.has(k)) ctx[k] = redactDeep(ctx[k]);
  }
  return event;
}
