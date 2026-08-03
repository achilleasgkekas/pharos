'use client';
import { useState, useTransition, useMemo } from 'react';
import { Plus, Trash2, Barcode, Pencil, Archive, ArchiveRestore, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { useOpenParam } from '@/components/useOpenParam';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { BARCODE_FORMATS, guessBarcodeFormat, type BarcodeFormat } from '@/lib/loyaltyCard';
import type { SerializedLoyaltyCard } from '@/types';
import { createLoyaltyCard, updateLoyaltyCard, deleteLoyaltyCard, setLoyaltyCardArchived } from './loyaltyActions';

export function LoyaltyCardsClient({ cards }: { cards: SerializedLoyaltyCard[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SerializedLoyaltyCard | null>(null);
  const [viewing, setViewing] = useState<SerializedLoyaltyCard | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Deep-link from global search: /vouchers?tab=loyalty&open=<id> (the shell picks the tab).
  // Opens the BARCODE view, not the edit form: searching for a loyalty card at the till means
  // "show me the thing the scanner reads".
  useOpenParam((id) => {
    const c = cards.find((x) => x._id === id);
    if (c) {
      if (c.archived) setShowArchived(true);
      setViewing(c);
    }
  });

  const visible = useMemo(() => cards.filter((c) => showArchived || !c.archived), [cards, showArchived]);
  const activeCount = useMemo(() => cards.filter((c) => !c.archived).length, [cards]);

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Loyalty cards
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {activeCount} card{activeCount === 1 ? '' : 's'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">Tap a card for a fullscreen barcode at the checkout.</p>
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
            {showArchived ? 'Hide' : 'Show'} archived
          </button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} strokeWidth={2.5} /> New card
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-20 text-[color:var(--color-text-faint)]">
          <p className="text-5xl mb-4">🪪</p>
          <p className="text-sm">
            {cards.length === 0
              ? 'No loyalty cards yet. Hit + to store a membership/loyalty card number and show its barcode at checkout.'
              : 'No active cards. Toggle "Show archived" to see closed ones.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((c) => (
            <LoyaltyCardTile key={c._id} card={c} onView={() => setViewing(c)} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New loyalty card" size="lg">
        <LoyaltyCardForm onSuccess={() => setShowCreate(false)} />
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.title} size="lg">
          <LoyaltyCardForm card={editing} onSuccess={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.title} size="md">
          <div className="space-y-4">
            {viewing.store && <p className="text-center text-sm text-[color:var(--color-text-dim)]">{viewing.store}</p>}
            <BarcodeDisplay value={viewing.cardNumber} format={(viewing.barcodeFormat as BarcodeFormat) || 'CODE128'} height={110} />
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(viewing);
                  setViewing(null);
                }}
              >
                <Pencil size={14} /> Edit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

function LoyaltyCardTile({ card, onView, onEdit }: { card: SerializedLoyaltyCard; onView: () => void; onEdit: () => void }) {
  return (
    <div
      className={cn(
        'group relative p-4 rounded-xl border bg-[color:var(--color-surface)] hover:-translate-y-0.5 transition-transform',
        card.archived ? 'border-[color:var(--color-border)] opacity-70' : 'border-[color:var(--color-border-light)]'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="absolute top-2 right-2 p-1.5 rounded-md text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Edit card"
        title="Edit"
      >
        <Pencil size={13} />
      </button>
      <button onClick={onView} className="w-full text-left">
        <div className="flex items-start gap-2 mb-3 pr-6">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-faint)] flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              <Barcode size={11} /> {card.store || 'loyalty card'}
            </p>
            <p className="font-semibold text-[color:var(--color-text)] truncate mt-0.5">{card.title}</p>
          </div>
          {card.archived && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)] shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
              archived
            </span>
          )}
        </div>
        <p className="text-xs text-[color:var(--color-text-faint)] font-mono truncate">{card.cardNumber}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-[color:var(--color-purple)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <Maximize2 size={12} /> Show barcode
        </div>
      </button>
    </div>
  );
}

function LoyaltyCardForm({ card, onSuccess, onDeleted }: { card?: SerializedLoyaltyCard; onSuccess: () => void; onDeleted?: () => void }) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [cardNumber, setCardNumber] = useState(card?.cardNumber ?? '');
  const [format, setFormat] = useState<BarcodeFormat>((card?.barcodeFormat as BarcodeFormat) || guessBarcodeFormat(card?.cardNumber ?? ''));

  const submit = (formData: FormData) => {
    setError('');
    startTransition(async () => {
      try {
        if (card) await updateLoyaltyCard(card._id, formData);
        else await createLoyaltyCard(formData);
        onSuccess();
      } catch (e) {
        setError((e as Error).message || 'Save failed');
      }
    });
  };

  const label = 'block text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-faint)] mb-1';

  return (
    <div className="space-y-5">
      <form action={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Title</label>
          <Input name="title" defaultValue={card?.title} placeholder="AB Card" required />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Store</label>
          <Input name="store" defaultValue={card?.store} placeholder="AB Vassilopoulos" />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Card number</label>
          <Input
            name="cardNumber"
            value={cardNumber}
            onChange={(e) => {
              const v = e.target.value;
              setCardNumber(v);
              setFormat((prev) => (v ? guessBarcodeFormat(v) : prev));
            }}
            placeholder="the number printed under the barcode"
            required
          />
        </div>
        <div>
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Barcode format</label>
          <select
            name="barcodeFormat"
            value={format}
            onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
            className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
          >
            {BARCODE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={label} style={{ fontFamily: 'var(--font-mono)' }}>Notes</label>
          <Input name="notes" defaultValue={card?.notes} placeholder="optional" />
        </div>

        {cardNumber.trim() && (
          <div className="md:col-span-2 pt-1">
            <BarcodeDisplay value={cardNumber} format={format} />
          </div>
        )}

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
                    await setLoyaltyCardArchived(card._id, !card.archived);
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
                  const ok = await confirm({ title: 'Delete loyalty card', message: `Delete "${card.title}"? It moves to Trash.`, confirmLabel: 'Delete', danger: true });
                  if (ok)
                    startTransition(async () => {
                      await deleteLoyaltyCard(card._id);
                      onDeleted();
                    });
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
    </div>
  );
}
