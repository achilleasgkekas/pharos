'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// The root layout is the one layout shared by EVERY route in the app, including
// /admin/* and (saas)/account/*. Next's App Router only re-renders the segments that
// differ between two routes on a client-side navigation (Link click, router.push, or
// browser back/forward) — a shared ancestor layout does not re-execute. So a `chromeless`
// boolean computed once, server-side, from a headers()-read pathname would stay frozen at
// whatever it was on the page that was hard-loaded: the navbar would keep showing on
// /account/* after clicking into it from a product page, or stay hidden on a product page
// reached by clicking away from /admin. Confirmed live (2026-08-05): clicking Account →
// "Workspaces & account" from /items left the full SiteNav rendered on top of
// /account/workspace, which must be chrome-less.
//
// `usePathname()` is a client hook that subscribes to the CURRENT route and updates on
// every navigation, soft or hard — including back/forward, since Next's router drives it
// off the router's own state rather than a headers() snapshot from whichever request
// happened to render this layout. It also resolves correctly during SSR on a fresh load
// (no first-paint flash), so this replaces the old headers()-based check everywhere,
// rather than adding a second source of truth.
function isChromeless(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/setup' ||
    pathname === '/capture' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/account' ||
    pathname.startsWith('/account/')
  );
}

/** Renders `children` (the SiteNav + onboarding banner slot) except on chrome-less routes. */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isChromeless(pathname)) return null;
  return <>{children}</>;
}
