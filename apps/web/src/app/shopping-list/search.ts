// Shopping-list search, shared by the list filter and the add flow (#408).
/** Does a list row match the search box? Name, brand or category, case-insensitive. */
export function matchesListSearch(item: { name: string; brand?: string | null; category?: string | null }, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return item.name.toLowerCase().includes(q) || (item.brand || '').toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q);
}
