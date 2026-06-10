import { config } from './config.js';
import { Item } from './db.js';
import { fetchPageText, storeFromUrl } from './scrape.js';
import { extractPrice, isOllamaHealthy } from './extract.js';
import { getScraperAiConfig } from './appConfig.js';
import { notify } from './notify.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One full scrape pass over every item that has product links. */
export async function runOnce(): Promise<{ items: number; checks: number; updates: number; alerts: number }> {
  const stats = { items: 0, checks: 0, updates: 0, alerts: 0 };

  const ai = await getScraperAiConfig({ ollamaModel: config.ollamaModel });
  if (ai.provider === 'anthropic') {
    if (!ai.anthropicApiKey) {
      console.error('[scrape] Scraper AI is set to Anthropic but no API key is configured. Skipping.');
      return stats;
    }
    console.log(`[scrape] AI: Anthropic · ${ai.model}`);
  } else {
    if (!(await isOllamaHealthy(ai.model))) {
      console.error(`[scrape] Ollama not reachable at ${config.ollamaHost} (model ${ai.model}). Skipping.`);
      return stats;
    }
    console.log(`[scrape] AI: Ollama · ${ai.model}`);
  }

  const query = Item.find({ 'links.0': { $exists: true } }).sort({ updatedAt: 1 });
  if (config.limit > 0) query.limit(config.limit);
  const items = await query;
  console.log(`[scrape] ${items.length} items with links${config.limit ? ` (limit ${config.limit})` : ''}`);

  for (const item of items) {
    const links = (item.links ?? []).filter((l) => l.url && /^https?:\/\//i.test(l.url));
    if (links.length === 0) continue;
    stats.items++;

    const known = (item.priceHistory ?? [])
      .map((p) => p.price)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const lowestBefore = known.length ? Math.min(...known) : (item.currentPrice || Infinity);

    let bestNow = Infinity;
    let bestUrl = '';
    for (const link of links) {
      stats.checks++;
      try {
        const page = await fetchPageText(link.url!);
        const { price, currency, inStock } = await extractPrice(page);
        if (price != null && price > 0) {
          item.priceHistory.push({
            price,
            store: storeFromUrl(link.url!),
            url: link.url!,
            currency,
            date: new Date(),
            inStock,
          });
          // Keep the per-link latest price fresh (shown next to each URL in the app)
          link.price = price;
          if (price < bestNow) {
            bestNow = price;
            bestUrl = link.url!;
          }
          console.log(`  ✓ ${item.title} @ ${storeFromUrl(link.url!)}: €${price}${inStock ? '' : ' (out of stock)'}`);
        } else {
          console.log(`  · ${item.title} @ ${storeFromUrl(link.url!)}: no price`);
        }
      } catch (err) {
        console.error(`  ✗ ${storeFromUrl(link.url!)}: ${(err as Error).message}`);
      }
      await sleep(config.fetchDelayMs);
    }

    if (bestNow < Infinity) {
      item.currentPrice = bestNow;
      item.markModified('links');
      await item.save();
      stats.updates++;

      // Deal alert: the best price just reached the user's target. Fire only on the
      // crossing (was above target, now at/below) so it doesn't repeat every pass.
      const target = item.targetPrice;
      if (target != null && target > 0 && bestNow <= target && lowestBefore > target) {
        stats.alerts++;
        await notify({
          title: `🎯 Target hit: ${item.title}`,
          message: `€${bestNow.toFixed(2)} ≤ your target €${target.toFixed(2)} at ${storeFromUrl(bestUrl)}`,
          tags: ['dart'],
          priority: 5,
          click: bestUrl,
        });
        console.log(`  🎯 target hit: ${item.title} €${bestNow}`);
      }

      // Alert on a meaningful new low vs the lowest we'd seen before this pass
      if (lowestBefore < Infinity && bestNow <= lowestBefore * (1 - config.dropAlertPct / 100)) {
        const pct = Math.round((1 - bestNow / lowestBefore) * 100);
        stats.alerts++;
        await notify({
          title: `💸 Price drop: ${item.title}`,
          message: `€${bestNow.toFixed(2)} at ${storeFromUrl(bestUrl)} (was €${lowestBefore.toFixed(2)}, -${pct}%)`,
          tags: ['chart_with_downwards_trend'],
          priority: 4,
          click: bestUrl,
        });
        console.log(`  🔔 alert: ${item.title} -${pct}%`);
      }
    }
  }

  console.log(`[scrape] done: ${stats.updates} updated, ${stats.alerts} alerts (${stats.checks} checks)`);
  return stats;
}
