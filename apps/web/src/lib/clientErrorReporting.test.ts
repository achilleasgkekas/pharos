import { describe, it, expect, afterEach, vi } from 'vitest';

describe('clientErrorReporting · off unless the server enabled it', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('is a no-op (and never loads the SDK) without window config', async () => {
    vi.stubGlobal('window', {});
    const sdk = vi.fn();
    vi.doMock('@sentry/nextjs', () => { sdk(); return {}; });
    const m = await import('./clientErrorReporting');
    expect(m.clientSentryConfig()).toBeNull();
    expect(await m.ensureClientSentry()).toBeNull();
    m.reportClientError(new Error('x'));
    await Promise.resolve();
    expect(sdk).not.toHaveBeenCalled();
  });

  it('inits once and captures when configured', async () => {
    vi.stubGlobal('window', { __PHAROS_SENTRY__: { dsn: 'https://k@o1.ingest.de.sentry.io/2', environment: 'saas' } });
    let client: object | undefined;
    const init = vi.fn((_opts: Record<string, unknown>) => { client = {}; });
    const captureException = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({ init, captureException, getClient: () => client }));
    const m = await import('./clientErrorReporting');
    await m.ensureClientSentry();
    await m.ensureClientSentry();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: 'https://k@o1.ingest.de.sentry.io/2', environment: 'saas', sendDefaultPii: false, tracesSampleRate: 0 });
    m.reportClientError(new Error('boom'));
    await new Promise((r) => setTimeout(r, 0));
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
