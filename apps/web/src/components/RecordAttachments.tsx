'use client';
import { useRef, useState, useTransition } from 'react';
import { ExternalLink, File as FileIcon, FileText, Image as ImageIcon, Link2, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { addAttachmentFiles, addAttachmentLink, removeAttachment } from '@/app/attachmentActions';
import type { AttachmentKind } from '@/lib/attachments';
import type { SerializedAttachment } from '@/types';

const fileUrl = (p: string) => `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function iconFor(a: SerializedAttachment) {
  if (a.url) return Link2;
  if (a.mimeType.startsWith('image/')) return ImageIcon;
  if (a.mimeType === 'application/pdf') return FileText;
  return FileIcon;
}

/**
 * "Files & links" for any record that keeps them: a manual PDF, the photo of a warranty card,
 * a contract, or a link to the manual online. Uploads and links save straight away, so the
 * block works the same inside every dialog, whatever that dialog's own Save does.
 */
export function RecordAttachments({
  kind,
  id,
  attachments: initial,
  onChange,
  title,
}: {
  kind: AttachmentKind;
  id: string;
  attachments: SerializedAttachment[];
  /** Reports every change, so a parent that re-renders from its own copy stays in step. */
  onChange?: (attachments: SerializedAttachment[]) => void;
  title?: string;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [attachments, setLocal] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function apply(next: SerializedAttachment[]) {
    setLocal(next);
    onChange?.(next);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMsg('');
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    try {
      const r = await addAttachmentFiles(kind, id, fd);
      apply(r.attachments);
      if (!r.ok && r.error) setMsg(r.error);
    } catch (e) {
      setMsg((e as Error).message || t('common.failed'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function saveLink() {
    setMsg('');
    start(async () => {
      const r = await addAttachmentLink(kind, id, url, label);
      apply(r.attachments);
      if (!r.ok) setMsg(r.error || t('common.failed'));
      else {
        setUrl('');
        setLabel('');
        setLinkOpen(false);
      }
    });
  }

  async function remove(a: SerializedAttachment) {
    const ok = await confirm({
      title: t('att.removeTitle'),
      message: t('att.removeBody', { name: a.name || host(a.url || '') }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const r = await removeAttachment(kind, id, a.path || a.url || '');
      apply(r.attachments);
    });
  }

  const btn =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-xs text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)] disabled:opacity-50';

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {title ?? t('att.title')}
          {attachments.length > 0 && ` · ${attachments.length}`}
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button type="button" onClick={() => setLinkOpen((v) => !v)} className={btn} aria-expanded={linkOpen}>
            <Link2 size={13} /> {t('att.addLink')}
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={btn}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {t('att.addFile')}
          </button>
        </div>
      </div>

      {linkOpen && (
        <div className="mb-2 flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-2 sm:flex-row sm:items-center">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('att.urlPlaceholder')}
            inputMode="url"
            aria-label={t('att.url')}
            className="sm:flex-[2]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (url.trim()) saveLink();
              }
            }}
          />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('att.labelPlaceholder')} aria-label={t('att.label')} className="sm:flex-1" />
          <div className="flex gap-2">
            <button type="button" onClick={saveLink} disabled={!url.trim() || pending} className={btn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {t('common.add')}
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} aria-label={t('common.close')} className={btn}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">{t('att.empty')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attachments.map((a) => {
            const Icon = iconFor(a);
            const href = a.url || fileUrl(a.path);
            const key = a.path || a.url || a.name;
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
                <Icon size={14} className="shrink-0 text-[color:var(--color-cyan)]" />
                <a href={href} target="_blank" rel="noopener noreferrer" title={a.url || a.name} className="min-w-0 flex-1 truncate text-xs transition-colors hover:text-[color:var(--color-cyan)]">
                  {a.name || (a.url ? host(a.url) : a.path.split('/').pop())}
                </a>
                <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {a.url ? host(a.url) : fmtSize(a.size)}
                </span>
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t('att.open')} title={t('att.open')} className="shrink-0 text-[color:var(--color-text-faint)] transition-colors hover:text-[color:var(--color-cyan)]">
                  <ExternalLink size={13} />
                </a>
                <button type="button" onClick={() => remove(a)} disabled={pending} aria-label={t('common.delete')} title={t('common.delete')} className="shrink-0 text-[color:var(--color-text-faint)] transition-colors hover:text-[color:var(--color-red)] disabled:opacity-50">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="mt-1.5 text-[11px] text-[color:var(--color-red)]">{msg}</p>}
    </div>
  );
}
