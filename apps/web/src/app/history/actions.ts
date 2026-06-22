'use server';
import { connectDB } from '@/lib/db';
import { Conversation } from '@/models/Conversation';
import { revalidatePath } from 'next/cache';

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
  const docs = await Conversation.find({}).sort({ updatedAt: -1 }).limit(200).lean();
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
  await connectDB();
  await Conversation.deleteOne({ _id: id });
  revalidatePath('/history');
  return { ok: true };
}

export async function clearConversations(): Promise<{ ok: boolean }> {
  await connectDB();
  await Conversation.deleteMany({});
  revalidatePath('/history');
  return { ok: true };
}
