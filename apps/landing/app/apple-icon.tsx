import { ImageResponse } from 'next/og';

// iOS home-screen icon (Apple ignores SVG favicons, so it needs a real PNG).
// Generated at build time via next/og; Next auto-emits the
// <link rel="apple-touch-icon"> tag. Full-bleed brand background because iOS
// applies its own rounded-corner mask over the whole tile.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const BG = '#0a0a0a';
const ACCENT = '#00ff88';

export default function AppleIcon() {
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
        {/* Ambient accent glow behind the mark */}
        <div
          style={{
            position: 'absolute',
            top: -20,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: ACCENT,
            opacity: 0.18,
            filter: 'blur(48px)',
          }}
        />
        <svg width={116} height={116} viewBox="0 0 48 48" fill="none">
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
