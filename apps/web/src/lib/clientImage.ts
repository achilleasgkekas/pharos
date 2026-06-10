'use client';

/**
 * Downscale + recompress a large image in the browser before upload, so big
 * phone photos don't bloat storage or slow the AI. Non-images pass through.
 */
export async function shrinkImage(
  file: File,
  maxDim = 2200,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  // Already small enough
  if (file.size < 1_200_000) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // unsupported (e.g. HEIC on some browsers) — let the server handle it
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, maxDim / longest);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob || blob.size >= file.size) return file; // resizing didn't help

  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
