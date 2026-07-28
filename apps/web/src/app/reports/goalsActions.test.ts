import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/reports/goalsActions.ts (P12) — CRUD + per-contribution add/remove for savings /
// financial goals, never directly unit-tested before. `current` is always derived (Σ
// contributions) elsewhere, never stored here. Mirrors the DB-mock pattern from
// bills/actions.test.ts: mock only the DB seam (connectDB/Goal) and next/cache's
// revalidatePath. `safeDateOrNull` (lib/dates.ts) runs un-mocked — it is pure,
// deterministic, and already has its own dedicated test file (lib/dates.test.ts), so
// exercising the real implementation here pins the actual end-to-end wiring instead of a
// hand-rolled stand-in.
//
// Behaviour pinned:
//  - createGoal/updateGoal: Zod `GoalFormSchema` applies its defaults (targetAmount 0,
//    category/notes/targetDate ''), coerces targetAmount to a number, rejects a missing/
//    empty title, and runs targetDate through safeDateOrNull (blank/unparseable → null,
//    never throws).
//  - createGoal always forces contributions:[] and archived:false regardless of form input
//    (the schema doesn't even accept those fields).
//  - deleteGoal: SOFT delete ($set deletedAt via updateOne), not an actual removal.
//  - addGoalContribution: rejects non-positive/non-finite amounts before touching the DB;
//    a valid amount is rounded to 2 decimals, note is capped at 200 chars, and date falls
//    back to "now" when dateStr is blank/unparseable.
//  - removeGoalContribution: $pull by contribution _id.
//  - every mutating action calls assertCanWrite() and revalidates both '/reports' and '/'.
const {
  connectDBMock,
  assertCanWriteMock,
  goalCreate,
  goalFindByIdAndUpdate,
  goalUpdateOne,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  assertCanWriteMock: vi.fn(async () => undefined),
  goalCreate: vi.fn(async (_doc: Record<string, any>) => ({})),
  goalFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  goalUpdateOne: vi.fn(async (_filter: Record<string, any>, _update: Record<string, any>) => ({})),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: assertCanWriteMock }));
