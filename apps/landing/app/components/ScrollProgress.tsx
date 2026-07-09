'use client';

import { useEffect, useRef } from 'react';

/**
 * A thin "lighthouse beam" that fills left-to-right across the very top of the
 * viewport as the reader scrolls through the page: a reading-progress
 * indicator. Complements ScrollSpy (which highlights the current nav section).
 *
 * Driven by a rAF-throttled scroll/resize listener writing a `scaleX(0..1)`
 * transform (transform-origin left), so it never triggers layout. Purely
 * decorative and progressive-enhancement: aria-hidden, no-ops during SSR, and
 * hides itself when the page is too short to scroll.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max <= 0) {
        // Nothing to scroll (e.g. very tall viewport): keep the beam dark.
        bar.style.transform = 'scaleX(0)';
        bar.style.opacity = '0';
        return;
      }
      const ratio = Math.min(1, Math.max(0, window.scrollY / max));
      bar.style.transform = `scaleX(${ratio})`;
      bar.style.opacity = ratio > 0.001 ? '1' : '0';
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="scroll-progress" aria-hidden="true">
      <div ref={barRef} className="scroll-progress-beam" />
    </div>
  );
}
