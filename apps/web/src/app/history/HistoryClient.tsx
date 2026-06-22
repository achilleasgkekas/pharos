'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Trash2, Check, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { deleteConversation, clearConversations, type ConversationRow } from './actions';

function renderRich(text: string) {
  return text.split('\n').map((line, li, arr) => (
    <span key={li}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
        /^\*\*[^*]+\*\*$/.test(p) ? <strong key={pi}>{p.slice(2, -2)}</strong> : p
      )}
      {li < arr.length - 1 && <br />}
    </span>
  ));
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export function HistoryClient({ conversations }: { conversations: ConversationRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, search]);

  async function del(id: string) {
    const ok = await confirm({ title: 'Delete this conversation?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    start(async () => {
      await deleteConversation(id);
      if (openId === id) setOpenId(null);
      router.refresh();
    });
  }

  async function clearAll() {
    const ok = await confirm({ title: 'Clear all AI history?', message: `Permanently delete all ${conversations.length} conversations.`, confirmLabel: 'Clear all', danger: true });
    if (!ok) return;
    start(async () => {
      await clearConversations();
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <main className="max-w-[900px] mx-auto px-4 py-6 pb-24">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2.5" style={{ fontFamily: 'var(--font-display)' }}>
          <MessageSquare size={24} className="text-[color:var(--color-cyan)]" />
          AI history
          <span className="text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {conversations.length}
          </span>
        </h1>
        {conversations.length > 0 && (
          <Button variant="danger" size="sm" onClick={clearAll} disabled={pending}>
            <Trash2 size={14} /> Clear all
          </Button>
        )}
      </div>
      <p className="text-xs text-[color:var(--color-text-faint)] mb-5">Every chat with the AI command bar is saved here.</p>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] py-20 text-center">
          <Sparkles size={32} className="mx-auto text-[color:var(--color-cyan)] opacity-40" />
          <p className="mt-3 text-sm text-[color:var(--color-text-dim)]">No conversations yet.</p>
          <p className="text-xs text-[color:var(--color-text-faint)]">Ask the AI bar anything (the ✨ toggle up top) and it lands here.</p>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg pl-8 pr-3 py-1.5 text-sm outline-none focus:border-[color:var(--color-accent)]"
            />
          </div>

          <div className="space-y-2">
            {visible.map((c) => {
              const isOpen = openId === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button onClick={() => setOpenId(isOpen ? null : c.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                      <ChevronDown size={15} className={cn('shrink-0 text-[color:var(--color-text-faint)] transition-transform', isOpen && 'rotate-180')} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        <div className="text-[11px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                          {c.turns} prompt{c.turns === 1 ? '' : 's'} · {ago(c.updatedAt)}{c.preview ? ` · ${c.preview}` : ''}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => del(c.id)} disabled={pending} title="Delete" className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-[color:var(--color-border)] p-3 space-y-2.5 bg-[color:var(--color-bg)]/30">
                      {c.messages.map((m, i) => (
                        <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                              m.role === 'user'
                                ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-text)]'
                                : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]'
                            )}
                          >
                            {m.role === 'assistant' ? renderRich(m.content) : m.content}
                            {m.actions && m.actions.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {m.actions.map((a, j) => (
                                  <span key={j} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
                                    <Check size={11} /> {a.summary}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && <p className="text-center text-sm text-[color:var(--color-text-faint)] py-10">No matching conversations.</p>}
          </div>
        </>
      )}
    </main>
  );
}
