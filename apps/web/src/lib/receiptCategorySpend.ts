/**
 * P64 φάση 2 — spend per expense category derived from RECEIPT LINE ITEMS.
 *
 * Φάση 1 έδωσε στο `LineItemSchema` ένα optional `category` από το ΙΔΙΟ taxonomy που
 * χρησιμοποιούν τα Expenses (`settings.expenseCategories`), αλλά κανένα chart δεν το
 * διάβαζε: το category breakdown και το budget-vs-actual κοιτούσαν αποκλειστικά
 * `Expense.category`, οπότε μια απόδειξη σούπερ μάρκετ έμενε αόρατη. Αυτό το module
 * είναι το κοινό, pure κομμάτι που λείπει, ώστε το web `/reports` και το
 * `GET /api/v1/reports` να αθροίζουν ΤΑ ΙΔΙΑ νούμερα χωρίς να ξαναγράφουν τη λογική.
 *
 * INVARIANT: μετράνε ΜΟΝΟ γραμμές με μη κενή `category`. Κάθε γραμμή πριν το P64 έχει
 * `category: ''`, άρα σε μια εγκατάσταση όπου κανείς δεν έχει βάλει tag τα αθροίσματα
 * βγαίνουν κενά και κανένα chart δεν αλλάζει — το feature είναι opt-in εκ κατασκευής,
 * χωρίς setting.
 */

export type CategorizedLine = {
  qty?: number | null;
  price?: number | null;
  vatRate?: number | null;
  category?: string | null;
};

export type CategorizedReceipt = {
  date?: string | Date | null;
  lineItems?: CategorizedLine[] | null;
};

export type ReceiptCategorySpend = {
  /** category → gross σύνολο από ΟΛΕΣ τις αποδείξεις, ανεξάρτητα από ημερομηνία. */
  all: Map<string, number>;
  /** 'YYYY-MM' → category → gross σύνολο. Αποδείξεις με άκυρη ημερομηνία λείπουν. */
  byMonth: Map<string, Map<string, number>>;
  /** 'YYYY-MM' → gross σύνολο ΟΛΩΝ των categorized γραμμών εκείνου του μήνα. */
  totalByMonth: Map<string, number>;
};

/**
 * Gross ποσό μιας γραμμής, στην ίδια βάση με το `Expense.amount` (με ΦΠΑ) ώστε τα δύο
 * να αθροίζονται στο ίδιο chart. Το `price` είναι στην πράξη η ΚΑΘΑΡΗ τιμή μονάδας:
 * ο line-item editor δείχνει `qty × price × (1 + vatRate/100)` και το «∑ from products»
 * χτίζει έτσι ακριβώς το `total` της απόδειξης (το σχόλιο «gross unit price» στο
 * `LineItemSchema` δεν περιγράφει τι κάνει ο κώδικας).
 *
 * `qty` που λείπει ή δεν είναι θετικό μετράει ως 1 — το ίδιο κάνει το `lineGross()` του
 * editor, που είναι και το νούμερο που βλέπει ο χρήστης δίπλα στη γραμμή, και ταιριάζει
 * με το schema default.
 */
export function lineGrossAmount(li: CategorizedLine | null | undefined): number {
  const price = Number(li?.price);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const rawQty = Number(li?.qty);
  const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
  const rawVat = Number(li?.vatRate);
  const vatRate = Number.isFinite(rawVat) && rawVat > 0 ? rawVat : 0;
  return qty * price * (1 + vatRate / 100);
}

/** 'YYYY-MM' από ημερομηνία απόδειξης· '' όταν λείπει ή δεν διαβάζεται. */
function monthKeyOf(d: string | Date | null | undefined): string {
  if (!d) return '';
  const parsed = d instanceof Date ? d : new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

/** Ρίχνει τις categorized γραμμές των αποδείξεων σε αθροίσματα ανά κατηγορία/μήνα. */
export function receiptCategorySpend(
  receipts: readonly CategorizedReceipt[] | null | undefined
): ReceiptCategorySpend {
  const all = new Map<string, number>();
  const byMonth = new Map<string, Map<string, number>>();
  const totalByMonth = new Map<string, number>();
  for (const r of receipts ?? []) {
    const lines = r?.lineItems;
    if (!Array.isArray(lines) || lines.length === 0) continue;
    const mk = monthKeyOf(r?.date);
    for (const li of lines) {
      const cat = (li?.category || '').trim();
      if (!cat) continue; // untagged → ακριβώς η προ-P64 συμπεριφορά
      const amt = lineGrossAmount(li);
      if (amt <= 0) continue;
      all.set(cat, (all.get(cat) ?? 0) + amt);
      if (!mk) continue; // χωρίς μήνα δεν μπορεί να μπει σε budget/rollover παράθυρο
      let byCat = byMonth.get(mk);
      if (!byCat) byMonth.set(mk, (byCat = new Map<string, number>()));
      byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
      totalByMonth.set(mk, (totalByMonth.get(mk) ?? 0) + amt);
    }
  }
  return { all, byMonth, totalByMonth };
}
