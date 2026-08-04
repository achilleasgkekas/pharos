import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { listParams, withSince, listEnvelope, iso } from '@/lib/apiList';
import { readBody, strField, enumField } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { Task as TaskModel } from '@/models/Task';
import { currentModel } from '@/lib/tenancy/connection';

const TASK_STATUSES = ['todo', 'in-progress', 'done', 'blocked'] as const;
const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StepLean = { _id?: unknown; text?: string; done?: boolean };
type TaskLean = {
  _id: unknown; title: string; status?: string; priority?: string; tags?: string[];
  content?: string; steps?: StepLean[]; dueDate?: Date | null; completedAt?: Date | null; num?: string;
  updatedAt?: Date; deletedAt?: Date | null;
};

function trim(t: TaskLean) {
  return {
    id: String(t._id),
    title: t.title,
    status: t.status ?? 'todo',
    priority: t.priority ?? 'normal',
    tags: t.tags ?? [],
    content: t.content ?? '',
    steps: (t.steps ?? []).map((s) => ({ id: String(s._id), text: s.text ?? '', done: !!s.done })),
    dueDate: iso(t.dueDate),
    completedAt: iso(t.completedAt),
    updatedAt: iso(t.updatedAt),
    deleted: !!t.deletedAt,
  };
}

/** GET /api/v1/tasks?status=todo|in-progress|done|blocked&limit&offset&updatedSince */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Task = await currentModel(TaskModel);
    const p = listParams(req);
    const status = p.sp.get('status');
    const filter = withSince(status ? { status } : {}, p);
    const find = Task.find(filter).sort({ updatedAt: -1 }).skip(p.offset).limit(p.limit);
    const count = Task.countDocuments(filter);
    if (p.updatedSince) { find.setOptions({ withDeleted: true }); count.setOptions({ withDeleted: true }); }
    const [docs, total] = await Promise.all([find.lean() as Promise<TaskLean[]>, count]);
    return NextResponse.json(listEnvelope(docs.map(trim), total, p));
  });
}

/** POST /api/v1/tasks  { title, status?, priority?, tags?, content?, dueDate? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const title = strField(b, 'title', '', true);
    if (!title) return apiError('title required');
    const tags = Array.isArray(b.tags) ? b.tags.map(String) : typeof b.tags === 'string' ? b.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const status = enumField(b, 'status', TASK_STATUSES, 'todo');
    await connectDB();
    const Task = await currentModel(TaskModel);
    const doc = await Task.create({
      title,
      status,
      priority: enumField(b, 'priority', TASK_PRIORITIES, 'normal'),
      tags,
      content: strField(b, 'content', ''),
      dueDate: b.dueDate ? new Date(String(b.dueDate)) : null,
      completedAt: status === 'done' ? new Date() : null,
    });
    return NextResponse.json({ task: trim(doc.toObject() as TaskLean) }, { status: 201 });
  });
}
