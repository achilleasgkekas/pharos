/**
 * P68 φάση 2 — ΜΗΝΙΑΙΟ κόστος συνδρομών ανά «χώρο» (per-property ledger tag).
 *
 * Η φάση 1 έβαλε τις tagged αποδείξεις στο ήδη υπάρχον card «δαπάνες ανά χώρο» των
 * Reports, γιατί το `Receipt.total` είναι πραγματική δαπάνη, στην ίδια μονάδα με το
 * `Expense.amount` που αθροίζεται ήδη εκεί. Οι συνδρομές ΔΕΝ είναι: μια συνδρομή δεν
 * έχει «σύνολο», έχει ρυθμό. Γι' αυτό εδώ βγαίνει ξεχωριστό μηνιαίο ισοδύναμο και
 * ΔΕΝ προστίθεται στο gross card — ένας ρυθμός μέσα σε ένα all-time άθροισμα θα ήταν
 * απλώς λάθος νούμερο, όχι ημιτελές.
 *
 * INVARIANT (ίδιος με τη φάση 1): μετράνε ΜΟΝΟ συνδρομές με μη κενό `space`. Κάθε
 * συνδρομή πριν το P68 έχει `space: ''`, άρα σε εγκατάσταση χωρίς tags ο χάρτης βγαίνει
 * κενός και το card δεν εμφανίζεται καν — opt-in εκ κατασκευής, χωρίς setting.
 *
 * Το `amount` είναι ΠΑΝΤΑ σε βασικό νόμισμα (βλ. SubscriptionSchema, P9), οπότε το
 * μηνιαίο ισοδύναμο βγαίνει στην ίδια βάση με το ήδη υπάρχον «συνδρομές ανά κατηγορία».
 */

import { monthlyFactor } from '@/lib/billingCycle';

export type SpacedSubscription = {
  amount?: number | null;
  billingCycle?: string | null;
  space?: string | null;
};

/**
 * space → μηνιαίο ισοδύναμο κόστος. Χωρίς tag, χωρίς θετικό ποσό ή με μηδενικό
 * μηνιαίο συντελεστή (lifetime), δεν μπαίνει.
 */
export function subscriptionSpaceCost(
  subs: readonly SpacedSubscription[] | null | undefined
): Map<string, number> {
  const bySpace = new Map<string, number>();
  for (const s of subs ?? []) {
    const space = (s?.space || '').trim();
    if (!space) continue; // untagged → ακριβώς η προ-P68 συμπεριφορά
    const amount = Number(s?.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const factor = Number(monthlyFactor(s?.billingCycle || 'monthly'));
    if (!Number.isFinite(factor) || factor <= 0) continue; // lifetime: καμία μηνιαία χρέωση
    bySpace.set(space, (bySpace.get(space) ?? 0) + amount * factor);
  }
  return bySpace;
}
