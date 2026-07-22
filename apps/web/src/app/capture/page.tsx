import { CaptureClient } from './CaptureClient';

export const dynamic = 'force-dynamic';

/** Landing page for the "Add to Pharos" bookmarklet (Settings → Storage & backup).
 *  The bookmarklet opens this as a small same-origin popup with `?url=<page>`, so
 *  it rides the browser's existing session cookie — auth is handled by the global
 *  middleware exactly like every other page (redirects to /login?next=... first). */
export default async function CapturePage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const sp = await searchParams;
  return <CaptureClient initialUrl={sp.url || ''} />;
}
