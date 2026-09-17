import { connectDB } from './db';
import { Store } from '@/models/Store';
import { currentModel } from './tenancy/connection';
import { getStores, invalidateStoreCache, matchIn, type StoreLite } from './storeService';

// P60 (#13) — learn from a store correction. The AI reads a receipt, resolveStore() maps what it
// read onto the store list, and when that guess is wrong the user fixes it by hand. Until now the
// fix taught nothing: the next receipt from the same shop came back wrong again. Now, when a
// VERIFIED receipt's store changes, the text it had before becomes an alias of the store the user
// chose — the same `Store.aliases[]` resolveStore already matches against, so the next receipt
// lands right with no new AI call. Seed aliases are never edited or removed, only added to.

/** Store placeholder written when the AI read nothing; never worth learning. */
const PLACEHOLDER = 'unknown store';

/**
 * The alias a correction should teach, or null when learning would be useless or harmful.
 * Pure — the DB write lives in `learnStoreAlias`.
 *
 * Refuses when:
 *  - either side is empty, the placeholder, or the two are the same name (no correction);
 *  - the new store is not on the managed list (nothing to attach an alias to);
 *  - the old text already resolves to the chosen store (already known);
 *  - the old text resolves to a DIFFERENT curated store. This is the TechLamb case: the AI read
 *    TechLamb's legal name but resolveStore had already turned it into "Κωτσόβολος", so the old
 *    value is a real store's canonical name. Teaching "κωτσόβολος" as a TechLamb alias would send
 *    every genuine Kotsovolos receipt to TechLamb. An `auto` store (created from an unmatched
 *    receipt) is fair game — that is exactly the raw text worth learning;
 *  - the alias is under 4 characters: matchIn substring-matches aliases of 4+ chars, and shorter
 *    ones only match exactly, so a 1–3 char "alias" is noise rather than a shop name.
 */
export function aliasToLearn(prevStore: string, nextStore: string, stores: StoreLite[]): { target: string; alias: string } | null {
  const prev = (prevStore || '').trim();
  const next = (nextStore || '').trim();
  if (!prev || !next) return null;
  const alias = prev.toLowerCase();
  if (alias === next.toLowerCase() || alias === PLACEHOLDER) return null;
  if (alias.length < 4) return null;

  const target = stores.find((s) => s.name.toLowerCase() === next.toLowerCase());
  if (!target) return null;
  if (matchIn(prev, [target])) return null;

  const others = stores.filter((s) => s !== target);
  const clash = matchIn(prev, others);
  if (clash && others.some((s) => s.name === clash && !s.auto)) return null;

  return { target: target.name, alias };
}

/** Apply `aliasToLearn` for a verified correction. Never throws: learning is a convenience and
 *  must not fail the save it rides on. Runs inside the caller's tenant context. */
export async function learnStoreAlias(prevStore: string, nextStore: string): Promise<void> {
  try {
    const learn = aliasToLearn(prevStore, nextStore, await getStores());
    if (!learn) return;
    await connectDB();
    const StoreModel = await currentModel(Store);
    await StoreModel.updateOne({ name: learn.target }, { $addToSet: { aliases: learn.alias } });
    invalidateStoreCache();
  } catch {
    /* the receipt is already saved; a missed alias only means the next guess stays wrong */
  }
}
