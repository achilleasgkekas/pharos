import { readFile } from '@/lib/storage';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { bearerUser } from '@/lib/apiAuth';

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
  // Auth: a browser sends the session cookie; the mobile app sends a Bearer token.
  // The middleware lets bearer /api/files requests through, so the route is the guard.
  const ok = (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) || (await bearerUser(req));
  if (!ok) return new NextResponse('Unauthorized', { status: 401 });

  const { path } = await params;

  // Reject path traversal — storage is WireGuard-only but defense in depth
  if (path.some((seg) => seg === '..' || seg.includes('\0'))) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const relativePath = path.join('/');

  try {
    const buffer = await readFile(relativePath);
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
