import { redirect } from 'next/navigation';

// Bills live in Expenses now, as the "To pay" tab. Old links (bookmarks, notifications,
// ?open=<id> deep links) keep working.
export default async function BillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const open = typeof sp.open === 'string' && /^[a-f0-9]{24}$/i.test(sp.open) ? `?open=${sp.open}` : '';
  redirect(`/expenses/to-pay${open}`);
}
