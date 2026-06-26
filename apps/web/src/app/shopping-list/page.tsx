import { ShoppingListClient } from './ShoppingListClient';
import { getListItems } from './actions';

export const dynamic = 'force-dynamic';

export default async function ShoppingListPage() {
  const items = await getListItems();
  return <ShoppingListClient initialItems={items} />;
}
