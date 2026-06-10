'use server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(''),
  tags: z.string().default(''),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  status: z.enum(['todo', 'in-progress', 'done', 'blocked']).default('todo'),
  description: z.string().default(''),
});

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}

export async function createTask(formData: FormData): Promise<string> {
  const raw = Object.fromEntries(formData);
  const parsed = CreateTaskSchema.parse(raw);
  await connectDB();
  const task = await Task.create({
    title: parsed.title,
    content: parsed.content,
    tags: parseTags(parsed.tags),
    priority: parsed.priority,
    status: parsed.status,
    description: parsed.description,
    completedAt: parsed.status === 'done' ? new Date() : null,
  });
  revalidatePath('/tasks');
  return String(task._id);
}

export async function updateTaskStatus(id: string, status: string) {
  await connectDB();
  const update: Record<string, unknown> = { status };
  if (status === 'done') update.completedAt = new Date();
  else update.completedAt = null;
  await Task.findByIdAndUpdate(id, update);
  revalidatePath('/tasks');
}

export async function deleteTask(id: string) {
  await connectDB();
  // Soft delete → Trash (Settings → Storage & data). Purge happens from there.
  await Task.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/tasks');
}

const UpdateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  content: z.string().default(''),
  tags: z.string().default(''),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  status: z.enum(['todo', 'in-progress', 'done', 'blocked']).default('todo'),
});

export async function updateTaskDetails(id: string, formData: FormData) {
  const parsed = UpdateTaskSchema.parse(Object.fromEntries(formData));
  await connectDB();
  const update: Record<string, unknown> = {
    title: parsed.title,
    description: parsed.description,
    content: parsed.content,
    tags: parseTags(parsed.tags),
    priority: parsed.priority,
    status: parsed.status,
  };
  if (parsed.status === 'done') update.completedAt = new Date();
  await Task.findByIdAndUpdate(id, update);
  revalidatePath('/tasks');
}

export async function addStep(taskId: string, text: string) {
  if (!text.trim()) return;
  await connectDB();
  await Task.findByIdAndUpdate(taskId, { $push: { steps: { text: text.trim(), done: false } } });
  revalidatePath('/tasks');
}

export async function toggleStep(taskId: string, stepId: string, done: boolean) {
  await connectDB();
  await Task.updateOne({ _id: taskId, 'steps._id': stepId }, { $set: { 'steps.$.done': done } });
  revalidatePath('/tasks');
}

export async function deleteStep(taskId: string, stepId: string) {
  await connectDB();
  await Task.findByIdAndUpdate(taskId, { $pull: { steps: { _id: stepId } } });
  revalidatePath('/tasks');
}
