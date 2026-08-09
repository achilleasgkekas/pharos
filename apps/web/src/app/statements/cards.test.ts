import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/statements/cards.ts holds the payment-card CRUD server actions (Settings → Stores &
// cards) plus `scanCard`, the AI OCR-a-photo helper. None of it has been directly unit-tested
// before — this repo's existing suite covers 'use server' actions.ts files only indirectly,
// through API route tests that mock the whole action module. This file exercises the actions
// themselves, mocking only the DB + AI seams (connectDB/Card/parseCardImage/isFeatureEnabled)
// plus next/cache's revalidatePath (see lib/revalidate.test.ts for the same mock shape).
//
// Behaviour pinned:
//  - scanCard: feature-flag gate FIRST (never touches the file if AI cards are off), then a
//    missing/empty-file guard, then a try/catch around parseCardImage that maps a
//    connection-refused-style error message to a friendly "Ollama is not reachable" and any
//    other thrown error to `AI failed: <message, truncated to 100 chars>`.
//  - createCard/updateCard/deleteCard/toggleCardActive: Zod `CardFormSchema` parses
//    FormData-shaped input with its defaults (kind/type/color/creditLimit/notes/last4/bank),
//    coerces creditLimit to a number, and rejects an empty name — validation runs BEFORE any
//    DB call. createCard always sets active:true regardless of what's in the form.

const { connectDBMock, cardFindByIdAndUpdate, cardFindByIdAndDelete, cardCreate, parseCardImageMock, isFeatureEnabledMock, revalidatePathMock } =
  vi.hoisted(() => ({
    connectDBMock: vi.fn(async () => {}),
    cardFindByIdAndUpdate: vi.fn(async () => ({})),
    cardFindByIdAndDelete: vi.fn(async () => ({})),
    cardCreate: vi.fn(async () => ({})),
    parseCardImageMock: vi.fn(),
    isFeatureEnabledMock: vi.fn(async () => true),
    revalidatePathMock: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Card', () => ({
  Card: {
    findByIdAndUpdate: cardFindByIdAndUpdate,
    findByIdAndDelete: cardFindByIdAndDelete,
    create: cardCreate,
  },
}));
// Flat tenancy seam: this file pins the ACTIONS' behaviour, so both helpers are pass-throughs and
// `currentModel` hands back the same mocked Card above. The tenant ROUTING itself is pinned
// tenant-aware, in its own file (cards.tenant.test.ts), exactly as actions.crud vs actions.tenant.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/lib/ollama', () => ({ parseCardImage: parseCardImageMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { scanCard, createCard, updateCard, deleteCard, toggleCardActive } from './cards';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function fileFormData(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set('file', file);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  cardFindByIdAndUpdate.mockImplementation(async () => ({}));
  cardFindByIdAndDelete.mockImplementation(async () => ({}));
  cardCreate.mockImplementation(async () => ({}));
  isFeatureEnabledMock.mockImplementation(async () => true);
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('scanCard', () => {
  it('the AI-cards feature flag off → error, parseCardImage never runs', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const file = new File([new Uint8Array([1, 2, 3])], 'card.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res).toEqual({ ok: false, error: 'Card scanning (AI) is turned off.' });
    expect(parseCardImageMock).not.toHaveBeenCalled();
  });

  it('no file in the form → "No image", parseCardImage never runs', async () => {
    const res = await scanCard(fileFormData(null));
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(parseCardImageMock).not.toHaveBeenCalled();
  });

  it('an empty (0-byte) file → "No image", parseCardImage never runs', async () => {
    const file = new File([], 'empty.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(parseCardImageMock).not.toHaveBeenCalled();
  });

  it('a non-File value under "file" → "No image"', async () => {
    const fd = new FormData();
    fd.set('file', 'not-a-file');
    const res = await scanCard(fd);
    expect(res).toEqual({ ok: false, error: 'No image' });
    expect(parseCardImageMock).not.toHaveBeenCalled();
  });

  it('a successful parse → { ok:true, data }, image forwarded as base64', async () => {
    const parsed = { bank: 'Alpha Bank', last4: '7791', type: 'mastercard' as const };
    parseCardImageMock.mockResolvedValue({ parsed });
    const bytes = new Uint8Array([10, 20, 30]);
    const file = new File([bytes], 'card.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res).toEqual({ ok: true, data: parsed });
    expect(parseCardImageMock).toHaveBeenCalledTimes(1);
    expect(parseCardImageMock.mock.calls[0][0]).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('a connection-refused-style error is mapped to "Ollama is not reachable"', async () => {
    parseCardImageMock.mockRejectedValue(new Error('fetch failed: ECONNREFUSED 127.0.0.1:11434'));
    const file = new File([new Uint8Array([1])], 'card.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res).toEqual({ ok: false, error: 'Ollama is not reachable' });
  });

  it('an unrelated thrown error is prefixed and truncated to 100 chars', async () => {
    const longMsg = 'x'.repeat(200);
    parseCardImageMock.mockRejectedValue(new Error(longMsg));
    const file = new File([new Uint8Array([1])], 'card.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(`AI failed: ${longMsg.slice(0, 100)}`);
      expect(res.error.length).toBe('AI failed: '.length + 100);
    }
  });

  it('a thrown non-Error value falls back to String(err)', async () => {
    parseCardImageMock.mockRejectedValue('plain string failure');
    const file = new File([new Uint8Array([1])], 'card.jpg', { type: 'image/jpeg' });
    const res = await scanCard(fileFormData(file));
    expect(res).toEqual({ ok: false, error: 'AI failed: plain string failure' });
  });
});

describe('createCard', () => {
  it('a minimal form (name only) applies every schema default', async () => {
    await createCard(formData({ name: 'Mastercard 7791' }));
    expect(cardCreate).toHaveBeenCalledWith({
      name: 'Mastercard 7791',
      last4: '',
      bank: '',
      kind: 'credit',
      type: 'other',
      color: '#00d4ff',
      creditLimit: 0,
      notes: '',
      active: true,
    });
  });

  it('always sets active:true even if the form tried to set it otherwise', async () => {
    const fd = formData({ name: 'Visa 1234' });
    fd.set('active', 'false');
    await createCard(fd);
    expect(cardCreate).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('creditLimit is coerced from a form string to a number', async () => {
    await createCard(formData({ name: 'Amex 9999', creditLimit: '2500' }));
    expect(cardCreate).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 2500 }));
  });

  it('a missing name throws a validation error, create() never runs', async () => {
    await expect(createCard(formData({}))).rejects.toThrow();
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('an empty-string name throws a validation error (min length), create() never runs', async () => {
    await expect(createCard(formData({ name: '' }))).rejects.toThrow();
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('an invalid enum value for kind/type throws, create() never runs', async () => {
    await expect(createCard(formData({ name: 'X', kind: 'prepaid' }))).rejects.toThrow();
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('revalidates /statements after a successful create', async () => {
    await createCard(formData({ name: 'Mastercard 7791' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});

describe('updateCard', () => {
  it('parses the form and forwards it verbatim to findByIdAndUpdate', async () => {
    await updateCard('card1', formData({ name: 'Mastercard 7791', bank: 'Ethniki', last4: '7791' }));
    expect(cardFindByIdAndUpdate).toHaveBeenCalledWith(
      'card1',
      expect.objectContaining({ name: 'Mastercard 7791', bank: 'Ethniki', last4: '7791' })
    );
  });

  it('an invalid form throws before touching the DB', async () => {
    await expect(updateCard('card1', formData({ name: '' }))).rejects.toThrow();
    expect(cardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /statements after a successful update', async () => {
    await updateCard('card1', formData({ name: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});

describe('deleteCard', () => {
  it('forwards the id to findByIdAndDelete and revalidates /statements', async () => {
    await deleteCard('card1');
    expect(cardFindByIdAndDelete).toHaveBeenCalledWith('card1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });
});

describe('toggleCardActive', () => {
  it('sets active:true', async () => {
    await toggleCardActive('card1', true);
    expect(cardFindByIdAndUpdate).toHaveBeenCalledWith('card1', { active: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/statements');
  });

  it('sets active:false', async () => {
    await toggleCardActive('card1', false);
    expect(cardFindByIdAndUpdate).toHaveBeenCalledWith('card1', { active: false });
  });
});
