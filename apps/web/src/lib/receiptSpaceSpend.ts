/**
 * P68 φάση 1 — δαπάνη ανά «χώρο» (per-property ledger tag) από ΑΠΟΔΕΙΞΕΙΣ.
 *
 * Το P34 έδωσε στα Expenses ένα optional `space` και στα Reports ένα card «δαπάνες ανά
 * χώρο», αλλά έμεινε ρητά Expenses-only: μια απόδειξη σούπερ μάρκετ δεμένη στο εξοχικό
 * δεν προσμετρούνταν πουθενά, οπότε το P&L ανά σπίτι ήταν συστηματικά ημιτελές. Εδώ ζει
 * το κοινό, pure κομμάτι που αθροίζει τα σύνολα των αποδείξεων ανά χώρο, ώστε να μη
 * γραφτεί η ίδια λογική δεύτερη φορά όταν έρθουν και οι συνδρομές/λογαριασμοί (φάση 2).
 *
 * INVARIANT: μετράνε ΜΟΝΟ αποδείξεις με μη κενό `space`. Κάθε απόδειξη πριν το P68 έχει
 * `space: ''`, άρα σε εγκατάσταση χωρίς tags τα αθροίσματα βγαίνουν κενά και το chart
 * μένει ακριβώς όπως ήταν — opt-in εκ κατασκευής, χωρίς setting.
 *
 * ΓΙΑΤΙ ΤΟ `total` ΚΑΙ ΟΧΙ ΟΙ ΓΡΑΜΜΕΣ: ο χώρος είναι ιδιότητα ΟΛΗΣ της απόδειξης (μια
 * αγορά έγινε για ένα σπίτι), σε αντίθεση με την κατηγορία του P64 που είναι ανά γραμμή.
 * Το `total` είναι πάντα σε βασικό νόμισμα (βλ. ReceiptSchema), δηλαδή στην ίδια βάση με
 * το `Expense.amount` που ήδη αθροίζεται στο ίδιο chart.
 */

export type SpacedReceipt = {
  total?: number | null;
  space?: string | null;
};

/** space → gross σύνολο αποδείξεων. Χωρίς tag ή χωρίς θετικό ποσό, δεν μπαίνει. */
export function receiptSpaceSpend(
  receipts: readonly SpacedReceipt[] | null | undefined
): Map<string, number> {
  const bySpace = new Map<string, number>();
  for (const r of receipts ?? []) {
    const space = (r?.space || '').trim();
    if (!space) continue; // untagged → ακριβώς η προ-P68 συμπεριφορά
    const total = Number(r?.total);
    if (!Number.isFinite(total) || total <= 0) continue;
    bySpace.set(space, (bySpace.get(space) ?? 0) + total);
  }
  return bySpace;
}
