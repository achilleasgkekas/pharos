import { readFile } from '@/lib/storage';
import { recacheByPath } from '@/lib/mirror';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { apiTenant, bearerUser } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { User as UserModel } from '@/models/User';
import { currentModel } from '@/lib/tenancy/connection';
import { withTenant } from '@/lib/tenancy/current';
import { saasMode } from '@/lib/tenancy/saasMode';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  pdf: 'application/pdf',
  // Email-body receipts are stored as .html — serve as text/html so they RENDER in
  // the detail iframe instead of downloading (octet-stream forces a download).
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
};

/**
 * Is this caller allowed to read files from the AMBIENT workspace? Runs inside `withTenant`, so
 * every lookup below lands in that workspace's own database.
 *
 * Three credentials, one rule (the one `lib/apiAuth.ts` states for /api/v1): the HOST decides
 * WHICH workspace, and the credential is then resolved INSIDE it, so a credential minted
 * elsewhere is simply not found rather than being trusted on its signature alone.
 *
 *  - Bearer token → `bearerUser` reads this workspace's `users` collection.
 *  - `pharos_session` cookie → the JWT is signed with a FLEET-WIDE secret, so on its own it only
 *    proves "some valid Pharos user" and would let anyone holding one read any workspace (#190).
 *    In SaaS the claim is therefore confirmed against this workspace's `users`. Self-hosted has
 *    exactly one database and one user set, so the signature already is the whole answer and no
 *    query is made — the single-user install pays nothing for this.
 *  - `pharos_account` cookie → a hosted customer has no `User` at all; `saasSessionUser()` is the
 *    bridge and already returns null unless the account has a membership in the host's workspace.
 */
async function authorizedForCurrentTenant(req: NextRequest): Promise<boolean> {
  if (await bearerUser(req)) return true;

  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    if (!saasMode()) return true;
    try {
      await connectDB();
      const User = await currentModel(UserModel);
      if (await User.exists({ _id: claims.sub })) return true;
    } catch {
      // A malformed `sub` (CastError) or a control-plane hiccup must FAIL CLOSED here: this is
      // the check that stops one workspace reading another's files, so "could not verify"
      // cannot be allowed to mean "allowed".
    }
  }

  if (saasMode()) {
    const { saasSessionUser } = await import('@/lib/tenancy/saasIdentity');
    if (await saasSessionUser()) return true;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // WHICH workspace, before anything else. `readFile` resolves its argument under
  // `activeStorageRoot()`, which is derived from the AMBIENT tenant exactly as `currentModel()`
  // picks the database — so a handler that never established one read from the FLAT
  // STORAGE_ROOT. For a hosted workspace that is the parent of every tenant subtree, which made
  // `/api/files/<other-workspace-db>/receipts/…` resolve cleanly and serve someone else's file
  // (#190); the traversal guard could not catch it, because with the root one level too high
  // the foreign path never escapes. Pinning the root here is what makes that guard load-bearing.
  //
  // `apiTenant()` (host-only, no cookie) rather than `withRequestTenant()`, for the same reason
  // /api/v1 uses it: this door also accepts bearer tokens, and the cookie gate answers failure
  // with a redirect, which would turn every API file fetch into a 307 to the login page.
  const tenant = await apiTenant();
  // Discriminate on `error`, not on `status`: a real TenantContext carries its own `status`
  // (the workspace lifecycle), so `'status' in tenant` is true for BOTH arms.
  if ('error' in tenant) {
    return new NextResponse(tenant.error, { status: tenant.status });
  }
  return withTenant(tenant, () => serveFile(req, params));
}

async function serveFile(
  req: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<NextResponse> {
  // Auth: a browser sends the session cookie; an API client sends a Bearer token.
  // The middleware lets bearer /api/files requests through, so the route is the guard.
  if (!(await authorizedForCurrentTenant(req))) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { path } = await params;

  // Reject path traversal — storage is WireGuard-only but defense in depth
  if (path.some((seg) => seg === '..' || seg.includes('\0'))) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const relativePath = path.join('/');

  try {
    // Local is always the working copy. If it's missing (fresh host, restored DB)
    // and OneDrive holds the mirror, pull it back on demand and cache it locally.
    let buffer: Buffer;
    try {
      buffer = await readFile(relativePath);
    } catch {
      const recached = await recacheByPath(relativePath);
      if (!recached) return new NextResponse('Not found', { status: 404 });
      buffer = recached;
    }
    const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const filename = relativePath.split('/').pop() ?? 'file';
    const isHtml = ext === 'html' || ext === 'htm';
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      // inline so PDFs/images/html render in an <iframe>/<img> instead of downloading
      'Content-Disposition': `inline; filename="${filename}"`,
      // Images/PDFs are content-addressed (unique hash name, never mutated) → cache
      // hard. HTML is the exception: it was briefly served as octet-stream before the
      // content-type fix, so an 'immutable' entry would pin that wrong response (and a
      // forced download) for a year. Make HTML always revalidate so the corrected
      // content-type is picked up. private: personal data, no shared proxy.
      'Cache-Control': isHtml ? 'private, no-cache, must-revalidate' : 'private, max-age=31536000, immutable',
    };
    if (isHtml) {
      // Email HTML is untrusted. Lock it down: no scripts, and default-src 'none'
      // so nothing phones home. Only same-origin + data: images and inline styles
      // load (enough to render). External images are blocked on purpose — they'd
      // be tracking-pixel beacons firing on every open. form-action/base-uri none
      // stop a clicked form or <base> from exfiltrating. To allow remote logos,
      // change img-src to "'self' data: https:" (re-enables beaconing).
      headers['Content-Security-Policy'] =
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
      headers['X-Content-Type-Options'] = 'nosniff';
    }
    return new NextResponse(new Uint8Array(buffer), { headers });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
