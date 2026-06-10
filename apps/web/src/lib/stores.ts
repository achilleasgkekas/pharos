// Curated, code-managed list of known stores. NOT user-editable — maintained here.
// Used to normalize the store name the AI extracts, and to populate the dropdown.

export type KnownStore = { name: string; aliases: string[]; url?: string };

export const KNOWN_STORES: KnownStore[] = [
  { name: 'DJI Store', aliases: ['dji', 'dji store', 'dji official', 'store.dji.com'], url: 'https://store.dji.com' },
  { name: 'Skroutz', aliases: ['skroutz', 'skroutz marketplace'], url: 'https://www.skroutz.gr' },
  { name: 'Public', aliases: ['public', 'public.gr'], url: 'https://www.public.gr' },
  { name: 'Κωτσόβολος', aliases: ['κωτσοβολος', 'kotsovolos', 'kwtsovolos'], url: 'https://www.kotsovolos.gr' },
  { name: 'you.gr', aliases: ['you.gr', 'you gr'], url: 'https://www.you.gr' },
  { name: 'Πλαίσιο', aliases: ['plaisio', 'πλαισιο', 'plaisio.gr'], url: 'https://www.plaisio.gr' },
  { name: 'MediaMarkt', aliases: ['mediamarkt', 'media markt'], url: 'https://mediamarkt.gr' },
  { name: 'Germanos', aliases: ['germanos', 'γερμανος'], url: 'https://www.germanos.gr' },
  { name: 'Amazon', aliases: ['amazon', 'amazon.de', 'amazon.com', 'amazon.co.uk'], url: 'https://www.amazon.de' },
  { name: 'AliExpress', aliases: ['aliexpress'], url: 'https://www.aliexpress.com' },
  { name: 'eBay', aliases: ['ebay'], url: 'https://www.ebay.com' },
  { name: 'xpatit.gr', aliases: ['xpatit'], url: 'https://www.xpatit.gr' },
  { name: 'i-system.gr', aliases: ['i-system', 'isystem'], url: 'https://www.i-system.gr' },
  { name: 'e-shop.gr', aliases: ['e-shop', 'eshop'], url: 'https://www.e-shop.gr' },
  { name: 'EU Store (Ubiquiti)', aliases: ['ui.com', 'ubiquiti', 'eu store', 'eu.store.ui.com'], url: 'https://eu.store.ui.com' },
  { name: 'FS.com', aliases: ['fs.com', 'fiberstore'], url: 'https://www.fs.com' },
  { name: 'TechLamb', aliases: ['techlamb', 'store', 'store', 'store'], url: 'https://www.techlamb.gr' },
  { name: 'e-wireless.gr', aliases: ['e-wireless', 'ewireless'], url: 'https://www.e-wireless.gr' },
  { name: 'techstores.gr', aliases: ['techstores'], url: 'https://www.techstores.gr' },
  { name: 'Apple Store', aliases: ['apple', 'apple store', 'apple.com'], url: 'https://www.apple.com' },
  { name: 'IKEA', aliases: ['ikea'], url: 'https://www.ikea.gr' },
  { name: 'Leroy Merlin', aliases: ['leroy merlin', 'leroy'], url: 'https://www.leroymerlin.gr' },
];

export const STORE_NAMES = KNOWN_STORES.map((s) => s.name);

/** Normalize a raw store string to a known store name, or return it cleaned if unknown. */
export function matchStore(raw: string): string {
  const q = (raw || '').toLowerCase().trim();
  if (!q) return '';
  for (const s of KNOWN_STORES) {
    if (s.name.toLowerCase() === q) return s.name;
    for (const a of s.aliases) {
      if (q === a) return s.name;
      // Substring matches only for meaningful lengths, to avoid short aliases
      // (e.g. "you") matching unrelated strings.
      if (a.length >= 4 && q.includes(a)) return s.name;
      if (q.length >= 4 && a.includes(q)) return s.name;
    }
  }
  return raw.trim();
}
