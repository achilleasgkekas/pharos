export function PharosMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ color: 'var(--accent)' }}
    >
      {/* Beacon glow */}
      <circle className="beacon" cx="24" cy="11" r="7" fill="currentColor" opacity="0.5" />
      {/* Light rays */}
      <path
        d="M24 11 L6 5 M24 11 L42 5 M24 11 L4 15 M24 11 L44 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Lamp room */}
      <rect x="20" y="8" width="8" height="7" rx="1.5" fill="currentColor" />
      {/* Tower */}
      <path
        d="M19 16 H29 L31 40 H17 Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Tower stripes */}
      <path d="M18.5 22 H29.5 M18 30 H30" stroke="var(--bg)" strokeWidth="2" />
      {/* Base */}
      <rect x="14" y="40" width="20" height="4" rx="1.5" fill="currentColor" />
    </svg>
  );
}
