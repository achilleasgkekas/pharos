// Pharos palette (mirrors the web app's design tokens, apps/web/src/app/globals.css:3-23).
export const C = {
  bg: '#0a0a0a',
  surface: '#141414',
  surface2: '#1c1c1c',
  surface3: '#242424',
  border: '#2a2a2a',
  borderLight: '#353535',
  text: '#f5f5f5',
  dim: '#999999',
  faint: '#666666',
  accent: '#00ff88',
  cyan: '#00d4ff',
  red: '#ff4757',
  gold: '#ffd93d',
  purple: '#a55eea',
  orange: '#ffa502',
  onAccent: '#000', // text/icon color on accent/cyan/gold fills
} as const;

// Spacing scale (px) — use instead of ad-hoc paddings/gaps.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Corner radii — the 3 values used inconsistently across screens.
export const RADIUS = { sm: 10, md: 12, lg: 14 } as const;

// Font sizes — the recurring scale across screens.
export const SIZE = { xs: 11, sm: 13, base: 14, md: 15, lg: 16, xl: 19 } as const;

/**
 * Tint a theme color at a given opacity (0..1), like the web's
 * `color-mix(in srgb, var(--color-x) N%, transparent)` glow helpers.
 * Accepts 3- or 6-digit hex; returns an rgba() string.
 */
export function alpha(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
