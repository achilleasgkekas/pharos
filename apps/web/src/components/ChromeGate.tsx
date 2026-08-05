'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// The root layout is the one layout shared by EVERY route in the app. Next's App Router
// only re-renders the segments that differ between two routes on a client-side navigation
// (Link click, router.push, or browser back/forward) — a shared ancestor layout does not
// re-execute. So a `chromeless` boolean computed once, server-side, from a headers()-read
// pathname would stay frozen at whatever it was on the page that was hard-loaded, rather
// than reflecting the route actually on screen.
//
// `usePathname()` is a client hook that subscribes to the CURRENT route and updates on
// every navigation, soft or hard — including back/forward, since Next's router drives it
// off the router's own state rather than a headers() snapshot from whichever request
// happened to render this layout. It also resolves correctly during SSR on a fresh load
// (no first-paint flash).
//
// SiteNav is deliberately ONE global bar for the whole app (product pages, the operator
// console, the SaaS account/workspace area) — Achilleas: "θέλω παντού το site nav... να
// είναι ένα για όλο το app". /admin and /account used to be excluded here and grew their
// own bespoke header (AdminNav's own logo+account-email bar, WorkspaceShell's own sign-out)
// instead — that duplication is what's being removed, not preserved with a working
// nav-freshness fix. Only the pages that exist OUTSIDE being "in" the app at all stay
// chrome-less: /login and /setup (no session context to hang a nav off yet — /setup signs
// you in mid-wizard, before there's anything to navigate to) and /capture (a tiny
// same-origin popup window where a full navbar would eat half its 440x640 real estate).
function isChromeless(pathname: string): boolean {
  return pathname === '/login' || pathname === '/setup' || pathname === '/capture';
}

/** Renders `children` (the SiteNav + onboarding banner slot) except on chrome-less routes. */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isChromeless(pathname)) return null;
  return <>{children}</>;
}
