import { describe, it, expect, vi, beforeEach } from 'vitest';

// `safeRevalidate` wraps next/cache's revalidatePath so the background job worker
// (lib/jobRunner) can invalidate page caches without crashing. revalidatePath()
// THROWS when called outside a request/action scope, and the worker runs detached
// from any request — so the wrapper must swallow that error. Pages are force-dynamic
// and every device polls job state, so a skipped revalidate is never a correctness
// issue, but an UNCAUGHT throw would kill the worker mid-job. These tests pin both
// halves of that contract: the happy path forwards the exact path, and a throwing
// revalidatePath is absorbed silently.
//
// We mock next/cache so no Next.js request context is needed. The mock is declared
// via vi.mock (hoisted) and reconfigured per test through the mock reference.

const revalidatePathMock = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

import { safeRevalidate } from './revalidate';

describe('safeRevalidate', () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    // default: succeed silently, like an in-request call
    revalidatePathMock.mockImplementation(() => undefined);
  });

  it('forwards the path verbatim to revalidatePath', () => {
    safeRevalidate('/receipts');
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/receipts');
  });

  it('returns undefined on the happy path', () => {
    expect(safeRevalidate('/items')).toBeUndefined();
  });

  it('passes through an empty path unchanged (no normalization)', () => {
    safeRevalidate('');
    expect(revalidatePathMock).toHaveBeenCalledWith('');
  });

  it('does not throw when revalidatePath throws (out-of-request scope)', () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('Route ... used "revalidatePath" outside a request scope');
    });
    expect(() => safeRevalidate('/statements')).not.toThrow();
  });

  it('returns undefined even when the underlying call throws', () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(safeRevalidate('/statements')).toBeUndefined();
  });

  it('still attempts the call before swallowing the error', () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error('boom');
    });
    safeRevalidate('/subscriptions');
    // the swallow happens AFTER the attempt, so the path must have reached the wrapped fn
    expect(revalidatePathMock).toHaveBeenCalledWith('/subscriptions');
  });

  it('swallows non-Error throws too (e.g. a thrown string)', () => {
    revalidatePathMock.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'not-an-error';
    });
    expect(() => safeRevalidate('/tasks')).not.toThrow();
  });

  it('calls revalidatePath once per invocation (no retry on success)', () => {
    safeRevalidate('/vouchers');
    safeRevalidate('/vouchers');
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
  });
});
