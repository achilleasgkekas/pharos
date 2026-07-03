import { ImageResponse } from 'next/og';

// Maskable PNG app icon for the PWA manifest / Android home screen (the SVG
// favicon covers modern browser tabs; Android launchers want a raster icon
// they can mask into a circle/squircle). Generated at build time via next/og
// and served at /icon. The lighthouse mark sits inside the central ~66% safe
// zone so aggressive launcher masks never clip it.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

const BG = '#0a0a0a';
const ACCENT = '#00ff88';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: ACCENT,
            opacity: 0.16,
            filter: 'blur(120px)',
          }}
        />
        {/* viewBox padded so the 48-unit mark occupies the central safe zone */}
        <svg width={512} height={512} viewBox="-12 -12 72 72" fill="none">
          <circle cx="24" cy="11" r="7" fill={ACCENT} opacity="0.5" />
          <path
            d="M24 11 L6 5 M24 11 L42 5 M24 11 L4 15 M24 11 L44 15"
            stroke={ACCENT}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.55"
          />
          <rect x="20" y="8" width="8" height="7" rx="1.5" fill={ACCENT} />
          <path d="M19 16 H29 L31 40 H17 Z" fill={ACCENT} opacity="0.9" />
          <path d="M18.5 22 H29.5 M18 30 H30" stroke={BG} strokeWidth="2" />
          <rect x="14" y="40" width="20" height="4" rx="1.5" fill={ACCENT} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
