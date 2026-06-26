import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { iso } from '@/lib/apiList';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = ['todo', 'in-progress', 'done', 'blocked'];

/** PATCH /api/v1/tasks/:id  { title?, status?, priority?, tags?, content?, dueDate? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim();
    if (typeof b.status === 'string' && STATUS.includes(b.status)) {
      set.status = b.status;
      set.completedAt = b.status === 'done' ? new Date() : null;
    }
    if (typeof b.priority === 'string' && ['low', 'normal', 'high'].includes(b.priority)) set.priority = b.priority;
    if (Array.isArray(b.tags)) set.tags = b.tags.map(String);
    if (typeof b.content === 'string') set.content = b.content;
    if ('dueDate' in b) set.dueDate = b.dueDate ? new Date(String(b.dueDate)) : null;
    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    const doc = await Task.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    const t = doc as { _id: unknown; title: string; status?: string; priority?: string; tags?: string[]; dueDate?: Date | null; completedAt?: Date | null; updatedAt?: Date };
    return NextResponse.json({
      task: { id: String(t._id), title: t.title, status: t.status ?? 'todo', priority: t.priority ?? 'normal', tags: t.tags ?? [], dueDate: iso(t.dueDate), completedAt: iso(t.completedAt), updatedAt: iso(t.updatedAt) },
    });
  });
}

/** DELETE /api/v1/tasks/:id  → soft-delete (recoverable from Trash). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return apiError('bad id');
    await connectDB();
    const doc = await Task.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).lean();
    if (!doc) return apiError('not found', 404);
    return NextResponse.json({ ok: true, id });
  });
}
