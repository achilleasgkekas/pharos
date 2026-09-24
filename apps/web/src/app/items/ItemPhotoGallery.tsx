'use client';
import { useState, useRef, useTransition } from 'react';
import { useT } from '@/components/LocaleProvider';
import { ImagePlus, Trash2, Star, Loader2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { shrinkImage } from '@/lib/clientImage';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { uploadItemPhotos, deleteItemPhoto, setItemCover, fetchItemPhotos } from './actions';

function fileUrl(p: string) {
  return `/api/files/${p.split('/').map(encodeURIComponent).join('/')}`;
}

/** Product photo gallery: hero + thumbnails, with upload / delete / set-cover / AI fetch. */
export function ItemPhotoGallery({
  itemId,
  photos: initialPhotos,
  canFetch,
  onChange,
}: {
  itemId: string;
  photos: string[];
  canFetch: boolean;
  /** Reports every upload/delete/fetch/cover change to the parent, so a remount re-seeds from the new list (#245). */
  onChange?: (photos: string[]) => void;
}) {
  const [photos, setLocal] = useState<string[]>(initialPhotos);
  function setPhotos(next: string[]) {
    setLocal(next);
    onChange?.(next);
  }
  const [active, setActive] = useState(0);
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const hero = photos[active] ?? photos[0];

  function handleFetch() {
    setMsg(null);
    setFetching(true);
    startTransition(async () => {
      const r = await fetchItemPhotos(itemId);
      setFetching(false);
      setPhotos(r.photos);
      setMsg(r.ok ? `✓ Fetched ${r.added} image${r.added === 1 ? '' : 's'}` : (r.error ?? 'Failed'));
    });
  }

  const fetchBtn = canFetch && (
    <button
      type="button"
      onClick={handleFetch}
      disabled={fetching || uploading}
      title={t('it.searchPhotos')}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors disabled:opacity-50"
    >
      {fetching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {fetching ? 'Fetching…' : 'Fetch photos'}
    </button>
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of Array.from(files)) {
      try {
        fd.append('files', await shrinkImage(f, 1600));
      } catch {
        fd.append('files', f);
      }
    }
    const r = await uploadItemPhotos(itemId, fd);
    if (r.photos.length) setPhotos(r.photos);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleDelete(p: string) {
    const ok = await confirm({ title: 'Delete photo', message: 'Remove this photo?', confirmLabel: 'Delete', danger: true });
    if (ok)
      startTransition(async () => {
        const r = await deleteItemPhoto(itemId, p);
        setPhotos(r.photos);
        // Move the selection only once the delete has actually happened, and only as far as it
        // has to. Resetting to 0 up front meant a failed delete still threw you back to the
        // first photo, with the list unchanged — so the gallery said something had happened
        // when nothing had. Clamping keeps you where you were when a middle photo goes.
        setActive((i) => Math.min(i, Math.max(0, r.photos.length - 1)));
      });
  }

  const uploadBtn = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"
      >
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
        {uploading ? 'Uploading…' : 'Add photos'}
      </button>
    </>
  );

  // Empty state
  if (photos.length === 0) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || fetching}
          className="aspect-[4/3] w-full rounded-2xl border-2 border-dashed border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] bg-[color:var(--color-surface)] flex flex-col items-center justify-center gap-2 text-[color:var(--color-text-faint)] transition-colors"
        >
          <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          {uploading ? <Loader2 size={28} className="animate-spin" /> : <ImagePlus size={28} />}
          <span className="text-xs">{uploading ? 'Uploading…' : 'Add product photos'}</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {fetchBtn}
          {msg && <span className="text-[10px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Hero */}
      <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={fileUrl(hero)} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(hero)} alt="Product" className="w-full h-full object-contain" />
        </a>

        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => setActive((a) => (a - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => setActive((a) => (a + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
              <ChevronRight size={16} />
            </button>
            <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white" style={{ fontFamily: 'var(--font-mono)' }}>
              {active + 1}/{photos.length}
            </span>
          </>
        )}

        {/* Per-photo actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          {active !== 0 && (
            <button type="button" title={t('it.setCover')} onClick={() => startTransition(async () => { const r = await setItemCover(itemId, hero); setPhotos(r.photos); setActive(0); })} disabled={pending} className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75">
              <Star size={13} />
            </button>
          )}
          <button type="button" title={t('it.deletePhoto')} onClick={() => handleDelete(hero)} disabled={pending} className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-[color:var(--color-red)]">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Thumbnails + upload */}
      <div className="flex items-center gap-2 flex-wrap">
        {photos.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(i)}
            className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === active ? 'border-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] opacity-70 hover:opacity-100'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(p)} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
        {uploadBtn}
        {fetchBtn}
      </div>
      {msg && <p className="text-[10px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</p>}
    </div>
  );
}
