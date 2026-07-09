'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Inline "Copy link" affordance rendered at the end of each FAQ answer. It pairs
 * with FaqDeepLink (which opens the matching <details> when the URL hash points
 * at it): this button copies the shareable deep link to that exact answer, so a
 * reader (or a support reply) can hand someone a URL that lands them expanded on
 * the right question.
 *
 * The link is built client-side from the live origin + path (falling back to the
 * canonical id anchor), so it stays correct on localhost, preview deploys, and
 * production without baking a base URL in. Clicking also updates the address bar
 * hash (replaceState, no history spam) to match.
 *
 * Pure progressive enhancement: only mounts when the Clipboard API is present,
 * so no-JS / SSR readers keep a fully usable FAQ, just without the shortcut.
 */
export function FaqCopyLink({ id }: { id: string }) {
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
    const { origin, pathname } = window.location;
    const url = `${origin}${pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      if (window.location.hash.slice(1) !== id) {
        window.history.replaceState(null, '', `#${id}`);
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard write can be rejected (permissions / insecure context); the
      // answer and its hash anchor remain usable, so fail quietly.
    }
  };

  return (
    <button
      type="button"
      className={`faq-copy${copied ? ' faq-copy-done' : ''}`}
      onClick={copy}
      aria-label={copied ? 'Link to this answer copied' : 'Copy a link to this answer'}
    >
      {copied ? (
        <svg
          width={13}
          height={13}
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
          width={13}
          height={13}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )}
      <span>{copied ? 'Copied' : 'Copy link'}</span>
    </button>
  );
}