vi.mock('@/models/Goal', () => ({
  Goal: { create: goalCreate, findByIdAndUpdate: goalFindByIdAndUpdate, updateOne: goalUpdateOne },
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import {
  createGoal,
  updateGoal,
  setGoalArchived,
  deleteGoal,
  addGoalContribution,
  removeGoalContribution,
} from './goalsActions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// safeDateOrNull builds EU-style dates at LOCAL midnight (no trailing "Z"); comparing via
// toISOString() would shift by a day whenever the runner's TZ offset isn't UTC+0. Compare
// local Y/M/D components instead, which is what the app actually cares about.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  assertCanWriteMock.mockImplementation(async () => undefined);
  goalCreate.mockImplementation(async () => ({}));
  goalFindByIdAndUpdate.mockImplementation(async () => ({}));
  goalUpdateOne.mockImplementation(async () => ({}));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('createGoal', () => {
  it('a minimal form (title only) applies every schema default, plus forced contributions:[]/archived:false', async () => {
    const res = await createGoal(formData({ title: 'Emergency fund' }));
    expect(res).toEqual({ ok: true });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(goalCreate).toHaveBeenCalledTimes(1);
    const doc = goalCreate.mock.calls[0][0];
    expect(doc.title).toBe('Emergency fund');
    expect(doc.targetAmount).toBe(0);
    expect(doc.category).toBe('');
    expect(doc.notes).toBe('');
    expect(doc.targetDate).toBeNull();
    expect(doc.contributions).toEqual([]);
    expect(doc.archived).toBe(false);
  });

  it('targetAmount is coerced from a form string to a number', async () => {
    await createGoal(formData({ title: 'Sailing trip', targetAmount: '2500.75' }));
    expect(goalCreate.mock.calls[0][0].targetAmount).toBe(2500.75);
  });

  it('a valid targetDate is parsed EU day-first into a real Date', async () => {
    await createGoal(formData({ title: 'X', targetDate: '15/09/2027' }));
    const doc = goalCreate.mock.calls[0][0];
    expect(localYmd(doc.targetDate as Date)).toBe('2027-09-15');
  });

  it('a missing title key is rejected before touching the DB (zod "Required", the key is absent)', async () => {
    const res = await createGoal(formData({ targetAmount: '100' }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Required');
    expect(goalCreate).not.toHaveBeenCalled();
  });

  it('an empty-string title is rejected with the custom min-length message', async () => {
    const res = await createGoal(formData({ title: '' }));
    expect(res).toEqual({ ok: false, error: 'Title required' });
    expect(goalCreate).not.toHaveBeenCalled();
  });

  it('an unparseable targetDate string is stored as null, not rejected (targetDate is optional)', async () => {
    const res = await createGoal(formData({ title: 'X', targetDate: 'not-a-date' }));
    expect(res).toEqual({ ok: true });
    expect(goalCreate.mock.calls[0][0].targetDate).toBeNull();
  });

  it('revalidates /reports and / after a successful create, not on a validation failure', async () => {
    await createGoal(formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
    revalidatePathMock.mockClear();
    await createGoal(formData({}));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('updateGoal', () => {
  it('parses the form and forwards it (with resolved targetDate) to findByIdAndUpdate', async () => {
    const res = await updateGoal('goal1', formData({ title: 'Emergency fund', targetAmount: '3000', targetDate: '01/01/2028', category: 'safety' }));
    expect(res).toEqual({ ok: true });
    expect(goalFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = goalFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('goal1');
    expect(update.title).toBe('Emergency fund');
    expect(update.targetAmount).toBe(3000);
    expect(update.category).toBe('safety');
    expect(localYmd(update.targetDate)).toBe('2028-01-01');
  });

  it('an invalid form returns an error, findByIdAndUpdate never runs', async () => {
    const res = await updateGoal('goal1', formData({ title: '' }));
    expect(res.ok).toBe(false);
    expect(goalFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /reports and / after a successful update', async () => {
    await updateGoal('goal1', formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

describe('setGoalArchived', () => {
  it('sets archived:true and revalidates both paths', async () => {
    const res = await setGoalArchived('goal1', true);
    expect(res).toEqual({ ok: true });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(goalFindByIdAndUpdate).toHaveBeenCalledWith('goal1', { archived: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });

  it('sets archived:false', async () => {
    await setGoalArchived('goal1', false);
    expect(goalFindByIdAndUpdate).toHaveBeenCalledWith('goal1', { archived: false });
  });
});

describe('deleteGoal', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    const res = await deleteGoal('goal1');
    expect(res).toEqual({ ok: true });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(goalUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = goalUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'goal1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

describe('addGoalContribution', () => {
  it('a positive amount is rounded to 2 decimals and pushed via $push', async () => {
    const res = await addGoalContribution('goal1', 12.345, 'birthday money');
    expect(res).toEqual({ ok: true });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(goalFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = goalFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('goal1');
    expect(update.$push.contributions.amount).toBe(12.35);
    expect(update.$push.contributions.note).toBe('birthday money');
  });

  it('defaults note to empty string and date to "now" when omitted', async () => {
    const before = Date.now();
    await addGoalContribution('goal1', 50);
    const push = goalFindByIdAndUpdate.mock.calls[0][1].$push.contributions;
    expect(push.note).toBe('');
    expect(push.date).toBeInstanceOf(Date);
    expect((push.date as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('a note longer than 200 chars is truncated', async () => {
    const longNote = 'x'.repeat(250);
    await addGoalContribution('goal1', 10, longNote);
    const push = goalFindByIdAndUpdate.mock.calls[0][1].$push.contributions;
    expect(push.note).toHaveLength(200);
  });

  it('an explicit dateStr is parsed EU day-first via safeDateOrNull', async () => {
    await addGoalContribution('goal1', 10, '', '05/06/2026');
    const push = goalFindByIdAndUpdate.mock.calls[0][1].$push.contributions;
    expect(localYmd(push.date)).toBe('2026-06-05');
  });

  it('a blank/unparseable dateStr falls back to "now" instead of storing null', async () => {
    const before = Date.now();
    await addGoalContribution('goal1', 10, '', 'garbage');
    const push = goalFindByIdAndUpdate.mock.calls[0][1].$push.contributions;
    expect((push.date as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('a zero amount is rejected before touching the DB', async () => {
    const res = await addGoalContribution('goal1', 0);
    expect(res).toEqual({ ok: false, error: 'Enter a positive amount' });
    expect(goalFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('a negative amount is rejected before touching the DB', async () => {
    const res = await addGoalContribution('goal1', -5);
    expect(res).toEqual({ ok: false, error: 'Enter a positive amount' });
    expect(goalFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('a non-finite amount (NaN) is rejected before touching the DB', async () => {
    const res = await addGoalContribution('goal1', NaN);
    expect(res).toEqual({ ok: false, error: 'Enter a positive amount' });
    expect(goalFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /reports and / after a successful push', async () => {
    await addGoalContribution('goal1', 10);
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

describe('removeGoalContribution', () => {
  it('pulls the contribution by its _id', async () => {
    const res = await removeGoalContribution('goal1', 'contrib1');
    expect(res).toEqual({ ok: true });
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
    expect(goalFindByIdAndUpdate).toHaveBeenCalledWith('goal1', { $pull: { contributions: { _id: 'contrib1' } } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});
