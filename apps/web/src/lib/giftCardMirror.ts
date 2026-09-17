import { revalidatePath } from 'next/cache';
import { currentModel } from '@/lib/tenancy/connection';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { giftCardSpend, type PaymentSplitEntry } from '@/lib/paymentSplit';

// Lives outside app/expenses/actions.ts (a 'use server' module, where every export becomes a
// client-callable action) because the Trash also needs it: deleting an expense hands its
// gift-card spend back and restoring it takes the spend again (#104).

/**
 * P62 — mirror an expense's payment split into the linked gift cards' `uses[]` logs,
 * so a purchase partly paid from store credit lowers that card's balance without the
 * user entering the same spend twice.
 *
 * Idempotent by construction: every entry it writes is tagged with `expenseId`, and
 * the first step removes THIS expense's previously-mirrored entries from every card.
 * So re-saving, moving the money to a different card, or clearing the split all end
 * with exactly the rows the current split describes. Uses typed by hand on the card
 * itself carry `expenseId: ''` and are never touched.
 *
 * Never throws: a bad/stale giftCardId (or a card deleted meanwhile) must not stop an
 * expense from being saved. Runs inside the caller's tenant context.
 */
export async function syncGiftCardUses(expenseId: string, splits: PaymentSplitEntry[], date: Date, vendor: string): Promise<void> {
  try {
    const spend = giftCardSpend(splits);
    const GiftCard = await currentModel(GiftCardModel);
    const had = await GiftCard.updateMany({ 'uses.expenseId': expenseId }, { $pull: { uses: { expenseId } } });
    const note = (vendor || '').trim().slice(0, 200);
    for (const [cardId, amount] of spend) {
      try {
        await GiftCard.updateOne({ _id: cardId }, { $push: { uses: { amount, date, note, expenseId } } });
      } catch {
        // Unknown/malformed card id — skip this row, keep the rest.
      }
    }
    if (spend.size > 0 || (had?.modifiedCount ?? 0) > 0) revalidatePath('/vouchers');
  } catch {
    // Gift-card mirroring is a convenience; the expense itself is already saved.
  }
}

