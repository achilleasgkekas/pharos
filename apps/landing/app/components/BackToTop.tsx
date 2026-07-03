'use client';

import { useEffect, useState } from 'react';

/**
 * Floating "back to top" button. Hidden until the reader scrolls past roughly
 * the first viewport, then fades in bottom-right. Clicking scrolls to the top
 * and moves keyboard focus onto the hero (#top) so screen readers announce the
 * jump. Honours prefers-reduced-motion (instant scroll instead of smooth).
 * Pure progressive enhancement: no-ops during SSR and if #top is missing.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > 800);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const top = document.getElementById('top');
    if (top) {
      // Focus the hero without a second scroll jump (scrollTo already handles it).
      top.focus({ preventScroll: true });
    }
  };

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' back-to-top-on' : ''}`}
      onClick={toTop}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
