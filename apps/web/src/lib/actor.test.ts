import { describe, it, expect, vi } from 'vitest';

// Outside a request next/headers throws; model the same thing here.
vi.mock('next/headers', () => ({
  cookies: async () => {
    throw new Error('cookies() was called outside a request scope');
  },
}));

import { currentActorId, runAsActor } from './actor';

const ID = '64b7f0c2a1b2c3d4e5f60718';

describe('currentActorId', () => {
  it('is null outside a request and without an explicit actor', async () => {
    expect(await currentActorId()).toBeNull();
  });

  it('returns the explicit actor inside runAsActor, across awaits', async () => {
    const seen = await runAsActor(ID, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentActorId();
    });
    expect(seen).toBe(ID);
  });

  it('does not leak the actor out of runAsActor', async () => {
    await runAsActor(ID, async () => undefined);
    expect(await currentActorId()).toBeNull();
  });

  it('runs a lazy thenable (a Mongoose query) inside the scope', async () => {
    // A query only executes when awaited; this one records the actor at that moment.
    const lazy = { then: (ok: (v: string | null) => void) => void currentActorId().then(ok) } as unknown as PromiseLike<string | null>;
    expect(await runAsActor(ID, () => lazy)).toBe(ID);
  });

  it('ignores an actor that is not an ObjectId, and a missing one', async () => {
    expect(await runAsActor('not-an-id', () => currentActorId())).toBeNull();
    expect(await runAsActor(null, () => currentActorId())).toBeNull();
  });
});
