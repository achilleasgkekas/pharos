import { ShareTargetClient } from './ShareTargetClient';

export const dynamic = 'force-dynamic';

/** #123 — where the OS share sheet lands: pick what the shared file is, then it goes into that
 *  module's normal flow. Auth is handled by the global middleware like every other page. */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; kind?: string; name?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ShareTargetClient
      ticket={sp.f || ''}
      kind={sp.kind === 'pdf' ? 'pdf' : 'image'}
      filename={sp.name || ''}
      error={sp.error || ''}
    />
  );
}
