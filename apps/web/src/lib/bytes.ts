// Human-readable byte sizes. PURE and client-safe (no DB, no next/*, no node builtins), so it
// can be unit-tested and imported from either a server or a client component.
//
// It lived in `components/saas/format.ts` until the SaaS was retired, which is why it existed
// for an operator dashboard; the self-hosted Settings → System panel reads it too, so it moved
// here rather than leaving with the rest of that folder.
//
// Defensive on purpose: a non-finite or negative input renders a sane zero rather than
// "NaN"/"-1 B", because these numbers sit in a health panel where a garbled value reads as a
// real (alarming) one.

/**
 * Human byte size (B/KB/MB/GB/TB/PB, base-1024). Non-finite or ≤0 → "0 B". One decimal for
 * KB..PB below 100, whole numbers for bytes and for values ≥100 in a unit.
 */
export function formatBytes(bytes: unknown): string {
  const v = Number(bytes);
  if (!Number.isFinite(v) || v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 || n >= 100 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}
