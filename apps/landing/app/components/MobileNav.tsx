'use client';

import { useEffect, useState } from 'react';

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
  { href: '#faq', label: 'FAQ' },
];

export function MobileNav({ githubUrl }: { githubUrl: string }) {
  const [open, setOpen] = useState(false);

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
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
        <nav className="drawer-panel" aria-label="Mobile">
          <div className="drawer-head">
            <span className="mono">Menu</span>
            <button
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
