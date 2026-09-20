function normUrl(u?: string | null): string {
  if (!u) return '';
  try {
    const url = new URL(u);
    return (url.hostname.replace(/^www\./, '') + url.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return u.trim().toLowerCase();
  }
}

function normStore(s?: string | null): string {
  return (s ?? '').trim().toLowerCase();
}

export function calculatePriceTrend(
  priceHistory?: { price: number; store?: string; url?: string; date: string | Date }[],
  // `url` accepts null as well as undefined: callers build this from a link row where an absent
  // URL is stored as null (see the /api/v1/items route), and forcing every one of them to
  // normalise first would just move the same `?? undefined` to three call sites.
  targetStore?: { store?: string | null; url?: string | null } | null
): number | null {
  const hist = [...(priceHistory ?? [])]
    .filter((h) => typeof h.price === 'number' && h.price > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (hist.length < 2) return null;

  const targetUrl = normUrl(targetStore?.url);
  const targetName = normStore(targetStore?.store);

  let filtered: typeof hist = [];

  // 1. If target store URL is available, filter by URL
  if (targetUrl) {
    filtered = hist.filter((h) => normUrl(h.url) === targetUrl);
  }

  // 2. If target store name is available and URL filter produced < 2 points, try store name
  if (filtered.length < 2 && targetName) {
    filtered = hist.filter((h) => normStore(h.store) === targetName);
  }

  // 3. If no target store specified or target store has < 2 points, check the store/URL of the latest history point
  if (filtered.length < 2) {
    const latestHist = hist[hist.length - 1];
    const latestUrl = normUrl(latestHist.url);
    const latestName = normStore(latestHist.store);

    if (latestUrl) {
      filtered = hist.filter((h) => normUrl(h.url) === latestUrl);
    } else if (latestName) {
      filtered = hist.filter((h) => normStore(h.store) === latestName);
    } else {
      // Fallback for entries with neither URL nor store name
      filtered = hist;
    }
  }

  if (filtered.length < 2) return null;

  const latest = filtered[filtered.length - 1].price;
  const prev = filtered[filtered.length - 2].price;

  return latest === prev ? null : latest - prev;
}
