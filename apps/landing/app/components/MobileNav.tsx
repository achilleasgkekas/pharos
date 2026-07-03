'use client';

import { useEffect, useRef, useState } from 'react';

type NavItem = { href: string; label: string; external?: boolean };

// Kept in sync with the desktop <nav> in page.tsx.
const ITEMS: NavItem[] = [
  { href: '#features', label: 'Features' },
  { href: '#ai', label: 'AI' },
  { href: '#mobile', label: 'Mobile' },
  { href: '#who', label: 'Who' },
  { href: '#self-host', label: 'Self-host' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#compare', label: 'Compare' },
  { href: '#roadmap', label: 'Roadmap' },
  { href: '#faq', label: 'FAQ' },
];

export function MobileNav({ githubUrl }: { githubUrl: string }) {
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
        </nav>
      </div>
    </>
  );
}
