import type { SerializedStatement, SerializedTransaction } from '@/types';
import { computeInstallmentPlans } from './installments';

const cents = (n: number) => Math.round(n * 100) / 100;
export const statementCardKey = (s: Pick<SerializedStatement, 'cardId' | 'card'>) => s.cardId || s.card;

/** Payments are already included in the bank's closing balance. Refunds are not payments. */
export function isCardPayment(t: Pick<SerializedTransaction, 'amount' | 'description' | 'category'>): boolean {
  if (t.amount >= 0) return false;
  if (t.category === 'card-payment') return true;
  const text = t.description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  return /\b(?:PAYED CARD|PAID CARD|CARD PAYMENT|PAYMENT RECEIVED|PAYMENT THANK YOU|PAYMENT - THANK YOU)\b|ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ|ΚΑΤΑΒΟΛΗ|ΕΞΟΦΛΗΣΗ ΚΑΡΤΑΣ/.test(text);
}

export function statementPaymentSummary(s: SerializedStatement) {
  const paymentsIncluded = cents(s.transactions.filter(isCardPayment).reduce((n, t) => n - t.amount, 0));
  const charges = cents(s.transactions.reduce((n, t) => n + Math.max(0, t.amount), 0));
  const otherCredits = cents(s.transactions.filter(t => t.amount < 0 && !isCardPayment(t)).reduce((n, t) => n - t.amount, 0));
  const net = s.totalAmount - (s.paidAmount || 0);
  return {
    opening: cents(s.totalAmount - charges + paymentsIncluded + otherCredits),
    charges, paymentsIncluded, otherCredits, closing: s.totalAmount,
    additionalPaid: s.paidAmount || 0,
    due: cents(Math.max(0, net)), credit: cents(Math.max(0, -net)),
  };
}

export function latestCardStatements(statements: SerializedStatement[]) {
  const latest = new Map<string, SerializedStatement>();
  for (const s of statements) {
    const key = statementCardKey(s), prior = latest.get(key);
    if (!prior || s.period > prior.period || (s.period === prior.period && s.statementDate > prior.statementDate)) latest.set(key, s);
  }
  return [...latest.values()];
}

export function cardBalanceSummary(statements: SerializedStatement[]) {
  return latestCardStatements(statements).reduce((sum, s) => {
    const p = statementPaymentSummary(s);
    // Credit on one physical card cannot settle another card's bill.
    return { due: cents(sum.due + p.due), credit: cents(sum.credit + p.credit) };
  }, { due: 0, credit: 0 });
}

function monthNumber(key: string) { const [y, m] = key.slice(0, 7).split('-').map(Number); return y * 12 + m - 1; }
function monthKey(n: number) { return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`; }
export type PaymentHistoryRow = ReturnType<typeof statementPaymentSummary> & { id: string; period: string; card: string; cardKey: string };
export type PaymentForecastLine = { key: string; cardKey: string; card: string; label: string; amount: number; adjustment: boolean };
export type PaymentForecastMonth = { period: string; amount: number; lines: PaymentForecastLine[] };
export type StatementPaymentReport = { history: PaymentHistoryRow[]; forecast: PaymentForecastMonth[] };

/** Only known installment commitments, not unknown future spending/interest. A linked
 * bundle appears once with all product names; we cannot invent each product's share. */
export function buildStatementPaymentReport(
  statements: SerializedStatement[], titles: Map<string, string>, now: Date, months = 12,
): StatementPaymentReport {
  const count = Math.max(1, Math.min(24, Math.floor(months)));
  const current = now.getFullYear() * 12 + now.getMonth();
  const history = statements.filter(s => monthNumber(s.period) >= current - count + 1 && monthNumber(s.period) <= current)
    .map(s => ({ id: s._id, period: s.period, card: s.card, cardKey: statementCardKey(s), ...statementPaymentSummary(s) }))
    .sort((a, b) => b.period.localeCompare(a.period) || a.card.localeCompare(b.card));
  // Build each card separately: identical merchant purchases on different cards are not one plan.
  const groups = new Map<string, SerializedStatement[]>();
  for (const s of statements) { const key = statementCardKey(s); groups.set(key, [...(groups.get(key) || []), s]); }
  const forecast: PaymentForecastMonth[] = Array.from({ length: count }, (_, i) => ({ period: monthKey(current + i + 1), amount: 0, lines: [] }));
  for (const [cardKey, group] of groups) {
    const latest = latestCardStatements(group)[0];
    const dueOffset = latest.dueDate ? Math.max(0, monthNumber(latest.dueDate) - monthNumber(latest.period)) : 0;
    let credit = statementPaymentSummary(latest).credit;
    const plans = computeInstallmentPlans(group);
    for (const month of forecast) {
      const target = monthNumber(month.period);
      const lines: PaymentForecastLine[] = [];
      for (const plan of plans) {
        const end = monthNumber(plan.projectedEndDate) + dueOffset;
        const last = end - plan.remainingInstallments;
        if (target <= last || target > end) continue;
        lines.push({ key: plan.key, cardKey, card: latest.card,
          label: plan.itemIds.map(id => titles.get(id)).filter(Boolean).join(' + ') || plan.label,
          amount: cents(plan.perAmount), adjustment: false });
      }
      const issued = group.filter(s => monthNumber(s.dueDate || s.period) === target)
        .sort((a, b) => b.period.localeCompare(a.period)).slice(0, 1);
      if (issued.length) {
        lines.length = 0;
        for (const s of issued) for (const tx of s.transactions) {
          if (tx.amount <= 0 || !tx.installmentInfo) continue;
          lines.push({ key: `${s._id}-${tx._id}`, cardKey, card: s.card,
            label: tx.matchedItemIds.map(id => titles.get(id)).filter(Boolean).join(' + ') || tx.description,
            amount: cents(tx.amount), adjustment: false });
        }
      }
      const projected = cents(lines.reduce((n, l) => n + l.amount, 0));
      // If a bank statement exists for this payment month, its remaining balance wins.
      const known = issued.length ? cents(issued.reduce((n, s) => n + statementPaymentSummary(s).due, 0)) : null;
      const appliedCredit = known === null && target > monthNumber(latest.dueDate || latest.period) ? Math.min(projected, credit) : 0;
      if (known === null) credit = cents(credit - appliedCredit);
      const amount = known ?? cents(projected - appliedCredit);
      if (amount !== projected || issued.length) lines.push({ key: `adjustment-${month.period}`, cardKey, card: latest.card, label: '', amount: cents(amount - projected), adjustment: true });
      month.lines.push(...lines);
      month.amount = cents(month.amount + amount);
    }
  }
  return { history, forecast };
}
