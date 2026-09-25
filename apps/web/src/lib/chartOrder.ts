/**
 * Recharts 3 sorts a tooltip's rows by series name (and a legend's by label), where 2 kept the
 * order the series are drawn in. That turned "Income / Expense" into "Expense / Income" and
 * reordered the category legend alphabetically (#175). A constant key leaves the stable sort
 * with nothing to reorder, so rows stay in drawing order; a legend takes `itemSorter={null}`.
 */
export const keepSeriesOrder = (): number => 0;
