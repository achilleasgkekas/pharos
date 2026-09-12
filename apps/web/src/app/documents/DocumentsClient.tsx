'use client';
import { useState, useMemo, useTransition } from 'react';
import { Plus, Trash2, Check, Archive, ArchiveRestore, Pencil, X, FileCheck2, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { documentDaysUntilExpiry, documentStatus, type DocStatus } from '@/lib/documentExpiry';
import type { SerializedDocument } from '@/types';
import { createDocument, updateDocument, deleteDocument, setDocumentArchived } from './actions';

// P42 — personal document expiry tracker. Inline English wording (like BillsClient), which
// is not yet run through i18n; only the nav label is translated.

const inputClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const STATUS_STYLE: Record<DocStatus, { label: (d: number) => string; color: string }> = {
  expired: { label: (d) => `expired ${-d}d ago`, color: 'var(--color-red)' },
  soon: { label: (d) => (d === 0 ? 'expires today' : `in ${d}d`), color: 'var(--color-gold)' },
  ok: { label: (d) => `in ${d}d`, color: 'var(--color-text-faint)' },
};

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toInputDate = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

type Draft = Partial<SerializedDocument> | null;

export function DocumentsClient({ documents, leadDays }: { documents: SerializedDocument[]; leadDays: number }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Draft>(null); // {} = new, {…} = edit, null = closed
  const [error, setError] = useState('');

  const visible = useMemo(
    () => documents.filter((d) => showArchived || !d.archived),
    [documents, showArchived]
  );
  const archivedCount = documents.filter((d) => d.archived).length;

  function openNew() {
    setError('');
    setEditing({});
  }
  function openEdit(d: SerializedDocument) {
    setError('');
    setEditing(d);
  }

  function submit(fd: FormData) {
    setError('');
    startTransition(async () => {
      const id = editing && editing._id;
      const r = id ? await updateDocument(id, fd) : await createDocument(fd);
      if (r.ok) setEditing(null);
      else setError(r.error || 'Could not save');
    });
  }

  function remove(d: SerializedDocument) {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete document',
        message: `Delete “${d.title}”? It moves to Trash (restorable for 30 days).`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) await deleteDocument(d._id);
    });
  }

  return (
    <main className="max-w-[1100px] mx-auto px-4 py-6 pb-24">
      <div className="mb-6 pb-4 border-b border-[color:var(--color-border)] flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <IdCard size={26} className="text-[color:var(--color-accent)]" /> Documents
          </h1>
          <span className="text-sm text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {visible.length} shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] px-2"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {showArchived ? 'hide archived' : `show archived (${archivedCount})`}
            </button>
          )}
          <Button variant="primary" onClick={openNew}>
            <Plus size={16} strokeWidth={2.5} /> New document
          </Button>
        </div>
      </div>

      <p className="text-xs text-[color:var(--color-text-dim)] -mt-3 mb-5">
        Passports, IDs, driving licences, residence permits, vehicle registration/MOT — anything with a renewal deadline.
        You get an alert when one is within {leadDays} days of expiring (Settings → Notifications).
      </p>

      {visible.length === 0 ? (
        <div className="py-20 text-center text-[color:var(--color-text-faint)]">
          <FileCheck2 size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No documents yet. Add your passport, ID, or licence to track its expiry.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => {
            const days = documentDaysUntilExpiry(d.expiryDate);
            const status = documentStatus(days, leadDays);
            const s = STATUS_STYLE[status];
            return (
              <div
                key={d._id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  d.archived ? 'border-[color:var(--color-border)] opacity-60' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.title}</span>
                    {d.type && <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.type}</span>}
                    {d.holder && <span className="text-[10px] text-[color:var(--color-text-dim)]">· {d.holder}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span>exp {fmtDate(d.expiryDate)}</span>
                    {days !== null && <span style={{ color: s.color }}>· {s.label(days)}</span>}
                    {d.number && <span className="truncate">· #{d.number}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(d)} title="Edit" className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Pencil size={14} /></button>
                  <button
                    onClick={() => startTransition(async () => { await setDocumentArchived(d._id, !d.archived); })}
                    title={d.archived ? 'Unarchive' : 'Archive'}
                    className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
                  >
                    {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                  <button onClick={() => remove(d)} title="Delete" className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing._id ? 'Edit document' : 'New document'} size="md">
        <form
          action={submit}
          className="space-y-3"
        >
          <Field label="Title *">
            <Input name="title" defaultValue={editing?.title || ''} placeholder="Passport" required />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Type">
              <Input name="type" defaultValue={editing?.type || ''} placeholder="passport / id / licence" />
            </Field>
            <Field label="Holder">
              <Input name="holder" defaultValue={editing?.holder || ''} placeholder="who it belongs to" />
            </Field>
            <Field label="Document number">
              <Input name="number" defaultValue={editing?.number || ''} />
            </Field>
            <Field label="Issued (optional)">
              <input type="date" name="issuedAt" defaultValue={toInputDate(editing?.issuedAt ?? null)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
            </Field>
            <Field label="Expires *">
              <input type="date" name="expiryDate" defaultValue={toInputDate(editing?.expiryDate ?? null)} required className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" defaultValue={editing?.notes || ''} rows={2} className={inputClass} />
          </Field>
          {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}><X size={14} /> Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Check size={14} /> {editing && editing._id ? 'Save' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
