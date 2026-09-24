import { describe, it, expect, vi, beforeEach } from 'vitest';

// P66 — `update_record` / `delete_record` inside aiTools' execute(). The sibling aiTools.test.ts
// deliberately covers only the pure registry ("execute() needs a live DB"), so this behaviour had
// no coverage at all, which is uncomfortable for the one code path where a language model writes
// to the database. Mocking every module boundary (models, actions, revalidatePath) lets the real
// dispatcher run.
//
// What matters here is not the happy path but the refusals:
//   - `statement` must be unreachable: it is the ONLY searchable model without the soft-delete
//     plugin, so a delete could not be undone and delete_record's "recoverable from Trash for 30
//     days" would be a lie to the user,
//   - `receipt` likewise (a scanned document with a file + line items + installment links),
//   - a goal's `contributions` are a money ledger whose balance is derived from it, so an
//     assistant must not rewrite it wholesale,
//   - a blocked field must be REFUSED OUT LOUD, never silently dropped — an assistant told
//     "done" would report a balance change to the user that never happened,
//   - an id that matches nothing must fail, not report success (the previous implementation
//     returned "Updated the item." for a ghost id).

const { updateOnes, revalidated } = vi.hoisted(() => ({
  updateOnes: [] as { model: string; filter: unknown; update: Record<string, any> }[],
  revalidated: [] as string[],
}));

// Every model is the same tagged stub, so a write landing on the wrong collection is visible.
const { matchedState } = vi.hoisted(() => ({ matchedState: { matched: 1 } }));
function model(tag: string) {
  return {
    updateOne: async (filter: unknown, update: Record<string, any>) => {
      updateOnes.push({ model: tag, filter, update });
      return { matchedCount: matchedState.matched };
    },
  };
}

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
// Behaviour tests stay FLAT: the tenancy seam is a pass-through here, so the tagged stub above is
// what execute() writes to. Routing (which database each tool lands in) is pinned separately in
// aiTools.tenant.test.ts — same split as actions.crud.test.ts vs actions.tenant.test.ts.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('@/models/Item', () => ({ Item: model('Item') }));
vi.mock('@/models/Task', () => ({ Task: model('Task') }));
vi.mock('@/models/Subscription', () => ({ Subscription: model('Subscription') }));
vi.mock('@/models/Expense', () => ({ Expense: model('Expense') }));
vi.mock('@/models/Receipt', () => ({ Receipt: model('Receipt') }));
vi.mock('@/models/Statement', () => ({ Statement: model('Statement') }));
vi.mock('@/models/Voucher', () => ({ Voucher: model('Voucher') }));
vi.mock('@/models/Bill', () => ({ Bill: model('Bill') }));
vi.mock('@/models/Goal', () => ({ Goal: model('Goal') }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: model('ShoppingListItem') }));
vi.mock('./expenses/actions', () => ({ addExpense: async () => ({ ok: true }) }));
vi.mock('./items/actions', () => ({ importItemFromUrl: async () => ({}), logItemPrice: async () => ({}) }));
vi.mock('./search-actions', () => ({ searchAll: async () => [] }));
vi.mock('@/lib/ollama', () => ({ suggestSubscription: async () => ({}) }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: () => [] }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({}) }));
vi.mock('@/lib/money', () => ({ cur: () => '€', currencySymbol: () => '€' }));
vi.mock('@/lib/dates', () => ({ safeDate: (v: string) => v }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));

import { execute, EDITABLE_TYPES } from './aiTools';

const ID = '507f1f77bcf86cd799439011';

beforeEach(() => {
  updateOnes.length = 0;
  revalidated.length = 0;
  matchedState.matched = 1;
});

describe('the editable-type list', () => {
  it('covers the user-authored models and excludes receipts and statements', () => {
    expect([...EDITABLE_TYPES].sort()).toEqual(
      ['bill', 'expense', 'goal', 'item', 'shoppinglist', 'subscription', 'task', 'voucher'].sort()
    );
  });

  it('no longer knows gift or loyalty cards (both modules removed 2026-09-24)', async () => {
    for (const type of ['giftcard', 'loyaltycard']) {
      const r = await execute('update_record', { type, id: ID, fields: { title: 'x' } });
      expect(r.summary, type).toBe('update failed');
    }
    expect(updateOnes).toHaveLength(0);
  });
});

