import { describe, it, expect, vi, beforeEach } from 'vitest';

// getNotifiers() reads AppConfig.notifiers[] and normalizes each stored entry via the private
// coerce(); when the array is empty it MIGRATES the legacy ntfyUrl/ntfyEnabled fields into a
// single ntfy channel, so setups predating the pluggable-notifier array keep alerting until the
// user re-saves from Settings. A regression here (dropping the legacy fallback, or coerce
// mangling a stored channel) would silently disable a user's existing alerts with no error.
// These tests lock the coercion defaults + the migration on/off conditions with a mocked
// AppConfig read (no live Mongo). The dispatch transport lives in notifiers.dispatch.test.ts.

// vi.mock factories are hoisted above imports, so the mock plumbing is built in vi.hoisted()
// (which runs first). `state.doc` is the lean() return value each test sets via setDoc().
const { findOne, select, lean, connectDBMock, state } = vi.hoisted(() => {
  const state: { doc: unknown } = { doc: null };
  const lean = vi.fn(async () => state.doc);
  const select = vi.fn(() => ({ lean }));
  const findOne = vi.fn(() => ({ select }));
  const connectDBMock = vi.fn(async () => {});
  return { findOne, select, lean, connectDBMock, state };
});
vi.mock('./db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { findOne } }));
// getNotifiers routes its read through currentModel(AppConfig) so it hits the current
// tenant's db. For these single-tenant coercion tests, return the mocked AppConfig verbatim
// (the default-tenant path returns the model untouched in production anyway).
vi.mock('./tenancy/connection', () => ({ currentModel: async () => ({ findOne }) }));
// notifiers.ts imports sendNtfyTo at module load; getNotifiers never calls it, but mock it so no
// node-only ntfy transport is pulled in.
vi.mock('./notify', () => ({ sendNtfyTo: vi.fn(async () => true) }));

import { getNotifiers } from './notifiers';

/** Set what the mocked AppConfig.findOne(...).select(...).lean() resolves to. */
function setDoc(doc: unknown) {
  state.doc = doc;
}

beforeEach(() => {
  state.doc = null;
  findOne.mockClear();
  select.mockClear();
  lean.mockClear();
  connectDBMock.mockClear();
});

describe('getNotifiers — DB read plumbing', () => {
  it('connects and queries the singleton config for the right fields', async () => {
    setDoc({ notifiers: [] });
    await getNotifiers();
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ key: 'singleton' });
    expect(select).toHaveBeenCalledWith('notifiers ntfyUrl ntfyEnabled');
  });

  it('returns [] when no config document exists', async () => {
    setDoc(null);
    expect(await getNotifiers()).toEqual([]);
  });
});

describe('getNotifiers — coercion of stored channels', () => {
  it('coerces a full valid channel verbatim', async () => {
    setDoc({
      notifiers: [
        { id: 'd1', type: 'discord', enabled: true, label: 'My Discord', url: 'https://discord/x' },
      ],
    });
    const [c] = await getNotifiers();
    expect(c).toEqual({
      id: 'd1',
      type: 'discord',
      enabled: true,
      label: 'My Discord',
      url: 'https://discord/x',
      token: '',
      target: '',
    });
  });

  it('preserves order and coerces every valid entry', async () => {
    setDoc({
      notifiers: [
        { id: 'a', type: 'slack', url: 'u1' },
        { id: 'b', type: 'telegram', token: 't', target: 'g' },
      ],
    });
    const out = await getNotifiers();
    expect(out.map((c) => c.type)).toEqual(['slack', 'telegram']);
    expect(out[1]).toMatchObject({ id: 'b', token: 't', target: 'g' });
  });

  it('defaults enabled to true when the field is absent, false only when exactly false', async () => {
    setDoc({
      notifiers: [
        { type: 'webhook', url: 'u' }, // absent → enabled
        { type: 'webhook', url: 'u', enabled: false }, // off
        { type: 'webhook', url: 'u', enabled: 0 }, // 0 !== false → still enabled
      ],
    });
    const out = await getNotifiers();
    expect(out.map((c) => c.enabled)).toEqual([true, false, true]);
  });

  it('fills missing label/url/token/target with empty strings', async () => {
    setDoc({ notifiers: [{ id: 'x', type: 'ntfy' }] });
    const [c] = await getNotifiers();
    expect(c).toMatchObject({ label: '', url: '', token: '', target: '' });
  });

  it('drops entries with an unknown type', async () => {
    setDoc({ notifiers: [{ type: 'sms', url: 'u' }, { type: 'discord', url: 'u' }] });
    const out = await getNotifiers();
    expect(out.map((c) => c.type)).toEqual(['discord']);
  });

  it('drops non-object / null entries without throwing', async () => {
    setDoc({ notifiers: [null, 'nope', 42, { type: 'slack', url: 'u' }] });
    const out = await getNotifiers();
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('slack');
  });

  it('falls back id to the RAW array index (junk entries still advance the counter)', async () => {
    // First entry is junk (dropped); the valid second entry has no id → n1, not n0.
    setDoc({ notifiers: [{ type: 'bogus' }, { type: 'discord', url: 'u' }] });
    const [c] = await getNotifiers();
    expect(c.id).toBe('n1');
  });

  it('treats a non-array notifiers field as empty', async () => {
    setDoc({ notifiers: { type: 'discord' } });
    expect(await getNotifiers()).toEqual([]);
  });
});

describe('getNotifiers — legacy ntfy migration', () => {
  it('migrates legacy ntfyUrl into a single enabled ntfy channel when the array is empty', async () => {
    setDoc({ notifiers: [], ntfyUrl: 'https://ntfy.sh/mytopic', ntfyEnabled: true });
    const out = await getNotifiers();
    expect(out).toEqual([
      { id: 'ntfy-legacy', type: 'ntfy', enabled: true, url: 'https://ntfy.sh/mytopic', label: 'ntfy' },
    ]);
  });

  it('carries ntfyEnabled falsy through as a disabled legacy channel', async () => {
    setDoc({ notifiers: [], ntfyUrl: 'https://ntfy.sh/mytopic', ntfyEnabled: false });
    const [c] = await getNotifiers();
    expect(c).toMatchObject({ id: 'ntfy-legacy', enabled: false });
  });

  it('treats a missing ntfyEnabled as disabled', async () => {
    setDoc({ notifiers: [], ntfyUrl: 'https://ntfy.sh/mytopic' });
    const [c] = await getNotifiers();
    expect(c.enabled).toBe(false);
  });

  it('does NOT migrate when the array already has channels', async () => {
    setDoc({
      notifiers: [{ type: 'discord', url: 'u' }],
      ntfyUrl: 'https://ntfy.sh/mytopic',
      ntfyEnabled: true,
    });
    const out = await getNotifiers();
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('discord');
    expect(out.some((c) => c.id === 'ntfy-legacy')).toBe(false);
  });

  it('does NOT migrate when the array is empty but there is no legacy ntfyUrl', async () => {
    setDoc({ notifiers: [], ntfyEnabled: true });
    expect(await getNotifiers()).toEqual([]);
  });

  it('applies migration when all stored channels coerce away to nothing', async () => {
    // notifiers has entries but all are junk → coerced to [] → legacy fallback kicks in.
    setDoc({ notifiers: [{ type: 'bogus' }], ntfyUrl: 'https://ntfy.sh/t', ntfyEnabled: true });
    const out = await getNotifiers();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ntfy-legacy');
  });
});
