import { readFile } from '@/lib/storage';
import { recacheByPath } from '@/lib/mirror';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { bearerUser, apiTenant } from '@/lib/apiAuth';
import { saasMode } from '@/lib/tenancy/saasMode';
import { resolveRequestTenantOrNull } from '@/lib/tenancy/request';
import { withTenant, currentTenant } from '@/lib/tenancy/current';
import { DEFAULT_TENANT, type TenantContext } from '@/lib/tenancy/context';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  let authorizedTenant: TenantContext | null = null;

  if (saasMode()) {
    // SaaS: Check bearer token first (API client)
    const apiCtx = await apiTenant();
    if (!('error' in apiCtx)) {
      const user = await withTenant(apiCtx, () => bearerUser(req));
      if (user) {
        authorizedTenant = apiCtx;
      }
    }
    // SaaS: If no valid bearer token, try UI cookie
    if (!authorizedTenant) {
      const uiCtx = await resolveRequestTenantOrNull();
      if (uiCtx) {
        authorizedTenant = uiCtx;
      }
    }
  } else {
    // Self-hosted: Check session cookie OR bearer token
    const ok = (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) || (await bearerUser(req));
    if (ok) {
      authorizedTenant = DEFAULT_TENANT;
    }
  }

  if (!authorizedTenant) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return withTenant(authorizedTenant, async () => {
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
  });
}