describe('update_record', () => {
  it('reaches the modules that used to be unreachable', async () => {
    for (const type of ['bill', 'goal', 'shoppinglist']) {
      const r = await execute('update_record', { type, id: ID, fields: { title: 'x' } });
      expect(r.summary, type).toBe(`updated ${type}`);
    }
    expect(updateOnes.map((u) => u.model)).toEqual(['Bill', 'Goal', 'ShoppingListItem']);
  });

  it('marks a bill paid, the sentence that used to fail outright', async () => {
    const r = await execute('update_record', { type: 'bill', id: ID, fields: { paidAt: '2026-08-03' } });

    expect(r.summary).toBe('updated bill');
    expect(updateOnes[0]).toMatchObject({ model: 'Bill', filter: { _id: ID }, update: { $set: { paidAt: '2026-08-03' } } });
  });

  it('refuses statements and receipts without writing anything', async () => {
    for (const type of ['statement', 'receipt']) {
      const r = await execute('update_record', { type, id: ID, fields: { total: 1 } });
      expect(r.summary, type).toBe('update failed');
    }
    expect(updateOnes).toHaveLength(0);
  });

  it('refuses a goal contribution ledger out loud instead of silently dropping it', async () => {
    const r = await execute('update_record', { type: 'goal', id: ID, fields: { contributions: [{ amount: 500 }] } });

    expect(r.summary).toBe('update failed');
    expect(r.content).toContain('contributions');
    expect(updateOnes).toHaveLength(0);
  });

  it('writes the legal fields but names what it ignored when an update mixes both', async () => {
    const r = await execute('update_record', { type: 'goal', id: ID, fields: { title: 'House', contributions: [] } });

    expect(r.summary).toBe('updated goal');
    expect(updateOnes[0].update).toEqual({ $set: { title: 'House' } });
    expect(r.content).toContain('ignored contributions');
  });

  it('cannot smuggle a blocked field through a dotted path', async () => {
    const r = await execute('update_record', { type: 'goal', id: ID, fields: { 'contributions.0.amount': 999 } });

    expect(r.summary).toBe('update failed');
    expect(updateOnes).toHaveLength(0);
  });

  it('never lets the assistant set _id or deletedAt', async () => {
    const r = await execute('update_record', { type: 'task', id: ID, fields: { _id: 'other', deletedAt: null } });

    expect(r.summary).toBe('update failed');
    expect(updateOnes).toHaveLength(0);
  });

  it('reports failure when the id matches nothing, rather than claiming success', async () => {
    matchedState.matched = 0;
    const r = await execute('update_record', { type: 'item', id: ID, fields: { title: 'x' } });

    expect(r.summary).toBe('update failed');
    expect(r.content).toContain('No item with that id');
  });

  it('rejects a malformed id before touching the database', async () => {
    const r = await execute('update_record', { type: 'item', id: 'not-an-id', fields: { title: 'x' } });

    expect(r.summary).toBe('update failed');
    expect(updateOnes).toHaveLength(0);
  });

  it('refreshes only the pages that type appears on', async () => {
    await execute('update_record', { type: 'bill', id: ID, fields: { title: 'x' } });

    expect(revalidated).toEqual(['/bills']);
  });
});

describe('delete_record', () => {
  it('soft-deletes, so the record is recoverable exactly as the tool promises', async () => {
    const r = await execute('delete_record', { type: 'voucher', id: ID });

    expect(r.summary).toBe('deleted voucher');
    expect(updateOnes[0].model).toBe('Voucher');
    expect(updateOnes[0].update.$set.deletedAt).toBeInstanceOf(Date);
    expect(r.content).toContain('Trash');
  });

  it('refuses to delete a statement, which has no soft-delete to fall back on', async () => {
    const r = await execute('delete_record', { type: 'statement', id: ID });

    expect(r.summary).toBe('delete failed');
    expect(updateOnes).toHaveLength(0);
  });

  it('reports failure when the id matches nothing', async () => {
    matchedState.matched = 0;
    const r = await execute('delete_record', { type: 'task', id: ID });

    expect(r.summary).toBe('delete failed');
    expect(r.content).toContain('already be gone');
  });
});
