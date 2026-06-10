/**
 * Pharos brand mark — a minimal lighthouse with a pulsing beacon. Single-color
 * (uses currentColor), so the parent sets the hue (brand accent). Self-contained
 * SMIL pulse so it works anywhere without extra CSS.
 */
export function PharosMark({ size = 22, className, pulse = true }: { size?: number; className?: string; pulse?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, currentColor 45%, transparent))' }}
    >
      {/* beams */}
      <path d="M12 7 L4.5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M12 7 L19.5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* tower */}
      <path d="M9.4 20.5 L10.4 10.5 H13.6 L14.6 20.5 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      {/* gallery platform under the light */}
      <path d="M9.7 14.6 H14.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.9 10.5 H14.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* base */}
      <path d="M7.6 20.5 H16.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* pulsing beacon halo */}
      <circle cx="12" cy="7.4" r="3" fill="currentColor" opacity="0.22">
        {pulse && <animate attributeName="opacity" values="0.1;0.32;0.1" dur="2.6s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="r" values="2.7;3.7;2.7" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      {/* light */}
      <circle cx="12" cy="7.4" r="1.9" fill="currentColor" />
    </svg>
  );
}
