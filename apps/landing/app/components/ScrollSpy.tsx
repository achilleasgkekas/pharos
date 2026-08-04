'use client';

import { useEffect } from 'react';

// Section ids that have a matching nav anchor, in document order. Kept in sync
// with the <nav> in page.tsx and the drawer ITEMS in MobileNav.tsx.
const SECTIONS = ['features', 'ai', 'who', 'self-host', 'pricing', 'compare', 'roadmap', 'faq'];

/**
 * Highlights the nav link (desktop nav + mobile drawer) for the section the
 * reader is currently looking at. Server-rendered nav stays untouched; this
 * client component toggles a `.nav-active` class + `aria-current` on the
 * matching anchors as the page scrolls. No-ops if the anchors/sections are
 * missing, so it degrades gracefully.
 */
export function ScrollSpy() {
  useEffect(() => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a.navlink[href^="#"], a.drawer-link[href^="#"]',
      ),
    );
    if (anchors.length === 0) return;

    // section id -> every anchor pointing at it (a section can appear in both
    // the desktop nav and the drawer).
    const byId = new Map<string, HTMLAnchorElement[]>();
    for (const a of anchors) {
      const id = (a.getAttribute('href') ?? '').slice(1);
      if (!id) continue;
      (byId.get(id) ?? byId.set(id, []).get(id)!).push(a);
    }

    const sections = SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    let current = '';
    const setActive = (id: string) => {
      if (id === current) return;
      current = id;
      for (const [secId, list] of byId) {
        const on = secId === id;
        for (const a of list) {
          a.classList.toggle('nav-active', on);
          if (on) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
      }
    };

    // A thin band across the vertical middle of the viewport: a section is
    // "current" while it crosses that band. Among any that qualify, pick the
    // one whose top edge is nearest the viewport centre.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        let best = '';
        let bestDist = Infinity;
        const mid = window.innerHeight / 2;
        for (const id of visible) {
          const el = document.getElementById(id);
          if (!el) continue;
          const dist = Math.abs(el.getBoundingClientRect().top - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = id;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: '-48% 0px -48% 0px', threshold: 0 },
    );
    for (const s of sections) observer.observe(s);

    return () => observer.disconnect();
  }, []);

  return null;
}
