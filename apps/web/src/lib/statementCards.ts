import type { SerializedCard, SerializedStatement } from '@/types';
import { buildCardLabel, normalizeLast4 } from './cards';

/** Imported labels are snapshots, while cardId is the durable link. Resolve only
 * against the cards supplied by the current workspace; never guess from last4. */
export function statementsWithCurrentCards<T extends Pick<SerializedStatement, 'card' | 'cardId' | 'last4'>>(
  statements: T[], cards: Pick<SerializedCard, '_id' | 'name' | 'last4'>[],
): T[] {
  const byId = new Map(cards.map((card) => [card._id, card]));
  return statements.map((statement) => {
    const card = statement.cardId ? byId.get(statement.cardId) : undefined;
    return card ? { ...statement, card: buildCardLabel(card.name, card.last4),
      last4: normalizeLast4(card.last4) } : statement;
  });
}
