'use client';
// The AI inbox on Home: drop or pick any files; for each one the AI says where it belongs
// (with two or three other places), you pick, and it is saved there with the file.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Loader2, Check, ArrowRight, Receipt, Wallet, Banknote, FileText, CreditCard, IdCard, X, Upload } from 'lucide-react';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { cn } from '@/components/ui/cn';
import { formatDate } from '@/lib/i18n/format';
import { INBOX_HREF, type InboxDestination, type InboxGuess } from '@/lib/inboxRouter';
import type { TKey } from '@/lib/i18n';
import { classifyInboxFile, inboxToBill, inboxToDocument } from '@/app/inboxActions';
import { uploadReceipt } from '@/app/receipts/actions';
import { uploadExpense } from '@/app/expenses/actions';
import { importStatementPdf } from '@/app/statements/actions';

const ICON: Record<InboxDestination, React.ComponentType<{ size?: number; className?: string }>> = {
  receipt: Receipt,
  expense: Wallet,
  income: Banknote,
  bill: FileText,
  statement: CreditCard,
  document: IdCard,
};

type Row = {
  id: number;
  file: File;
  state: 'reading' | 'ready' | 'saving' | 'saved' | 'error';
  guess?: InboxGuess;
  error?: string;
  savedTo?: InboxDestination;
  savedId?: string;
};

const MAX_BYTES = 40 * 1024 * 1024;

/** React masks a server error in production ("Minified React error #441"); say what it means. */
function readable(e: unknown, fallback: string): string {
  const msg = String((e as Error)?.message || e);
  return /Minified React error|Server Components render|digest/i.test(msg) ? fallback : msg;
}

const fd = (file: File, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set('file', file);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

/** Save the file where the user picked, through that page's own import. */
async function saveTo(dest: InboxDestination, file: File, g: InboxGuess): Promise<{ ok: boolean; id?: string; error?: string }> {
  switch (dest) {
    case 'receipt':
      return uploadReceipt(fd(file));
    case 'expense':
      return uploadExpense(fd(file, { kind: 'expense' }));
    case 'income':
      return uploadExpense(fd(file, { kind: 'income' }));
    case 'statement':
      return importStatementPdf(fd(file));
    case 'bill':
      return inboxToBill(fd(file), { title: g.title, amount: g.amount, date: g.date });
    case 'document':
      return inboxToDocument(fd(file), { title: g.title, date: g.date });
  }
}

export function InboxDrop() {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const nextId = useRef(1);

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  function add(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).slice(0, 10);
    for (const file of list) {
      const id = nextId.current++;
      if (file.size > MAX_BYTES) {
        setRows((rs) => [...rs, { id, file, state: 'error', error: t('inbox.tooLarge') }]);
        continue;
      }
      setRows((rs) => [...rs, { id, file, state: 'reading' }]);
      classifyInboxFile(fd(file)).then(
        (r) => (r.ok ? patch(id, { state: 'ready', guess: r.guess }) : patch(id, { state: 'error', error: r.error })),
        (e) => patch(id, { state: 'error', error: readable(e, t('inbox.serverError')) })
      );
    }
  }

  async function pick(row: Row, dest: InboxDestination) {
    if (!row.guess) return;
    patch(row.id, { state: 'saving' });
    try {
      const r = await saveTo(dest, row.file, row.guess);
      if (r.ok && r.id) {
        patch(row.id, { state: 'saved', savedTo: dest, savedId: r.id });
        router.refresh();
      } else patch(row.id, { state: 'ready', error: r.error || t('inbox.saveFailed') });
    } catch (e) {
      patch(row.id, { state: 'ready', error: readable(e, t('inbox.serverError')) });
    }
  }

  const destLabel = (d: InboxDestination) => t(`inbox.to.${d}` as TKey);

  return (
    <section
      aria-labelledby="home-inbox"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(e.dataTransfer.files);
      }}
      className={cn(
        'mb-4 rounded-2xl border border-dashed bg-[color:var(--color-surface)] p-4 transition-colors',
        over ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5' : 'border-[color:var(--color-border-light)]'
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--color-cyan)]/12 text-[color:var(--color-cyan)]">
          <Inbox size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="home-inbox" className="text-[15px] font-semibold">{t('inbox.title')}</h2>
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('inbox.hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[color:var(--color-border-light)] bg-[color:var(--color-surface-2)] px-3 text-sm font-semibold hover:bg-[color:var(--color-surface-3)]"
        >
          <Upload size={15} /> {t('inbox.pick')}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const g = row.guess;
            const Main = g ? ICON[g.destination] : Inbox;
            const facts = g ? [g.title, g.amount != null ? money(g.amount) : '', g.date ? formatDate(`${g.date}T12:00:00Z`, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · ') : '';
            return (
              <li key={row.id} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
                <div className="flex items-start gap-2.5">
                  <Main size={16} className="mt-0.5 shrink-0 text-[color:var(--color-text-dim)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{row.file.name}</span>
                      {row.state !== 'saving' && row.state !== 'reading' && (
                        <button type="button" onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))} aria-label={t('common.close')} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {row.state === 'reading' && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--color-cyan)]">
                        <Loader2 size={12} className="animate-spin" /> {t('inbox.reading')}
                      </p>
                    )}
                    {row.state === 'error' && <p role="alert" className="mt-1 text-xs text-[color:var(--color-red)]">{row.error}</p>}
                    {g && row.state !== 'saved' && (
                      <>
                        {facts && <p className="mt-0.5 truncate text-xs text-[color:var(--color-text-dim)]">{facts}</p>}
                        {g.why && <p className="text-[11px] text-[color:var(--color-text-faint)]">{g.why}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {[g.destination, ...g.alternatives].map((d, i) => {
                            const Icon = ICON[d];
                            return (
                              <button
                                key={d}
                                type="button"
                                disabled={row.state === 'saving'}
                                onClick={() => pick(row, d)}
                                className={cn(
                                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-50',
                                  i === 0
                                    ? 'bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)] hover:brightness-110'
                                    : 'border border-[color:var(--color-border-light)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-3)]'
                                )}
                              >
                                {row.state === 'saving' && i === 0 ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                                {i === 0 ? t('inbox.saveIn', { place: destLabel(d) }) : destLabel(d)}
                              </button>
                            );
                          })}
                        </div>
                        {row.error && <p role="alert" className="mt-1 text-xs text-[color:var(--color-red)]">{row.error}</p>}
                      </>
                    )}
                    {row.state === 'saved' && row.savedTo && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-accent)]">
                        <Check size={13} /> {t('inbox.saved', { place: destLabel(row.savedTo) })}
                        <Link href={`${INBOX_HREF[row.savedTo]}?open=${row.savedId}`} prefetch={false} className="inline-flex items-center gap-1 text-[color:var(--color-cyan)] hover:underline">
                          {t('inbox.open')} <ArrowRight size={12} />
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
