'use client';
import { useState, useTransition, useMemo } from 'react';
import { Plus, Trash2, CreditCard, Minus, Archive, ArchiveRestore, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { cur } from '@/lib/money';
import { giftCardBalance, giftCardSpentPct, giftCardDaysLeft } from '@/lib/giftcard';
import type { SerializedGiftCard } from '@/types';
import { createGiftCard, updateGiftCard, deleteGiftCard, setGiftCardArchived, addGiftCardUse, removeGiftCardUse } from './giftcardActions';

const money = (n: number) => `${cur()}${n.toFixed(2)}`;

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const d = giftCardDaysLeft(expiresAt);
  if (d === null) return null;
  const expired = d < 0;
  const soon = d >= 0 && d <= 30;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold',
        expired
          ? 'bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]'
          : soon
            ? 'bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)]'
            : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)]'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <Clock size={10} /> {expired ? 'expired' : d === 0 ? 'today' : `${d}d left`}
    </span>
  );
}

export function GiftCardsClient({ giftCards }: { giftCards: SerializedGiftCard[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedGiftCard | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const live = useMemo(() => giftCards.filter((g) => !g.archived && giftCardBalance(g.initialAmount, g.uses) > 0.009), [giftCards]);
  const totalUnspent = useMemo(() => live.reduce((s, g) => s + giftCardBalance(g.initialAmount, g.uses), 0), [live]);
  const visible = useMemo(() => giftCards.filter((g) => showArchived || (!g.archived && giftCardBalance(g.initialAmount, g.uses) > 0.009)), [giftCards, showArchived]);

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Gift cards
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {live.length} active
            </span>
          </h1>
          {totalUnspent > 0 && (
            <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">
              <span className="text-[color:var(--color-accent)] font-semibold">{money(totalUnspent)}</span> unspent across {live.length} card{live.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={cn(
              'text-xs px-3 py-2 rounded-lg border transition-colors',
              showArchived ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {showArchived ? 'Hide' : 'Show'} empty/archived
          </button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} strokeWidth={2.5} /> New card
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-4">💳</p>
          <p className="text-sm">
            {giftCards.length === 0
              ? 'No gift cards yet. Hit + to track a gift card, store credit, or prepaid balance that decreases as you spend it.'
              : 'No active cards. Toggle "Show empty/archived" to see spent ones.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((g) => (
            <GiftCardTile key={g._id} card={g} onOpen={() => setEditing(g)} />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New gift card" size="lg">
        <GiftCardForm onSuccess={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.title} size="lg">
          <GiftCardForm card={editing} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </main>
  );
}

function GiftCardTile({ card, onOpen }: { card: SerializedGiftCard; onOpen: () => void }) {
  const balance = giftCardBalance(card.initialAmount, card.uses);
  const pct = giftCardSpentPct(card.initialAmount, card.uses);
  const empty = balance <= 0.009;
  return (
    <button
      onClick={onOpen}
      className={cn(
        'text-left p-4 rounded-xl border bg-[color:var(--color-surface)] hover:-translate-y-0.5 transition-transform',
        empty || card.archived ? 'border-[color:var(--color-border)] opacity-70' : 'border-[color:var(--color-border-light)]'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-faint)] flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            <CreditCard size={11} /> {card.store || 'gift card'}
          </p>
          <p className="font-semibold text-[color:var(--color-text)] truncate mt-0.5">{card.title}</p>
        </div>
        {card.archived ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            archived
          </span>
        ) : (
          <ExpiryBadge expiresAt={card.expiresAt} />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold', empty ? 'text-[color:var(--color-text-faint)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-display)' }}>
          {money(Math.max(0, balance))}
        </span>
        {card.initialAmount > 0 && <span className="text-xs text-[color:var(--color-text-faint)]">of {money(card.initialAmount)}</span>}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[color:var(--color-surface-2)] overflow-hidden">
        <div className="h-full rounded-full bg-[color:var(--color-accent)]" style={{ width: `${100 - pct}%` }} />
      </div>
    </button>
  );
}

function GiftCardForm({ card, onSuccess, onDeleted }: { card?: SerializedGiftCard; onSuccess: () => void; onDeleted?: () => void }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [error, setError] = useState('');
  // Quick-spend row
  const [spendAmt, setSpendAmt] = useState('');
  const [spendNote, setSpendNote] = useState('');
  const [spendErr, setSpendErr] = useState('');

  const balance = card ? giftCardBalance(card.initialAmount, card.uses) : 0;

  const submit = (formData: FormData) => {
    setError('');
    startTransition(async () => {
      try {
        if (card) await updateGiftCard(card._id, formData);
        else await createGiftCard(formData);
        onSuccess();
      } catch (e) {
        setError((e as Error).message || 'Save failed');
      }
    });
  };

  const spend = (sign: 1 | -1) => {
    const amt = Number(spendAmt) * sign;
    setSpendErr('');
    startTransition(async () => {
      const r = await addGiftCardUse(card!._id, amt, spendNote);
      if (!r.ok) setSpendErr(r.error || 'Failed');
      else {
        setSpendAmt('');
        setSpendNote('');
      }
    });
  };

  const label = 'block text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)] mb-1';

  return (
    <div className="space-y-5">
      <form action={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Title</label>
          <Input name="title" defaultValue={card?.title} placeholder="IKEA gift card" required />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Store</label>
          <Input name="store" defaultValue={card?.store} placeholder="IKEA" />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Face value ({cur()})</label>
          <Input name="initialAmount" type="number" step="0.01" min="0" defaultValue={card?.initialAmount || ''} placeholder="50" />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Code / card number</label>
          <Input name="code" defaultValue={card?.code} placeholder="optional" />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Expires</label>
          <Input name="expiresAt" type="date" defaultValue={card?.expiresAt ? card.expiresAt.slice(0, 10) : ''} />
        </div>
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Notes</label>
          <Input name="notes" defaultValue={card?.notes} placeholder="optional" />
        </div>
        {error && <p className="md:col-span-2 text-xs text-[color:var(--color-red)]">{error}</p>}
        <div className="md:col-span-2 flex items-center justify-between gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {card ? 'Save' : 'Add card'}
          </Button>
          {card && onDeleted && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await setGiftCardArchived(card._id, !card.archived);
                    onDeleted();
                  })
                }
                className="text-xs px-2 py-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {card.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {card.archived ? 'Reopen' : 'Archive'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({ title: 'Delete gift card', message: `Delete "${card.title}"? It moves to Trash.`, confirmLabel: 'Delete', danger: true });
                  if (ok) startTransition(async () => { await deleteGiftCard(card._id); onDeleted(); });
                }}
                className="text-xs px-2 py-1.5 rounded-lg text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </form>

      {card && (
        <div className="pt-4 border-t border-[color:var(--color-border)] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              Balance
            </p>
            <p className="text-lg font-bold text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-display)' }}>
              {money(balance)}
            </p>
          </div>

          {/* Quick spend / reload */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[110px]">
              <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Amount ({cur()})</label>
              <Input type="number" step="0.01" min="0" value={spendAmt} onChange={(e) => setSpendAmt(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex-1 min-w-[110px]">
              <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Note</label>
              <Input value={spendNote} onChange={(e) => setSpendNote(e.target.value)} placeholder="optional" />
            </div>
            <Button type="button" variant="ghost" disabled={pending || !spendAmt} onClick={() => spend(1)}>
              <Minus size={14} /> Spend
            </Button>
            <Button type="button" variant="ghost" disabled={pending || !spendAmt} onClick={() => spend(-1)}>
              <Plus size={14} /> Reload
            </Button>
          </div>
          {spendErr && <p className="text-xs text-[color:var(--color-red)]">{spendErr}</p>}

          {card.uses.length > 0 && (
            <ul className="space-y-1 max-h-52 overflow-y-auto">
              {[...card.uses]
                .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                .map((u) => (
                  <li key={u._id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-[color:var(--color-border)]/50">
                    <div className="min-w-0">
                      <span className={cn('font-semibold', u.amount >= 0 ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-accent)]')}>
                        {u.amount >= 0 ? '−' : '+'}
                        {money(Math.abs(u.amount))}
                      </span>
                      {u.note && <span className="ml-2 text-[color:var(--color-text-faint)] truncate">{u.note}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {u.date ? new Date(u.date).toLocaleDateString('en-GB') : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => startTransition(async () => { await removeGiftCardUse(card._id, u._id); })}
                        className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"
                        title="Remove entry"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
