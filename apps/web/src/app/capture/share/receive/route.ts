import { NextResponse } from 'next/server';
import { stashSharedFile } from '@/lib/shareInbox';

/**
 * #123 — target of the PWA share sheet (manifest `share_target`). iOS/Android POST the shared file
 * here as multipart form data; browsers do not render such a POST, so the file is parked and the
 * user is redirected (303) to the picker page with its ticket.
 *
 * Auth is the global middleware's job, exactly like every other route: an unauthenticated share
 * lands on /login?next=… and continues here after signing in.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const base = new URL(req.url).origin;
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get('file');
  } catch {
    return NextResponse.redirect(`${base}/capture/share?error=unreadable`, 303);
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(`${base}/capture/share?error=empty`, 303);
  }
  const stashed = await stashSharedFile(file).catch(() => null);
  if (!stashed) {
    return NextResponse.redirect(`${base}/capture/share?error=unsupported`, 303);
  }
  return NextResponse.redirect(
    `${base}/capture/share?f=${encodeURIComponent(stashed.ticket)}&kind=${stashed.kind}&name=${encodeURIComponent(file.name)}`,
    303,
  );
}
