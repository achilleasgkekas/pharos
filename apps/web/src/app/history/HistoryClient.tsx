'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Trash2, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { deleteConversation, clearConversations, type ConversationRow } from './actions';
import { useT } from '@/components/LocaleProvider';
import { relTime } from '@/lib/i18n/format';

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

export function HistoryClient({ conversations }: { conversations: ConversationRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const t = useT();
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
    const ok = await confirm({ title: t('history.confirmDelete'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    start(async () => {
      await deleteConversation(id);
      if (openId === id) setOpenId(null);
      router.refresh();
    });
  }

  async function clearAll() {
    const ok = await confirm({ title: t('history.confirmClear'), message: t('history.confirmClearBody'), confirmLabel: t('history.clearAll'), danger: true });
    if (!ok) return;
    start(async () => {
      await clearConversations();
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('nav.history')} count={conversations.length} subtitle={t('history.intro')}>
        {conversations.length > 0 && (
          <Button variant="danger" onClick={clearAll} disabled={pending}>
            <Trash2 size={14} /> {t('history.clearAll')}
          </Button>
        )}
      </PageHeader>

      {conversations.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title={t('history.empty')} hint={t('history.emptyHint')} />
      ) : (
        <>
          <div className="mb-4">
            <Input icon={<Search size={14} />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('history.searchPlaceholder')} aria-label={t('common.search')} />
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
                          {t(c.turns === 1 ? 'history.prompt' : 'history.prompts', { n: c.turns })} · {relTime(c.updatedAt, t)}{c.preview ? ` · ${c.preview}` : ''}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => del(c.id)} disabled={pending} title={t('common.delete')} className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors">
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
            {visible.length === 0 && <EmptyState className="py-10" title={t('history.noMatch')} />}
          </div>
        </>
      )}
    </main>
  );
}
