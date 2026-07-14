'use client';
import { useRef, useState, useTransition } from 'react';
import { useT } from '@/components/LocaleProvider';
import { FileText, Image as ImageIcon, File as FileIcon, Upload, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { uploadItemAttachments, deleteItemAttachment } from './actions';
import type { SerializedAttachment } from '@/types';

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/pdf') return FileText;
  return FileIcon;
}

/** Document / manual vault (P21): manuals, warranty certs, serial-number photos —
 *  an ongoing per-item repository, distinct from the product photo gallery above. */
export function ItemDocuments({ itemId, attachments: initial }: { itemId: string; attachments: SerializedAttachment[] }) {
  const [attachments, setAttachments] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const t = useT();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    const r = await uploadItemAttachments(itemId, fd);
    if (r.attachments.length) setAttachments(r.attachments);
    setUploading(false);
    if (!r.ok && r.error) setMsg(r.error);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleDelete(path: string) {
    const ok = await confirm({ title: 'Delete document', message: 'Remove this file?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteItemAttachment(itemId, path);
      setAttachments(r.attachments);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('it.documents')} {attachments.length > 0 && `· ${attachments.length}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : t('it.addDocument')}
        </button>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">{t('it.noDocuments')}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {attachments.map((a) => {
            const Icon = iconFor(a.mimeType);
            return (
              <div
                key={a.path}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]"
              >
                <Icon size={14} className="text-[color:var(--color-cyan)] shrink-0" />
                <a
                  href={fileUrl(a.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate text-xs hover:text-[color:var(--color-cyan)] transition-colors"
                  title={a.name}
                >
                  {a.name || a.path.split('/').pop()}
                </a>
                {a.size > 0 && (
                  <span
                    className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums shrink-0"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {fmtSize(a.size)}
                  </span>
                )}
                <a
                  href={fileUrl(a.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] shrink-0 transition-colors"
                  title={t('it.openArrow')}
                >
                  <ExternalLink size={13} />
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(a.path)}
                  disabled={pending}
                  className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] shrink-0 transition-colors disabled:opacity-50"
                  title={t('it.deleteDocument')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {msg && (
        <p className="text-[10px] text-[color:var(--color-red)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {msg}
        </p>
      )}
    </div>
  );
}
