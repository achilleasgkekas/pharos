import { afterEach, describe, expect, it, vi } from 'vitest';
import { shrinkImage } from './clientImage';

/**
 * Coverage for the pass-through guards of the browser image downscaler used by
 * every upload path (receipts, expenses, shopping-list, voucher/receipt scan).
 *
 * The core resize path needs a real Canvas/ImageBitmap and can't run under the
 * node test environment, but the four early-exit branches are pure and are the
 * data-integrity contract worth locking: when shrinkImage decides NOT to (or
 * CAN'T) recompress, it must return the ORIGINAL file reference untouched, never
 * a re-encoded / dropped / null result. A future "optimization" that started
 * recompressing PDFs, flattened gif animation, or lost the original on an
 * unsupported codec (e.g. HEIC) would corrupt uploads silently — these tests
 * catch that.
 *
 * `createImageBitmap` is stubbed rather than relied-upon-absent so the branch
 * assertions are deterministic regardless of test env, and so the guard tests
 * can prove the bitmap work is never even reached.
 */

// Guards only read `.type` and `.size` (and never touch `.name`, which is used
// solely in the final File constructor we never reach), so a lightweight cast
// lets us set an exact size without allocating >1.2MB of bytes.
function fakeFile(type: string, size: number): File {
  return { type, size, name: 'photo.png' } as unknown as File;
}

const LARGE = 1_500_000; // above the 1.2MB "already small enough" threshold

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shrinkImage — pass-through guards', () => {
  it('returns non-image files unchanged without attempting to decode', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const pdf = fakeFile('application/pdf', LARGE);

    const out = await shrinkImage(pdf);

    expect(out).toBe(pdf); // same reference, not re-encoded
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns gifs unchanged even when large (never flattens animation)', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const gif = fakeFile('image/gif', LARGE);

    const out = await shrinkImage(gif);

    expect(out).toBe(gif);
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns already-small images unchanged (below the 1.2MB threshold)', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const small = fakeFile('image/jpeg', 1_199_999);

    const out = await shrinkImage(small);

    expect(out).toBe(small);
    expect(decode).not.toHaveBeenCalled();
  });

  it('treats exactly 1.2MB as NOT small (boundary is a strict <)', async () => {
    // At the threshold it proceeds past the small-file guard into decode; with
    // decode throwing it falls through to the unsupported-codec fallback below,
    // which still returns the original — so we assert the guard did NOT short it.
    const decode = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('createImageBitmap', decode);
    const atThreshold = fakeFile('image/jpeg', 1_200_000);

    const out = await shrinkImage(atThreshold);

    expect(out).toBe(atThreshold);
    expect(decode).toHaveBeenCalledTimes(1); // it got past the small-file guard
  });

  it('returns the original when the image cannot be decoded (e.g. HEIC)', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('unsupported codec'));
    vi.stubGlobal('createImageBitmap', decode);
    const heic = fakeFile('image/heic', LARGE);

    const out = await shrinkImage(heic);

    expect(out).toBe(heic); // let the server handle it, don't drop it
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('honours a custom max dimension / quality without touching the guard result', async () => {
    // Passing overrides must not change the pass-through behaviour for a small file.
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const small = fakeFile('image/png', 500_000);

    const out = await shrinkImage(small, 1000, 0.6);

    expect(out).toBe(small);
    expect(decode).not.toHaveBeenCalled();
  });
});
