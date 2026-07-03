'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Copy-to-clipboard button for the self-host quickstart code block. Copies the
 * raw command text (passed as `text`, kept separate from the colour-tokenised
 * markup in the <pre>) and flips to a "Copied" confirmation for a moment.
 * Pure progressive enhancement: only mounts when the Clipboard API is present,
 * so no-JS / SSR readers still see the code, just without the affordance.
 * Honours prefers-reduced-motion via the global transition override in CSS.
 */
export function CopyButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.clipboard);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!supported) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard write can be rejected (permissions / insecure context); the
      // code stays visible for manual selection, so fail quietly.
    }
  };

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copy-btn-done' : ''}`}
      onClick={copy}
      aria-label={copied ? 'Commands copied to clipboard' : 'Copy commands to clipboard'}
    >
      {copied ? (
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
