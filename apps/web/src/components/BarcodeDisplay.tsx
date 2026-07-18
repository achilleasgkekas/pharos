'use client';
import { useEffect, useRef, useState } from 'react';
import type { BarcodeFormat } from '@/lib/loyaltyCard';

// P20 — renders a scannable barcode client-side via jsbarcode (dynamically
// imported so it never lands in the shared bundle — same lazy pattern as the
// recharts charts elsewhere in the app). Always black-on-white regardless of
// the app's dark/light theme: a real checkout scanner needs dark bars on a
// light background to read reliably, so this one surface deliberately ignores
// the theme tokens.
export function BarcodeDisplay({ value, format, height = 70 }: { value: string; format: BarcodeFormat; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    const v = value.trim();
    if (!v || !svgRef.current) return;
    import('jsbarcode')
      .then(({ default: JsBarcode }) => {
        if (cancelled || !svgRef.current) return;
        JsBarcode(svgRef.current, v, {
          format,
          displayValue: true,
          height,
          margin: 8,
          background: '#ffffff',
          lineColor: '#000000',
        });
      })
      .catch(() => {
        if (!cancelled) setError(`Can't render "${v}" as ${format} — try a different format or check the card number.`);
      });
    return () => {
      cancelled = true;
    };
  }, [value, format, height]);

  if (!value.trim()) return <p className="text-xs text-[color:var(--color-text-faint)]">Enter a card number to preview the barcode.</p>;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-lg bg-white p-3 max-w-full overflow-x-auto">
        <svg ref={svgRef} />
      </div>
      {error && <p className="text-xs text-[color:var(--color-red)] text-center">{error}</p>}
    </div>
  );
}
