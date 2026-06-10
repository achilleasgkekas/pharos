import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { TasksClient } from './TasksClient';
import type { SerializedTask } from '@/types';

export const dynamic = 'force-dynamic';

async function getTasks(): Promise<SerializedTask[]> {
  await connectDB();
  const tasks = await Task.find().sort({ num: 1, status: 1, createdAt: -1 }).lean();
  const serialized = JSON.parse(JSON.stringify(tasks)) as SerializedTask[];
  // Older tasks predate the steps/content fields — backfill defaults
  return serialized.map((t) => ({
    ...t,
    content: t.content ?? '',
    steps: t.steps ?? [],
    num: t.num ?? '',
    tags: t.tags ?? [],
  }));
}

export default async function TasksPage() {
  const tasks = await getTasks();
  return <TasksClient tasks={tasks} />;
}
