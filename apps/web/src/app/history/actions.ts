'use server';
import { connectDB } from '@/lib/db';
import { Conversation } from '@/models/Conversation';
import { revalidatePath } from 'next/cache';
import { assertCanWrite } from '@/lib/auth';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';

/**
 * The saved AI conversations of the CALLER'S workspace.
 *
 * The other half of the command-bar surface: `aiCommandActions.runAiCommand` writes the transcript
 * and this file reads and deletes it. Both used the imported model, so in SaaS mode every
 * workspace's assistant history landed in the DEFAULT database — one shared transcript list, with
 * `clearConversations` wiping every customer's at once. Reader and writer agreed with each other,
 * which is why nothing looked wrong from the UI; they were consistently wrong together.
 *
 * Self-hosted resolves to the default tenant, so `scoped()` is exactly `Conversation` there.
 */
function scoped() {
  return withRequestTenant(() => currentModel(Conversation));
}

export type ConversationMsg = { role: 'user' | 'assistant'; content: string; actions?: { name: string; summary: string }[] };
export type ConversationRow = {
  id: string;
  title: string;
  turns: number;
  updatedAt: string;
  preview: string;
  messages: ConversationMsg[];
};

/** Newest-first list of saved AI command-bar conversations (capped). */
export async function getConversations(): Promise<ConversationRow[]> {
  await connectDB();
  const docs = await (await scoped()).find({ deletedAt: null }).sort({ updatedAt: -1 }).limit(200).lean();
  return docs.map((d) => {
    const messages: ConversationMsg[] = (d.messages || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content || '',
      actions: (m.actions || []).map((a) => ({ name: String(a.name), summary: String(a.summary) })),
    }));
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    return {
      id: String(d._id),
      title: d.title || 'Conversation',
      turns: d.turns || 0,
      updatedAt: (d as { updatedAt: Date }).updatedAt.toISOString(),
      preview: (lastAssistant?.content || '').replace(/\*\*/g, '').slice(0, 160),
      messages,
    };
  });
}

export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped()).updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  revalidatePath('/history');
  return { ok: true };
}

export async function clearConversations(): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped()).updateMany({}, { $set: { deletedAt: new Date() } });
  revalidatePath('/history');
  return { ok: true };
}
