// P1 — pure, DB-free generator for "Load sample data" (Settings → Storage & backup).
// Builds a small, realistic-looking set of Items/Receipts/Expenses/Subscriptions so a
// fresh self-host install immediately shows what Pharos looks like in use. Every record
// is tagged `isSample: true` so it can be wiped cleanly without touching real data.
// Category slugs are kept to the DEFAULT_*_CATEGORIES taxonomy (lib/taxonomies.ts) so
// icons/colors resolve normally. Locale-aware: only 'el' gets a translated copy today
// (other locales fall back to English, same precedent as the rest of the i18n rollout).

export type SampleLocale = 'en' | 'el';

const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * 86400000);
const daysFromNow = (now: Date, n: number) => new Date(now.getTime() + n * 86400000);
const monthsAgo = (now: Date, n: number) => new Date(now.getFullYear(), now.getMonth() - n, Math.min(now.getDate(), 28));
const period = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export type SampleData = {
  items: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
};

/** Build the full sample-data set, dated relative to `now`. Pure/deterministic given
 *  the same `now` — no randomness, so it's stable across re-loads and easy to unit-test. */
export function buildSampleData(now: Date, locale: string): SampleData {
  const loc: SampleLocale = locale === 'el' ? 'el' : 'en';
  return loc === 'el' ? buildEl(now) : buildEn(now);
}

