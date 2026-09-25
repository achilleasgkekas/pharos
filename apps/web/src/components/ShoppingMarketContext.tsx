'use client';

import { createContext, useContext } from 'react';
import type { ShoppingMarket } from '@/lib/shoppingRegion';

/**
 * The saved shopping market (#319), handed down from the page's settings so the price panel can
 * mark store links outside it. null = no country chosen, and then nothing is ever marked.
 */
const ShoppingMarketContext = createContext<ShoppingMarket | null>(null);

export const ShoppingMarketProvider = ShoppingMarketContext.Provider;

export function useShoppingMarket(): ShoppingMarket | null {
  return useContext(ShoppingMarketContext);
}
