'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type NavItem = { href: string; label: string; external?: boolean };

// Kept in sync with the desktop <nav> in page.tsx.
const ITEMS: NavItem[] = [
  { href: '#features', label: 'Features' },
  { href: '#ai', label: 'AI' },
  { href: '#who', label: 'Who' },
  { href: '#self-host', label: 'Self-host' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#compare', label: 'Compare' },
  { href: '#roadmap', label: 'Roadmap' },
  { href: '#faq', label: 'FAQ' },
];

export function MobileNav({ githubUrl, appUrl }: { githubUrl: string; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The drawer is rendered into <body>, not where this component sits.
  //
  // It lives inside the site header, and the header is a translucent bar with
  // `backdrop-filter: blur(12px)`. A backdrop-filter makes an element the CONTAINING BLOCK
  // for `position: fixed` descendants, so the drawer's `inset: 0` resolved against the
  // 64px-tall header instead of the viewport: the panel and the scrim were both clipped to
  // 64px, and every link below the drawer head spilled out of the panel with nothing painted
  // behind it. That is the "menu is transparent on mobile" report — the links appeared to
  // float over the page because they genuinely were.
  //
  // Measured live at 375px on 2026-08-04: drawer rect 375x64, not 375x812.
  //
  // A portal to <body> escapes the header's containing block entirely, which keeps the
  // frosted header AND gives the drawer the viewport it asks for. (The app's own SiteNav
  // documents this same trap and avoids it by refusing backdrop-filter on the navbar.)
  useEffect(() => setMounted(true), []);

  // Lock body scroll, close on Escape, and trap focus inside the drawer while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function focusable(): HTMLElement[] {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // Move focus into the drawer once it is rendered.
    const raf = requestAnimationFrame(() => closeRef.current?.focus());
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      // Return focus to the trigger when the drawer closes.
      burgerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={burgerRef}
        type="button"
        className="nav-burger"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-drawer"
        onClick={() => setOpen(true)}
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {mounted &&
        createPortal(
          <div
            id="mobile-drawer"
            className={`mobile-drawer${open ? ' is-open' : ''}`}
            hidden={!open}
          >
        <button
          type="button"
          className="drawer-scrim"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
        <nav className="drawer-panel" aria-label="Mobile" ref={panelRef}>
          <div className="drawer-head">
            <span className="mono">Menu</span>
            <button
              ref={closeRef}
              type="button"
              className="nav-burger"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {ITEMS.map((it) => (
            <a
              key={it.href}
              href={it.href}
              className="drawer-link"
              onClick={() => setOpen(false)}
            >
              {it.label}
            </a>
          ))}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="drawer-link"
            onClick={() => setOpen(false)}
          >
            GitHub ↗
          </a>
          <a
            href={`${appUrl}/account/login`}
            className="drawer-signin"
            onClick={() => setOpen(false)}
          >
            Sign in
          </a>
        </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
