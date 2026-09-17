import { describe, it, expect, vi } from 'vitest';
import { enableWebPush, urlBase64ToUint8Array, type EnableWebPushDeps } from './webPushClient';

// Issue #1: on an iPhone home-screen app, "Enable browser push" did nothing, because the
// permission prompt was requested only after the service worker round trip had used up the
// tap's user gesture. These tests pin the ordering that fixes it.

function makeDeps(over: Partial<EnableWebPushDeps> = {}) {
  const calls: string[] = [];
  const sub = { toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }) };
  const subscribe = vi.fn(async () => {
    calls.push('subscribe');
    return sub;
  });
  const deps: EnableWebPushDeps = {
    permission: 'default',
    requestPermission: vi.fn(async () => {
      calls.push('requestPermission');
      return 'granted' as const;
    }),
    registerWorker: vi.fn(async () => {
      calls.push('registerWorker');
      return { subscribe };
    }),
    getPublicKey: vi.fn(async () => {
      calls.push('getPublicKey');
      return { publicKey: 'BAAB' };
    }),
    save: vi.fn(async () => {
      calls.push('save');
      return { ok: true };
    }),
    ...over,
  };
  return { deps, calls, subscribe };
}

describe('enableWebPush', () => {
  it('asks for permission synchronously, before any other step is started', () => {
    const { deps, calls } = makeDeps();
    // Deliberately NOT awaited: whatever ran before the first microtask ran inside the gesture.
    void enableWebPush(deps);
    expect(calls).toEqual(['requestPermission']);
  });

  it('runs permission, worker, key, subscribe, save in that order', async () => {
    const { deps, calls } = makeDeps();
    const r = await enableWebPush(deps);
    expect(r).toEqual({ ok: true, message: 'Browser push enabled ✓' });
    expect(calls).toEqual(['requestPermission', 'registerWorker', 'getPublicKey', 'subscribe', 'save']);
    expect(deps.save).toHaveBeenCalledWith({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } });
  });

  it('does not prompt again when permission is already granted', async () => {
    const { deps, calls } = makeDeps({ permission: 'granted' });
    await enableWebPush(deps);
    expect(deps.requestPermission).not.toHaveBeenCalled();
    expect(calls[0]).toBe('registerWorker');
  });

  it('stops without touching the server when permission is refused', async () => {
    const { deps } = makeDeps({ requestPermission: vi.fn(async () => 'denied' as const) });
    const r = await enableWebPush(deps);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Permission denied/);
    expect(deps.registerWorker).not.toHaveBeenCalled();
    expect(deps.getPublicKey).not.toHaveBeenCalled();
  });

  it('reports a missing server key and an incomplete subscription', async () => {
    const noKey = makeDeps({ getPublicKey: vi.fn(async () => ({ publicKey: '' })) });
    expect((await enableWebPush(noKey.deps)).message).toBe('Could not set up push on the server.');
    expect(noKey.subscribe).not.toHaveBeenCalled();

    const partial = makeDeps({
      registerWorker: vi.fn(async () => ({ subscribe: async () => ({ toJSON: () => ({ endpoint: 'x' }) }) })),
    });
    expect((await enableWebPush(partial.deps)).message).toBe('Subscription was incomplete — try again.');
    expect(partial.deps.save).not.toHaveBeenCalled();
  });

  it('surfaces the save error', async () => {
    const { deps } = makeDeps({ save: vi.fn(async () => ({ ok: false, error: 'nope' })) });
    expect(await enableWebPush(deps)).toEqual({ ok: false, message: 'nope' });
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "-_8" is base64url for bytes 0xfb 0xff; standard base64 would be "+/8=".
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });
});
