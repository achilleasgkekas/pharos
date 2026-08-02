import { ImageResponse } from 'next/og';

// Branded Open Graph card, generated at build time (next/og).
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'PHAROS: one light over everything you run';

const BG = '#0a0a0a';
const SURFACE = '#141414';
const ACCENT = '#00ff88';
const CYAN = '#00d4ff';
const TEXT = '#f5f5f5';
const DIM = '#999999';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: '72px 80px',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Ambient accent glow, top-right */}
        <div
          style={{
            position: 'absolute',
            top: -220,
            right: -180,
            width: 620,
            height: 620,
            borderRadius: '50%',
            background: ACCENT,
            opacity: 0.16,
            filter: 'blur(120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -260,
            left: -160,
            width: 560,
            height: 560,
            borderRadius: '50%',
            background: CYAN,
            opacity: 0.12,
            filter: 'blur(120px)',
          }}
        />

        {/* Top row: lighthouse mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width={96} height={96} viewBox="0 0 48 48" fill="none">
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
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: 6,
              color: TEXT,
            }}
          >
            PHAROS
          </div>
        </div>

        {/* Headline block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.05,
              color: TEXT,
              maxWidth: 940,
            }}
          >
            One light over everything you run.
          </div>
          <div style={{ fontSize: 34, color: DIM, maxWidth: 900 }}>
            A personal hub: inventory, receipts with AI, expenses,
            installments, subscriptions, and your network.
          </div>
        </div>

        {/* Footer row: chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {['Self-hosted or managed', 'Open-source · AGPL-3.0', 'Privacy-first'].map(
            (chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  fontSize: 26,
                  color: ACCENT,
                  background: SURFACE,
                  border: `1px solid ${ACCENT}33`,
                  borderRadius: 999,
                  padding: '10px 24px',
                }}
              >
                {chip}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
