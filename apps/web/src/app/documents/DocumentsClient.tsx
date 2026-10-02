'use client';
import { PAGE_MAIN, PageHeader, HeaderButton, PrimaryAction } from '@/components/ui/PageHeader';
import { useState, useMemo, useTransition } from 'react';
import { Trash2, Check, Archive, ArchiveRestore, Pencil, X, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { documentDaysUntilExpiry, documentStatus, type DocStatus } from '@/lib/documentExpiry';
import type { SerializedDocument } from '@/types';
import type { TFunc } from '@/lib/i18n';
import { createDocument, updateDocument, deleteDocument, setDocumentArchived } from './actions';
import { addAttachmentFiles } from '@/app/attachmentActions';
import { ScanFileButton } from '@/components/ScanFileButton';
import type { DocumentScan } from '@/lib/homeScan';
import { formatDate } from '@/lib/i18n/format';
import { useLocale, useT } from '@/components/LocaleProvider';
import { RecordAttachments } from '@/components/RecordAttachments';

// P42: personal document expiry tracker.

const STATUS_STYLE: Record<DocStatus, { label: (d: number, t: TFunc) => string; color: string }> = {
  expired: { label: (d, t) => t('doc.expiredAgo', { n: -d }), color: 'var(--color-red)' },
  soon: { label: (d, t) => (d === 0 ? t('doc.expiresToday') : t('common.inDays', { n: d })), color: 'var(--color-gold)' },
  ok: { label: (d, t) => t('common.inDays', { n: d }), color: 'var(--color-text-faint)' },
};

const fmtDate = (s: string | null, locale: string) => formatDate(s, locale, { day: '2-digit', month: 'short', year: 'numeric' }, '—');

const toInputDate = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

type Draft = Partial<SerializedDocument> | null;

export function DocumentsClient({ documents, leadDays, scanOn = false }: { documents: SerializedDocument[]; leadDays: number; scanOn?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Draft>(null); // {} = new, {…} = edit, null = closed
  const [error, setError] = useState('');
  // A scan prefills the form (remounted by `formKey`, the inputs are uncontrolled) and its file
  // is kept with the document once it is saved.
  const [formKey, setFormKey] = useState(0);
  const [scannedFile, setScannedFile] = useState<File | null>(null);

  const visible = useMemo(
    () => documents.filter((d) => showArchived || !d.archived),
    [documents, showArchived]
  );
  const archivedCount = documents.filter((d) => d.archived).length;

  function openNew() {
    setError('');
    setScannedFile(null);
    setEditing({});
  }
  function openEdit(d: SerializedDocument) {
    setError('');
    setScannedFile(null);
    setEditing(d);
  }

  function applyScan(d: DocumentScan, file: File) {
    setEditing((prev) => {
      const next: Partial<SerializedDocument> = { ...(prev || {}) };
      if (d.title && !prev?.title) next.title = d.title;
      if (d.type && !prev?.type) next.type = d.type;
      if (d.holder && !prev?.holder) next.holder = d.holder;
      if (d.number && !prev?.number) next.number = d.number;
      if (d.issuedAt) next.issuedAt = d.issuedAt;
      if (d.expiryDate) next.expiryDate = d.expiryDate;
      return next;
    });
    setScannedFile(file);
    setFormKey((k) => k + 1);
  }

  function submit(fd: FormData) {
    setError('');
    startTransition(async () => {
      const id = editing && editing._id;
      const r = id ? await updateDocument(id, fd) : await createDocument(fd);
      if (!r.ok) return setError(r.error || t('common.saveFailed'));
      const savedId = editing?._id || (r as { id?: string }).id;
      if (scannedFile && savedId) {
        const files = new FormData();
        files.append('files', scannedFile);
        await addAttachmentFiles('document', savedId, files).catch(() => {});
      }
      setScannedFile(null);
      setEditing(null);
    });
  }

  function remove(d: SerializedDocument) {
    startTransition(async () => {
      const ok = await confirm({
        title: t('doc.deleteTitle'),
        message: t('doc.deleteBody', { title: d.title }),
        confirmLabel: t('common.delete'),
        danger: true,
      });
      if (ok) await deleteDocument(d._id);
    });
  }

  return (
    <main className={PAGE_MAIN}>
      <PageHeader
        title={t('nav.documents')}
        count={t('common.shown', { n: visible.length })}
        subtitle={t('doc.subtitle', { n: leadDays })}
      >
        {archivedCount > 0 && (
          <HeaderButton icon={<Archive size={14} />} aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? t('common.hideArchived') : t('common.showArchived', { n: archivedCount })}
          </HeaderButton>
        )}
        <PrimaryAction onClick={openNew} />
      </PageHeader>

      {visible.length === 0 ? (
        <EmptyState icon={<IdCard />} title={t('doc.empty')} />
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
                  'flex items-center gap-3 rounded-xl border bg-[color:var(--color-surface)] px-3 py-2.5 transition-colors',
                  d.archived ? 'border-[color:var(--color-border)] opacity-60' : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{d.title}</span>
                    {d.type && <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.type}</span>}
                    {d.holder && <span className="text-[11px] text-[color:var(--color-text-dim)]">· {d.holder}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span>{t('doc.expShort', { date: fmtDate(d.expiryDate, locale) })}</span>
                    {days !== null && <span style={{ color: s.color }}>· {s.label(days, t)}</span>}
                    {d.number && <span className="truncate">· #{d.number}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(d)} title={t('common.edit')} aria-label={t('common.edit')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)]"><Pencil size={14} /></button>
                  <button
                    onClick={() => startTransition(async () => { await setDocumentArchived(d._id, !d.archived); })}
                    title={d.archived ? t('common.unarchive') : t('common.archive')}
                    aria-label={d.archived ? t('common.unarchive') : t('common.archive')}
                    className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
                  >
                    {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                  <button onClick={() => remove(d)} title={t('common.delete')} aria-label={t('common.delete')} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing._id ? t('doc.edit') : t('doc.new')} size="md">
        {/* Outside the keyed form, so its "filled in" note survives the remount a scan causes. */}
        {scanOn && (
          <div className="mb-3">
            <ScanFileButton kind="document" label={t('doc.scan')} onResult={(r, file) => r.kind === 'document' && applyScan(r.data, file)} />
          </div>
        )}
        <form
          key={formKey}
          action={submit}
          className="space-y-3"
        >
          <Field label={t('doc.fTitle')}>
            <Input name="title" defaultValue={editing?.title || ''} placeholder={t('doc.titleHint')} required />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t('common.type')}>
              <Input name="type" defaultValue={editing?.type || ''} placeholder={t('doc.typeHint')} />
            </Field>
            <Field label={t('doc.fHolder')}>
              <Input name="holder" defaultValue={editing?.holder || ''} placeholder={t('doc.holderHint')} />
            </Field>
            <Field label={t('doc.fNumber')}>
              <Input name="number" defaultValue={editing?.number || ''} />
            </Field>
            <Field label={t('doc.fIssued')}>
              <DateInput name="issuedAt" value={toInputDate(editing?.issuedAt ?? null)} onValueChange={(v) => setEditing(prev => ({ ...(prev || {}), issuedAt: v }))} className={controlClass} />
            </Field>
            <Field label={t('doc.fExpires')}>
              <DateInput name="expiryDate" required value={toInputDate(editing?.expiryDate ?? null)} onValueChange={(v) => setEditing(prev => ({ ...(prev || {}), expiryDate: v }))} className={controlClass} />
            </Field>
          </div>
          <Field label={t('v.fNotes')}>
            <textarea name="notes" defaultValue={editing?.notes || ''} rows={2} className={controlClass} />
          </Field>
          {error && <p className="text-xs text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}><X size={14} /> {t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              <Check size={14} /> {editing && editing._id ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </form>
        {editing?._id && (
          <div className="mt-5 border-t border-[color:var(--color-border)] pt-4">
            <RecordAttachments kind="document" id={editing._id} attachments={editing.attachments ?? []} />
          </div>
        )}
      </Modal>
    </main>
  );
}
