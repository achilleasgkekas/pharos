'use client';
import { useState, useRef, useTransition, useEffect } from 'react';
import {
  Sparkles, ArrowUp, Loader2, Check, X, RotateCcw, Search,
  Package, Receipt as ReceiptIcon, CreditCard, CheckSquare, CalendarClock, Wallet, Ticket,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { runAiCommand, type ChatTurn } from '@/app/aiCommandActions';
import { searchAll, type SearchHit } from '@/app/search-actions';
import { cn } from '@/components/ui/cn';

type Msg = ChatTurn & { actions?: { name: string; summary: string }[]; error?: boolean };
type Mode = 'search' | 'ai';

// Minimal inline markdown for assistant replies: **bold** + line breaks.
// The model answers in markdown; the bubble used to show the raw ** asterisks.
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

const EXAMPLES = [
  'Add a YouTube Premium subscription',
  'Πρόσθεσε έξοδο ΔΕΗ 84€',
  'Show me this month’s stats',
  'Add task: order the 10G switch',
];

const TYPE_ICON: Record<SearchHit['type'], React.ComponentType<{ size?: number; className?: string }>> = {
  item: Package,
  receipt: ReceiptIcon,
  statement: CreditCard,
  task: CheckSquare,
  subscription: CalendarClock,
  expense: Wallet,
  voucher: Ticket,
};

export function AiCommandBar({ placeholder = 'Ask Pharos…  e.g. add a subscription' }: { placeholder?: string }) {
  const [mode, setMode] = useState<Mode>('search');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  // AI state
  const [aiPending, startAi] = useTransition();
  const [messages, setMessages] = useState<Msg[]>([]);
  // Search state
  const [searchPending, startSearch] = useTransition();
  const [hits, setHits] = useState<SearchHit[]>([]);

  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Restore the last-used mode.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pharosSearchMode');
      if (saved === 'ai' || saved === 'search') setMode(saved);
    } catch {}
  }, []);

  // Close the panel on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Keep the AI conversation scrolled to the newest message.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, aiPending]);

  // Debounced global search (search mode only).
  useEffect(() => {
    if (mode !== 'search') return;
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      startSearch(async () => setHits(await searchAll(value)));
    }, 250);
    return () => clearTimeout(t);
  }, [value, mode]);

  function switchMode(m: Mode) {
    setMode(m);
    setValue('');
    setHits([]);
    setOpen(true);
    try {
      localStorage.setItem('pharosSearchMode', m);
    } catch {}
  }

  function go(hit: SearchHit) {
    router.push(hit.href);
    setOpen(false);
    setValue('');
    setHits([]);
  }

  function send(text?: string) {
    const cmd = (text ?? value).trim();
    if (!cmd || aiPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: cmd }];
    setMessages(next);
    setValue('');
    setOpen(true);
    startAi(async () => {
      const history: ChatTurn[] = next.map((m) => ({ role: m.role, content: m.content }));
      const r = await runAiCommand(history);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: r.error ? r.error : r.reply || 'Done.', actions: r.actions, error: !!r.error },
      ]);
      if (r.ok && r.actions.length) router.refresh();
    });
  }

  function resetAi() {
    setMessages([]);
    setValue('');
    setOpen(false);
  }

  function onEnter() {
    if (mode === 'search') {
      if (hits[0]) go(hits[0]);
    } else {
      send();
    }
  }

  const isAi = mode === 'ai';
  const ph = isAi ? placeholder : 'Search everything…  receipts, items, tasks';
  const pending = isAi ? aiPending : searchPending;

  return (
    <div ref={wrapRef} className="relative w-full max-w-2xl">
      {/* Bar */}
      <div className="relative group">
        {/* Gradient glow only in AI mode */}
        {isAi && (
          <div className="absolute -inset-[1.5px] rounded-2xl bg-gradient-to-r from-[color:var(--color-accent)] via-[color:var(--color-cyan)] to-[color:var(--color-purple)] opacity-50 group-focus-within:opacity-100 blur-[2px] transition-opacity" />
        )}
        <div
          className={cn(
            'relative flex items-center gap-2 rounded-2xl bg-[color:var(--color-surface)] border px-2 py-2 transition-colors',
            isAi
              ? 'border-[color:var(--color-border)]'
              : 'border-[color:var(--color-border)] focus-within:border-[color:var(--color-accent)]'
          )}
        >
          {/* Mode toggle — Search | AI */}
          <div className="flex items-center shrink-0 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] p-0.5">
            <button
              type="button"
              onClick={() => switchMode('search')}
              title="Search your data"
              className={cn(
                'grid place-items-center w-6 h-6 rounded-md transition-colors',
                !isAi ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Search size={13} />
            </button>
            <button
              type="button"
              onClick={() => switchMode('ai')}
              title="Ask the AI"
              className={cn(
                'grid place-items-center w-6 h-6 rounded-md transition-colors',
                isAi ? 'bg-[color:var(--color-cyan)]/15 text-[color:var(--color-cyan)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'
              )}
            >
              <Sparkles size={13} />
            </button>
          </div>

          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnter();
              if (e.key === 'Escape') setOpen(false);
            }}
            disabled={pending && isAi}
            placeholder={ph}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--color-text-faint)] disabled:opacity-60"
          />

          {/* Trailing actions */}
          {pending && !isAi && <Loader2 size={14} className="shrink-0 animate-spin text-[color:var(--color-cyan)]" />}
          {!isAi && !pending && value && (
            <button type="button" onClick={() => { setValue(''); setHits([]); }} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]" aria-label="Clear">
              <X size={14} />
            </button>
          )}
          {isAi && messages.length > 0 && (
            <button type="button" onClick={resetAi} title="New conversation" className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
              <RotateCcw size={14} />
            </button>
          )}
          {isAi && (
            <button
              type="button"
              onClick={() => send()}
              disabled={aiPending || !value.trim()}
              className="shrink-0 grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-[color:var(--color-accent)] to-[color:var(--color-cyan)] text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              {aiPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* Panel — AI conversation */}
      {open && isAi && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 overflow-hidden">
          {messages.length === 0 && !aiPending && (
            <div className="p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] px-1.5 mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>Try</p>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)] transition-colors"
                >
                  <Sparkles size={13} className="text-[color:var(--color-cyan)] shrink-0" /> {ex}
                </button>
              ))}
            </div>
          )}
          <div ref={threadRef} className={cn('max-h-[50vh] overflow-y-auto p-3 space-y-2.5 text-left', messages.length === 0 && !aiPending && 'hidden')}>
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-text)]'
                      : m.error
                        ? 'bg-[color:var(--color-gold)]/10 text-[color:var(--color-gold)]'
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
            {aiPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] text-sm flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> thinking…
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Panel — search results */}
      {open && !isAi && value.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 py-1.5">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[color:var(--color-text-faint)]">{searchPending ? 'Searching…' : 'No matches'}</p>
          ) : (
            hits.map((h) => {
              const Icon = TYPE_ICON[h.type];
              return (
                <button
                  key={`${h.type}-${h.id}`}
                  onClick={() => go(h)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)] transition-colors"
                >
                  <Icon size={15} className="shrink-0 text-[color:var(--color-text-faint)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{h.title}</div>
                    <div className="text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                      {h.subtitle}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