function buildEn(now: Date): SampleData {
  const items: Record<string, unknown>[] = [
    { title: 'Wireless Headphones', category: 'audio', status: 'installed', specs: 'Bluetooth 5.3, active noise cancelling', currentPrice: 129, purchasedPrice: 129, purchasedFrom: 'Amazon', purchasedAt: monthsAgo(now, 2), warrantyUntil: daysFromNow(now, 500), tags: ['audio', 'sample'], isSample: true },
    { title: 'Standing Desk', category: 'other', status: 'received', specs: 'Electric height adjust, 140x70cm', currentPrice: 349, purchasedPrice: 349, purchasedFrom: 'IKEA', purchasedAt: monthsAgo(now, 4), tags: ['sample'], isSample: true },
    { title: 'Air Fryer', category: 'other', status: 'installed', specs: '5.5L, digital display', currentPrice: 89, purchasedPrice: 79, purchasedFrom: 'Local Store', purchasedAt: monthsAgo(now, 1), tags: ['sample'], isSample: true },
    { title: 'Mechanical Keyboard', category: 'peripheral', status: 'researching', specs: 'Hot-swappable, 75% layout', currentPrice: 149, targetPrice: 110, tags: ['sample'], isSample: true },
    { title: 'Robot Vacuum', category: 'other', status: 'decided', specs: 'LIDAR mapping, self-empty base', currentPrice: 399, targetPrice: 320, tags: ['sample'], isSample: true },
    { title: 'Portable Monitor', category: 'video', status: 'ordered', specs: '15.6" 1080p USB-C', currentPrice: 219, tags: ['sample'], isSample: true },
  ];

  const receipts: Record<string, unknown>[] = [
    { store: 'Amazon', date: monthsAgo(now, 2), total: 129, subtotal: 104.03, vatAmount: 24.97, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Wireless Headphones', qty: 1, price: 129, vatRate: 24 }], verified: true, isSample: true },
    { store: 'IKEA', date: monthsAgo(now, 4), total: 349, subtotal: 281.45, vatAmount: 67.55, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Standing Desk', qty: 1, price: 349, vatRate: 24 }], verified: true, isSample: true },
    { store: 'Carrefour', date: daysAgo(now, 10), total: 62.4, subtotal: 50.32, vatAmount: 12.08, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Groceries', qty: 1, price: 62.4, vatRate: 24 }], verified: true, isSample: true },
    { store: 'Public', date: daysAgo(now, 20), total: 34.9, subtotal: 28.15, vatAmount: 6.75, paymentMethod: 'cash', filePath: '', lineItems: [{ name: 'USB-C Cable', qty: 2, price: 17.45, vatRate: 24 }], verified: false, isSample: true },
  ];

  const expenses: Record<string, unknown>[] = [];
  for (let m = 2; m >= 0; m--) {
    const d = monthsAgo(now, m);
    expenses.push({ kind: 'expense', vendor: 'Landlord', vendorKey: 'landlord', category: 'rent', amount: 650, date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
    expenses.push({ kind: 'expense', vendor: 'Electricity Co', vendorKey: 'electricityco', category: 'utilities', amount: [45.2, 58.9, 51.3][2 - m], date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
  }
  for (let m = 1; m >= 0; m--) {
    const d = monthsAgo(now, m);
    expenses.push({ kind: 'income', vendor: 'Employer Inc', vendorKey: 'employerinc', category: 'salary', amount: 2200, date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
  }
  expenses.push({ kind: 'expense', vendor: 'Gas Station', vendorKey: 'gasstation', category: 'fuel', amount: 55, date: daysAgo(now, 5), period: period(daysAgo(now, 5)), verified: true, isSample: true });
  expenses.push({ kind: 'expense', vendor: 'Supermarket', vendorKey: 'supermarket', category: 'groceries', amount: 78.2, date: daysAgo(now, 3), period: period(daysAgo(now, 3)), verified: true, isSample: true });

  const subscriptions: Record<string, unknown>[] = [
    { name: 'Netflix', provider: 'Netflix', category: 'streaming', amount: 13.99, billingCycle: 'monthly', startDate: monthsAgo(now, 6), nextRenewal: daysFromNow(now, 12), isSample: true },
    { name: 'Spotify', provider: 'Spotify', category: 'streaming', amount: 10.99, billingCycle: 'monthly', startDate: monthsAgo(now, 8), nextRenewal: daysFromNow(now, 5), isSample: true },
    { name: 'iCloud+', provider: 'Apple', category: 'cloud', amount: 2.99, billingCycle: 'monthly', startDate: monthsAgo(now, 10), nextRenewal: daysFromNow(now, 20), isSample: true },
  ];

  return { items, receipts, expenses, subscriptions };
}

function buildEl(now: Date): SampleData {
  const items: Record<string, unknown>[] = [
    { title: 'Ασύρματα Ακουστικά', category: 'audio', status: 'installed', specs: 'Bluetooth 5.3, ακύρωση θορύβου', currentPrice: 129, purchasedPrice: 129, purchasedFrom: 'Skroutz', purchasedAt: monthsAgo(now, 2), warrantyUntil: daysFromNow(now, 500), tags: ['audio', 'sample'], isSample: true },
    { title: 'Γραφείο Standing Desk', category: 'other', status: 'received', specs: 'Ηλεκτρικό ύψος, 140x70εκ', currentPrice: 349, purchasedPrice: 349, purchasedFrom: 'ΙΚΕΑ', purchasedAt: monthsAgo(now, 4), tags: ['sample'], isSample: true },
    { title: 'Φριτέζα Αέρος', category: 'other', status: 'installed', specs: '5.5L, ψηφιακή οθόνη', currentPrice: 89, purchasedPrice: 79, purchasedFrom: 'Κωτσόβολος', purchasedAt: monthsAgo(now, 1), tags: ['sample'], isSample: true },
    { title: 'Μηχανικό Πληκτρολόγιο', category: 'peripheral', status: 'researching', specs: 'Hot-swap, 75% layout', currentPrice: 149, targetPrice: 110, tags: ['sample'], isSample: true },
    { title: 'Ρομποτική Σκούπα', category: 'other', status: 'decided', specs: 'LIDAR χαρτογράφηση, βάση αυτοαδειάσματος', currentPrice: 399, targetPrice: 320, tags: ['sample'], isSample: true },
    { title: 'Φορητή Οθόνη', category: 'video', status: 'ordered', specs: '15.6" 1080p USB-C', currentPrice: 219, tags: ['sample'], isSample: true },
  ];

  const receipts: Record<string, unknown>[] = [
    { store: 'Skroutz', date: monthsAgo(now, 2), total: 129, subtotal: 104.03, vatAmount: 24.97, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Ασύρματα Ακουστικά', qty: 1, price: 129, vatRate: 24 }], verified: true, isSample: true },
    { store: 'ΙΚΕΑ', date: monthsAgo(now, 4), total: 349, subtotal: 281.45, vatAmount: 67.55, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Γραφείο Standing Desk', qty: 1, price: 349, vatRate: 24 }], verified: true, isSample: true },
    { store: 'Carrefour', date: daysAgo(now, 10), total: 62.4, subtotal: 50.32, vatAmount: 12.08, paymentMethod: 'card', filePath: '', lineItems: [{ name: 'Ψώνια σούπερ μάρκετ', qty: 1, price: 62.4, vatRate: 24 }], verified: true, isSample: true },
    { store: 'Public', date: daysAgo(now, 20), total: 34.9, subtotal: 28.15, vatAmount: 6.75, paymentMethod: 'cash', filePath: '', lineItems: [{ name: 'Καλώδιο USB-C', qty: 2, price: 17.45, vatRate: 24 }], verified: false, isSample: true },
  ];

  const expenses: Record<string, unknown>[] = [];
  for (let m = 2; m >= 0; m--) {
    const d = monthsAgo(now, m);
    expenses.push({ kind: 'expense', vendor: 'Ιδιοκτήτης', vendorKey: 'idioktitis', category: 'rent', amount: 650, date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
    expenses.push({ kind: 'expense', vendor: 'ΔΕΗ', vendorKey: 'dei', category: 'utilities', amount: [45.2, 58.9, 51.3][2 - m], date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
  }
  for (let m = 1; m >= 0; m--) {
    const d = monthsAgo(now, m);
    expenses.push({ kind: 'income', vendor: 'Εργοδότης ΑΕ', vendorKey: 'ergodotis', category: 'salary', amount: 2200, date: d, period: period(d), recurring: true, recurringCycle: 'monthly', verified: true, isSample: true });
  }
  expenses.push({ kind: 'expense', vendor: 'Πρατήριο Καυσίμων', vendorKey: 'pratirio', category: 'fuel', amount: 55, date: daysAgo(now, 5), period: period(daysAgo(now, 5)), verified: true, isSample: true });
  expenses.push({ kind: 'expense', vendor: 'Σούπερ Μάρκετ', vendorKey: 'supermarket', category: 'groceries', amount: 78.2, date: daysAgo(now, 3), period: period(daysAgo(now, 3)), verified: true, isSample: true });

  const subscriptions: Record<string, unknown>[] = [
    { name: 'Netflix', provider: 'Netflix', category: 'streaming', amount: 13.99, billingCycle: 'monthly', startDate: monthsAgo(now, 6), nextRenewal: daysFromNow(now, 12), isSample: true },
    { name: 'Spotify', provider: 'Spotify', category: 'streaming', amount: 10.99, billingCycle: 'monthly', startDate: monthsAgo(now, 8), nextRenewal: daysFromNow(now, 5), isSample: true },
    { name: 'iCloud+', provider: 'Apple', category: 'cloud', amount: 2.99, billingCycle: 'monthly', startDate: monthsAgo(now, 10), nextRenewal: daysFromNow(now, 20), isSample: true },
  ];

  return { items, receipts, expenses, subscriptions };
}
