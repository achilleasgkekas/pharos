import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, signSession, shouldRefresh, sessionCookieOptions } from '@/lib/session';

// Auth gate. Runs on the Edge runtime, so it imports ONLY lib/session.ts (jose —
// no node:crypto, no Mongoose). First-run detection (zero users) is NOT done here
// (can't reach Mongo at the edge) — the /login page redirects to /setup instead.
export async function middleware(req: NextRequest) {
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    const res = NextResponse.next();
    // Sliding idle window: re-issue the cookie once it's past halfway, so active use
    // keeps you signed in but an idle session expires after SESSION_IDLE_HOURS.
    if (shouldRefresh(claims.exp)) {
      res.cookies.set(SESSION_COOKIE, await signSession(claims), sessionCookieOptions());
    }
    return res;
  }

  const { pathname, search } = req.nextUrl;
  // API + file requests (incl. /api/files): 401, never an HTML redirect — a login
  // page rendered into an <img>/<iframe>/fetch would be confusing and leak nothing.
  if (pathname.startsWith('/api/')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Gate everything EXCEPT: Next internals, the icon/manifest, the public auth
  // routes (/login, /setup, /api/auth/*), the MCP endpoint (does its own bearer
  // auth — a connector has no cookie), and robots. Crucially this does NOT exclude
  // all of /api — /api/files (receipts/PDFs) MUST stay gated.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|login|setup|api/auth|api/mcp|robots.txt).*)',
  ],
};
