'use client';
import { useState, useRef, useTransition, useEffect } from 'react';
import {
  Sparkles, ArrowUp, Loader2, Check, X, RotateCcw, Search,
  Package, Receipt as ReceiptIcon, CreditCard, CheckSquare, CalendarClock, Wallet, Ticket,
  FileText, Target, ShoppingCart, Mic, Square,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { runAiCommand, type ChatTurn } from '@/app/aiCommandActions';
import { searchAll, type SearchHit } from '@/app/search-actions';
import { cn } from '@/components/ui/cn';
import { useLocale, useT } from './LocaleProvider';
import { useSpeechInput } from './useSpeechInput';

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

const TYPE_ICON: Record<SearchHit['type'], React.ComponentType<{ size?: number; className?: string }>> = {
  item: Package,
  receipt: ReceiptIcon,
  statement: CreditCard,
  task: CheckSquare,
  subscription: CalendarClock,
  expense: Wallet,
  voucher: Ticket,
  bill: FileText,
  goal: Target,
  shoppinglist: ShoppingCart,
};

/**
 * The top bar's two tools, one component: `kind="search"` is the search box (on a phone,
 * `compact` shows a search button that opens it over the page); `kind="ai"` is the Ask Pharos
 * button, which opens the conversation in a side panel (full screen on a phone).
 */
export function AiCommandBar({ compact = false, kind = 'search', aiReady = true }: { compact?: boolean; kind?: Mode; aiReady?: boolean } = {}) {
  const [expanded, setExpanded] = useState(false);
  const mode: Mode = kind;
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  // AI state
  const [aiPending, startAi] = useTransition();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convId, setConvId] = useState<string | undefined>(undefined); // persists this chat in /history
  // Search state
  const [searchPending, startSearch] = useTransition();
  const [hits, setHits] = useState<SearchHit[]>([]);

  const t = useT();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Dictation fills the same input; the user still reviews and presses send (never auto-sent).
  const speech = useSpeechInput(useLocale(), setValue);

  // Close the search results on an outside click. The Ask Pharos panel stays open while the
  // page beside it is used; its own close button and Escape close it.
  const aiPanelOpen = mode === 'ai' && open;
  useEffect(() => {
    if (aiPanelOpen) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (compact) setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [compact, aiPanelOpen]);

  // Escape closes the panel (and the phone's overlay); Ctrl/Cmd+K jumps into the box. The
  // shell mounts a computer bar and a phone bar, so each answers only on its own screen size.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        if (compact) setExpanded(false);
        return;
      }
      if (kind === 'search' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const wide = window.matchMedia('(min-width: 1024px)').matches;
        if (wide === compact) return;
        e.preventDefault();
        if (compact) setExpanded(true);
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, kind]);

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

  function go(hit: SearchHit) {
    router.push(hit.href);
    setOpen(false);
    if (compact) setExpanded(false);
    setValue('');
    setHits([]);
  }

  function send(text?: string) {
    const cmd = (text ?? value).trim();
    if (!cmd || aiPending) return;
    speech.cancel(); // a late result must not refill the box after sending
    speech.clearError();
    const next: Msg[] = [...messages, { role: 'user', content: cmd }];
    setMessages(next);
    setValue('');
    setOpen(true);
    startAi(async () => {
      const history: ChatTurn[] = next.map((m) => ({ role: m.role, content: m.content }));
      const r = await runAiCommand(history, convId);
      if (r.conversationId) setConvId(r.conversationId);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: r.error ? r.error : r.reply || 'Done.', actions: r.actions, error: !!r.error },
      ]);
      if (r.ok && r.actions.length) router.refresh();
    });
  }

  function resetAi() {
    speech.cancel();
    speech.clearError();
    setMessages([]);
    setValue('');
    setOpen(false);
    setConvId(undefined); // next message starts a fresh conversation
  }

  function toggleDictation() {
    setOpen(true);
    if (speech.listening) speech.stop();
    else {
      speech.start(value);
      inputRef.current?.focus();
    }
  }

  function onEnter() {
    if (mode === 'search') {
      if (hits[0]) go(hits[0]);
    } else {
      send();
    }
  }

  const isAi = mode === 'ai';
  // Where the AI conversation lives: under the box (inline), in a side panel, or in a dock
  // at the bottom of the page. The page never moves or dims for it.
  // The conversation opens in a side panel (full screen on a phone), so the page stays usable.
  const floating = isAi && open;
  useEffect(() => {
    if (!floating) return;
    document.body.dataset.aiFloating = '';
    return () => {
      delete document.body.dataset.aiFloating;
    };
  }, [floating]);
  const ph = isAi ? (speech.listening ? t('bar.micListening') : t('bar.aiPlaceholder')) : t('bar.searchPlaceholder');
  const pending = isAi ? aiPending : searchPending;

  if (kind === 'search' && compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label={t('bar.searchTitle')}
        className="w-11 h-11 grid place-items-center rounded-xl text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
      >
        <Search size={20} />
      </button>
    );
  }

  const barEl = (
    <>
      {/* Bar */}
      <div className="relative group">
        {/* Soft accent glow in AI mode (calmer when floating) */}
        {isAi && (
          <div className="absolute -inset-[1.5px] rounded-2xl bg-gradient-to-r from-[color:var(--color-accent)] via-[color:var(--color-cyan)] to-[color:var(--color-purple)] opacity-40 group-focus-within:opacity-75 blur-[2px] transition-opacity" />
        )}
        <div
          className={cn(
            'relative flex items-center gap-2 rounded-2xl bg-[color:var(--color-surface)] border px-2 py-2 transition-colors',
            isAi
              ? 'border-[color:var(--color-border)]'
              : 'border-[color:var(--color-border)] focus-within:border-[color:var(--color-accent)]'
          )}
        >
          {isAi ? (
            <Sparkles size={15} className="ml-1 shrink-0 text-[color:var(--color-cyan)]" />
          ) : (
            <Search size={15} className="ml-1 shrink-0 text-[color:var(--color-text-faint)]" />
          )}

          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              // Typing takes over from dictation, which would otherwise overwrite the edit.
              if (speech.listening) speech.cancel();
              speech.clearError();
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
            /* Password managers were filling the SAVED PASSWORD into this box on every page
               load: an unnamed, untyped text input in the top bar is exactly what their
               heuristics latch onto. type="search" + a neutral name + the two vendor opt-outs
               (1Password, LastPass/Bitwarden) tell them this is not a credential field.
               `autoComplete="off"` alone is not enough — managers are documented to ignore it. */
            type="search"
            name="pharos-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-[color:var(--color-text-faint)] disabled:opacity-60 [&::-webkit-search-cancel-button]:appearance-none"
          />

          {/* Trailing actions */}
          {pending && !isAi && <Loader2 size={14} className="shrink-0 animate-spin text-[color:var(--color-cyan)]" />}
          {!isAi && !pending && value && (
            <button type="button" onClick={() => { setValue(''); setHits([]); }} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]" aria-label={t('common.clear')}>
              <X size={14} />
            </button>
          )}
          {isAi && messages.length > 0 && (
            <button type="button" onClick={resetAi} title={t('bar.newConversation')} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
              <RotateCcw size={14} />
            </button>
          )}
          {isAi && speech.supported && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={aiPending}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? t('bar.micStop') : t('bar.micStart')}
              title={speech.listening ? t('bar.micStop') : t('bar.micStart')}
              className={cn(
                'shrink-0 grid place-items-center w-8 h-8 rounded-xl transition-colors disabled:opacity-40',
                speech.listening
                  ? 'bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]'
                  : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
              )}
              style={speech.listening ? { animation: 'pharos-beacon-pulse 1.8s ease-out infinite' } : undefined}
            >
              {speech.listening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
            </button>
          )}
          {isAi && (
            <button
              type="button"
              onClick={() => send()}
              disabled={aiPending || !value.trim()}
              className="shrink-0 grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-[color:var(--color-accent)] to-[color:var(--color-cyan)] text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              aria-label={t('common.send')}
            >
              {aiPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          )}
        </div>
      </div>

    </>
  );
  const threadEl = (
    <>
          {speech.error && (
            <p role="alert" className="px-4 pt-3 text-xs text-[color:var(--color-gold)]">{t(speech.error)}</p>
          )}
          {messages.length === 0 && !aiPending && (
            <div className="p-2.5">
              <p className="text-[11px] text-[color:var(--color-text-faint)] px-1.5 mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{t('bar.try')}</p>
              {[t('bar.example1'), t('bar.example2'), t('bar.example3'), t('bar.example4')].map((ex, idx) => (
                <button
                  key={idx}
                  onClick={() => send(ex)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)] transition-colors"
                >
                  <Sparkles size={13} className="text-[color:var(--color-cyan)] shrink-0" /> {ex}
                </button>
              ))}
            </div>
          )}
          <div className={cn('p-3 space-y-2.5 text-left', messages.length === 0 && !aiPending && 'hidden')}>
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
                  <Loader2 size={13} className="animate-spin" /> {t('bar.thinking')}
                </div>
              </div>
            )}
          </div>
    </>
  );
  // The Ask Pharos button in the top bar: a pill with the AI status dot on a computer, an
  // icon on a phone. It stays put while the panel is open, so the bar never shifts.
  const openAi = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const trigger = (
    <button
      type="button"
      onClick={() => (open ? setOpen(false) : openAi())}
      aria-expanded={open}
      aria-label={t('bar.aiPanelTitle')}
      title={aiReady ? `${t('bar.aiPanelTitle')} · ${t('ai.online')}` : `${t('bar.aiPanelTitle')} · ${t('ai.offline')}`}
      className={cn(
        compact
          ? 'relative w-11 h-11 grid place-items-center rounded-xl text-[color:var(--color-cyan)]'
          : 'relative inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors',
        !compact && (open ? 'border-[color:var(--color-cyan)]/60 bg-[color:var(--color-cyan)]/10' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)]/50 hover:bg-[color:var(--color-surface)]')
      )}
    >
      <Sparkles size={compact ? 20 : 16} className="text-[color:var(--color-cyan)]" />
      {!compact && <span>{t('bar.aiPanelTitle')}</span>}
      <span className={cn('h-1.5 w-1.5 rounded-full', compact && 'absolute right-2 top-2', aiReady ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')} aria-hidden />
    </button>
  );

  return (
    <>
      {!isAi && compact && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          style={{ animation: 'pharos-fade-in .15s ease-out' }}
          onMouseDown={() => {
            setOpen(false);
            setExpanded(false);
          }}
          aria-hidden
        />
      )}
      <div ref={wrapRef} className={cn(isAi ? 'relative' : compact ? 'fixed z-50 top-2 inset-x-2' : 'relative w-full max-w-xl')}>
        {isAi ? trigger : barEl}

        {/* Side panel: a conversation column on the right; the page stays usable on the left */}
        {floating && (
          <>
            <aside
              className="fixed inset-0 z-[70] flex flex-col bg-[color:var(--color-surface)] sm:inset-auto sm:bottom-0 sm:right-0 sm:top-0 sm:w-[420px] sm:border-l sm:border-[color:var(--color-border)] sm:shadow-2xl sm:shadow-black/50"
              style={{ animation: 'pharos-slide-in .2s ease-out both' }}
              aria-label={t('bar.aiTitle')}
            >
              <header className="flex items-center gap-2 border-b border-[color:var(--color-border)] px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color:var(--color-cyan)]/12 text-[color:var(--color-cyan)]"><Sparkles size={16} /></span>
                <span className="flex-1 text-sm font-semibold">{t('bar.aiPanelTitle')}</span>
                {messages.length > 0 && (
                  <button type="button" onClick={resetAi} title={t('bar.newConversation')} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"><RotateCcw size={15} /></button>
                )}
                <button type="button" onClick={() => { setOpen(false); if (compact) setExpanded(false); }} aria-label={t('common.close')} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"><X size={17} /></button>
              </header>
              <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">{threadEl}</div>
              <div className="border-t border-[color:var(--color-border)] p-3">{barEl}</div>
            </aside>
          </>
        )}

      {/* Panel — search results */}
      {open && !isAi && value.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 py-1.5">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[color:var(--color-text-faint)]">{searchPending ? t('bar.searching') : t('bar.noMatches')}</p>
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
                    <div className="text-[11px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
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
    </>
  );
}
