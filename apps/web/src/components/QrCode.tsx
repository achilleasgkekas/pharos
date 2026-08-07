'use client';
import { useEffect, useState } from 'react';

// Renders an otpauth:// enrollment URI as a scannable QR code, so setting up two-factor
// authentication is "point the phone at the screen" instead of typing a 32-character secret by
// hand. Dynamically imports `qrcode` so it never lands in the shared bundle — same lazy pattern
// as BarcodeDisplay/jsbarcode and the recharts charts elsewhere in the app.
//
// Always black-on-white regardless of the app's dark/light theme: a phone camera needs real
// contrast to lock on, and an inverted (light-on-dark) QR is unreadable to many scanners. Like
// BarcodeDisplay, this one surface deliberately ignores the theme tokens.
export function QrCode({ value, size = 176, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setSrc('');
    const v = value.trim();
    if (!v) return;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(v, {
          width: size * 2, // 2x so it stays crisp on retina and when a phone zooms in
          margin: 2, // the "quiet zone" — scanners need it, 2 modules is the spec minimum
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        }),
      )
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError('Could not draw the QR code — use the setup key below instead.');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!value.trim()) return null;

  if (error) {
    return <p className="text-xs text-[color:var(--color-red)]">{error}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-lg bg-white p-3"
        style={{ width: size + 24, height: size + 24 }}
        aria-busy={!src}
      >
        {src ? (
          // The alt text never contains the secret itself: a screen reader announcing the
          // enrollment URI out loud would read the shared key into the room.
          <img src={src} width={size} height={size} alt={label ?? 'QR code for your authenticator app'} />
        ) : null}
      </div>
    </div>
  );
}
