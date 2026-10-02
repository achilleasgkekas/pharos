'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { HeaderButton } from './PageHeader';

/**
 * Upload without a drop box taking half the screen (the redesign): an Upload button in the
 * page header, and on a computer a file dropped anywhere on the page. On a phone the button's
 * file picker already offers the camera, so there is no separate "Take photo".
 */

/** Drop files anywhere on the page. Shows a full-page target while files are dragged over
 *  the window; ignored while a dialog is open (it has its own upload). */
export function PageFileDrop({ onFiles, label, hint, disabled }: { onFiles: (files: FileList) => void; label: string; hint?: string; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  useEffect(() => {
    cb.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (disabled) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const dialogOpen = () => !!document.querySelector('[role="dialog"]');
    function enter(e: DragEvent) {
      if (!hasFiles(e) || dialogOpen()) return;
      depth.current += 1;
      setOver(true);
    }
    function leave(e: DragEvent) {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    }
    function overFn(e: DragEvent) {
      if (hasFiles(e) && !dialogOpen()) e.preventDefault();
    }
    function drop(e: DragEvent) {
      if (!hasFiles(e) || dialogOpen()) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer?.files.length) cb.current(e.dataTransfer.files);
    }
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [disabled]);

  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6" aria-hidden>
      <div className="w-full max-w-lg rounded-3xl border-2 border-dashed border-[color:var(--color-accent)] bg-[color:var(--color-surface)] px-6 py-12 text-center">
        <Upload size={32} className="mx-auto text-[color:var(--color-accent)]" />
        <p className="mt-3 text-base font-semibold">{label}</p>
        {hint && <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">{hint}</p>}
      </div>
    </div>
  );
}

/** The header's Upload button: a file picker (camera included on a phone). */
export function UploadButton({
  onFiles,
  accept,
  label,
  busy,
  multiple = true,
}: {
  onFiles: (files: FileList) => void;
  accept: string;
  label: string;
  busy?: boolean;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <HeaderButton icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} onClick={() => ref.current?.click()} disabled={busy} title={label}>
        {label}
      </HeaderButton>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
