import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/tasks/actions.ts backs the /tasks kanban (create/update/delete tasks, plus per-step
// checklist CRUD). Never directly unit-tested before — mirrors the DB-mock pattern from
// statements/cards.test.ts and vouchers/giftcardActions.test.ts, mocking only the DB seam
// (connectDB/Task) plus next/cache's revalidatePath.
//
// Behaviour pinned:
//  - parseTags (not exported, exercised indirectly via createTask/updateTaskDetails): splits
//    on comma, trims each piece, strips a single leading "#", and drops empty entries.
//  - createTask: Zod `CreateTaskSchema` applies its defaults (content/tags/description empty,
//    priority "normal", status "todo"), rejects a missing/empty title, sets completedAt to a
//    Date only when the initial status is "done", and returns the new document's _id as a string.
//  - updateTaskStatus: ALWAYS writes completedAt — a Date when moving to "done", explicit null
//    for every other status (i.e. moving a done task back to todo clears completedAt).
//  - updateTaskDetails: only ever SETS completedAt (to a Date) when status is "done"; it does
//    NOT clear completedAt when status is something else. This is an intentional asymmetry vs
//    updateTaskStatus (pinned as-is, not "fixed" — a details edit that doesn't touch status
//    shouldn't wipe a previously-set completion date).
//  - deleteTask: SOFT delete ($set deletedAt via updateOne), not an actual document removal.
//  - addStep: a blank/whitespace-only step text is a silent no-op — returns before connectDB
//    ever runs. A real step is trimmed before being pushed, always starting as done:false.
//  - toggleStep/deleteStep: target a single subdocument by its _id (positional $ set / $pull).

const {
  connectDBMock,
  taskCreate,
  taskFindByIdAndUpdate,
  taskUpdateOne,
  revalidatePathMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  // Typed args so `.mock.calls[0][n]` indexes cleanly under `tsc --noEmit`.
  taskCreate: vi.fn(async (_doc: Record<string, unknown>) => ({ _id: 'task1' })),
  taskFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  taskUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Task', () => ({
  Task: {
    create: taskCreate,
    findByIdAndUpdate: taskFindByIdAndUpdate,
    updateOne: taskUpdateOne,
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { createTask, updateTaskStatus, deleteTask, updateTaskDetails, addStep, toggleStep, deleteStep } from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  taskCreate.mockImplementation(async () => ({ _id: 'task1' }));
  taskFindByIdAndUpdate.mockImplementation(async () => ({}));
  taskUpdateOne.mockImplementation(async () => ({}));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('createTask', () => {
  it('a minimal form (title only) applies every schema default and completedAt:null', async () => {
    await createTask(formData({ title: 'Buy milk' }));
    expect(taskCreate).toHaveBeenCalledWith({
      title: 'Buy milk',
      content: '',
      tags: [],
      priority: 'normal',
      status: 'todo',
      description: '',
      completedAt: null,
    });
  });

  it('tags are split on comma, trimmed, and a leading "#" is stripped', async () => {
    await createTask(formData({ title: 'X', tags: ' #urgent, home , #shopping' }));
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({ tags: ['urgent', 'home', 'shopping'] }));
  });

  it('empty tag entries (e.g. trailing comma) are dropped', async () => {
    await createTask(formData({ title: 'X', tags: 'a,,  ,b' }));
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({ tags: ['a', 'b'] }));
  });

  it('an initial status of "done" sets completedAt to a Date', async () => {
    await createTask(formData({ title: 'X', status: 'done' }));
    const call = taskCreate.mock.calls[0][0];
    expect(call.completedAt).toBeInstanceOf(Date);
  });

  it('an initial status other than "done" keeps completedAt null', async () => {
    await createTask(formData({ title: 'X', status: 'in-progress' }));
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }));
  });

  it('a missing title throws a validation error, create() never runs', async () => {
    await expect(createTask(formData({}))).rejects.toThrow();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('an empty-string title throws a validation error (min length), create() never runs', async () => {
    await expect(createTask(formData({ title: '' }))).rejects.toThrow();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('an invalid priority/status enum value throws before touching the DB', async () => {
    await expect(createTask(formData({ title: 'X', priority: 'urgent' }))).rejects.toThrow();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('returns the new document id as a string', async () => {
    taskCreate.mockResolvedValueOnce({ _id: { toString: () => 'abc123' } } as any);
    const id = await createTask(formData({ title: 'X' }));
    expect(id).toBe('abc123');
  });

  it('revalidates /tasks after a successful create', async () => {
    await createTask(formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});

describe('updateTaskStatus', () => {
  it('moving to "done" sets completedAt to a Date', async () => {
    await updateTaskStatus('t1', 'done');
    expect(taskFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = taskFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('t1');
    expect(update.status).toBe('done');
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it('moving to any non-"done" status explicitly clears completedAt to null', async () => {
    await updateTaskStatus('t1', 'todo');
    const update = taskFindByIdAndUpdate.mock.calls[0][1];
    expect(update.completedAt).toBeNull();
  });

  it('revalidates /tasks after a successful status change', async () => {
    await updateTaskStatus('t1', 'blocked');
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});

describe('deleteTask', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    await deleteTask('t1');
    expect(taskUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = taskUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 't1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});

describe('updateTaskDetails', () => {
  it('parses the form and forwards it (with split tags) to findByIdAndUpdate', async () => {
    await updateTaskDetails('t1', formData({ title: 'Renamed', tags: '#a, b', priority: 'high', status: 'in-progress' }));
    expect(taskFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = taskFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('t1');
    expect(update.title).toBe('Renamed');
    expect(update.tags).toEqual(['a', 'b']);
    expect(update.priority).toBe('high');
  });

  it('status "done" sets completedAt to a Date', async () => {
    await updateTaskDetails('t1', formData({ title: 'X', status: 'done' }));
    const update = taskFindByIdAndUpdate.mock.calls[0][1];
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it('a non-"done" status does NOT touch completedAt at all (asymmetric vs updateTaskStatus)', async () => {
    await updateTaskDetails('t1', formData({ title: 'X', status: 'blocked' }));
    const update = taskFindByIdAndUpdate.mock.calls[0][1];
    expect('completedAt' in update).toBe(false);
  });

  it('an invalid form throws before touching the DB', async () => {
    await expect(updateTaskDetails('t1', formData({ title: '' }))).rejects.toThrow();
    expect(taskFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /tasks after a successful update', async () => {
    await updateTaskDetails('t1', formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});

describe('addStep', () => {
  it('a blank text is a silent no-op: connectDB and the DB call never run', async () => {
    await addStep('t1', '   ');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(taskFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('a real step text is trimmed and pushed with done:false', async () => {
    await addStep('t1', '  buy eggs  ');
    expect(taskFindByIdAndUpdate).toHaveBeenCalledWith('t1', { $push: { steps: { text: 'buy eggs', done: false } } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});

describe('toggleStep', () => {
  it('sets the matched step subdocument\'s done flag via the positional operator', async () => {
    await toggleStep('t1', 's1', true);
    expect(taskUpdateOne).toHaveBeenCalledWith({ _id: 't1', 'steps._id': 's1' }, { $set: { 'steps.$.done': true } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });

  it('also supports flipping a step back to not-done', async () => {
    await toggleStep('t1', 's1', false);
    expect(taskUpdateOne).toHaveBeenCalledWith({ _id: 't1', 'steps._id': 's1' }, { $set: { 'steps.$.done': false } });
  });
});

describe('deleteStep', () => {
  it('pulls a single step by its subdocument id', async () => {
    await deleteStep('t1', 's1');
    expect(taskFindByIdAndUpdate).toHaveBeenCalledWith('t1', { $pull: { steps: { _id: 's1' } } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });
});
