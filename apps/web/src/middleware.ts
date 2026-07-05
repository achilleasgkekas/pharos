import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, signSession, shouldRefresh, sessionCookieOptions } from '@/lib/session';

// Auth gate. Runs on the Edge runtime, so it imports ONLY lib/session.ts (jose —
// no node:crypto, no Mongoose). First-run detection (zero users) is NOT done here
// (can't reach Mongo at the edge) — the /login page redirects to /setup instead.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // Forward the current path to Server Components. The root layout reads it to keep
  // /login and /setup chrome-less (no navbar/banner) even once the setup wizard
  // signs you in mid-flow — getCurrentUser() alone can't tell those pages apart.
  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname);
  // Forward the request host to Server Components / Server Actions so the node-side tenant
  // resolver (lib/tenancy/request.ts) can derive the tenant from the subdomain / custom
  // domain. Edge-safe (pure header copy, no Mongo). Harmless when SAAS_MODE is off — nothing
  // reads it in the self-hosted app.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) headers.set('x-tenant-host', host);
  const pass = () => NextResponse.next({ request: { headers } });

  if (claims) {
    const res = pass();
    // Sliding idle window: re-issue the cookie once it's past halfway, so active use
    // keeps you signed in but an idle session expires after SESSION_IDLE_HOURS.
    if (shouldRefresh(claims.exp)) {
      res.cookies.set(SESSION_COOKIE, await signSession(claims), sessionCookieOptions());
    }
    return res;
  }

  // Public, chrome-less auth pages — allow through without a redirect (no session yet).
  if (pathname === '/login' || pathname === '/setup') return pass();

  // API + file requests (incl. /api/files): 401, never an HTML redirect — a login
  // page rendered into an <img>/<iframe>/fetch would be confusing and leak nothing.
  if (pathname.startsWith('/api/')) {
    // The mobile app fetches /api/files with a Bearer token (it has no session cookie).
    // Let those through; the route itself validates the token (Node runtime — the edge
    // can't reach Mongo). Everything else without a session stays 401.
    const hasBearer = /^Bearer\s+/i.test(req.headers.get('authorization') || '');
    if (hasBearer && pathname.startsWith('/api/files/')) return pass();
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Gate everything EXCEPT: Next internals, the icon/manifest, the auth-action
  // routes (/api/auth/*), the MCP endpoint (does its own bearer auth — a connector
  // has no cookie), and robots. /login and /setup ARE matched now (so the middleware
  // can stamp x-pathname) but pass straight through unauthenticated. Crucially this
  // does NOT exclude all of /api — /api/files (receipts/PDFs) MUST stay gated.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/auth|api/mcp|api/v1|robots.txt).*)',
  ],
};
