import { describe, expect, it } from 'vitest';
import { buildStatementPaymentReport, cardBalanceSummary, statementPaymentSummary } from './statementPayments';
import type { SerializedStatement, SerializedTransaction } from '@/types';
const tx = (o: Partial<SerializedTransaction>) => ({ _id: 'tx', date: '2026-09-01', description: 'SHOP', amount: 100, category: 'other', installmentInfo: null, matchedItemIds: [], matchedReceiptId: null, ...o });
const stmt = (o: Partial<SerializedStatement> = {}) => ({ _id: 's', card: 'Visa', cardId: 'card1', last4: '1234', period: '2026-09', statementDate: '2026-09-20', dueDate: null, totalAmount: 0, paidAmount: 0, minimumPayment: 0, currency: 'EUR', transactions: [], notes: '', filePath: '', createdAt: '', updatedAt: '', ...o });
const now = new Date(2026, 8, 21);
describe('statement payment accounting', () => {
 it('does not subtract a payment printed in the bank statement twice', () => {
  const s = stmt({ totalAmount: 0, transactions: [tx({ amount: 100 }), tx({ description: 'PAYED CARD', amount: -100 })] });
  expect(statementPaymentSummary(s)).toMatchObject({ opening: 0, charges: 100, paymentsIncluded: 100, due: 0, credit: 0 });
 });
 it('keeps refunds separate and applies only additional payments to closing balance', () => {
  expect(statementPaymentSummary(stmt({ totalAmount: 80, paidAmount: 30, transactions: [tx({}), tx({ amount: -20, description: 'REFUND' })] }))).toMatchObject({ otherCredits: 20, paymentsIncluded: 0, due: 50 });
 });
 it('never offsets one card debt with another card credit and groups renamed cards by id', () => {
  expect(cardBalanceSummary([stmt({ period: '2026-08', totalAmount: 900 }), stmt({ card: 'Renamed', totalAmount: 100 }), stmt({ cardId: 'card2', totalAmount: -50 })])).toEqual({ due: 100, credit: 50 });
 });
});
describe('monthly payment forecasts', () => {
 const installments = stmt({ transactions: [tx({ installmentInfo: { currentInstallment: 2, totalInstallments: 4, originalPurchase: 'SHOP' }, matchedItemIds: ['a', 'b'] })] });
 it('uses scheduled months, selected horizon and one amount for a multi-product charge', () => {
  const r = buildStatementPaymentReport([installments], new Map([['a','Laptop'],['b','Mouse']]), now, 12);
  expect(r.forecast).toHaveLength(12);
  expect(r.forecast.slice(0,3).map(m => m.amount)).toEqual([100,100,0]);
  expect(r.forecast[0].lines[0].label).toBe('Laptop + Mouse');
 });
 it('does not restart old installment plans from today', () => {
  const old = { ...installments, period: '2026-01' };
  expect(buildStatementPaymentReport([old], new Map(), now, 6).forecast.every(m => m.amount === 0)).toBe(true);
 });
 it('applies a card credit once, not to every future month', () => {
  const r = buildStatementPaymentReport([{ ...installments, totalAmount: -150 }], new Map(), now, 6);
  expect(r.forecast.slice(0,3).map(m => m.amount)).toEqual([0,50,0]);
 });
 it('uses an issued balance instead of adding it to forecast installments', () => {
  const r = buildStatementPaymentReport([installments, stmt({ _id:'oct', period:'2026-10', totalAmount:40, paidAmount:10 })], new Map(), now, 6);
  expect(r.forecast[0].amount).toBe(30);
  expect(r.forecast[0].lines.reduce((n,l)=>n+l.amount,0)).toBe(30);
 });
 it('keeps equivalent plans on different cards separate', () => {
  const r = buildStatementPaymentReport([installments,{...installments, cardId:'card2'}],new Map(),now,6);
  expect(r.forecast[0].amount).toBe(200);
 });
});

it('projects after the statement due-month offset without double counting a settled statement', () => {
 const s=stmt({dueDate:'2026-10-10',transactions:[tx({installmentInfo:{currentInstallment:2,totalInstallments:4,originalPurchase:'SHOP'}})]});
 const r=buildStatementPaymentReport([s],new Map(),now,6);
 expect(r.forecast.slice(0,4).map(m=>m.amount)).toEqual([0,100,100,0]);
});
it('includes last-month debt, payments and remaining without inventing payment dates', () => {
 const s=stmt({period:'2026-08',totalAmount:70,paidAmount:20,transactions:[tx({amount:100}),tx({description:'PAYED CARD',amount:-50})]});
 expect(buildStatementPaymentReport([s],new Map(),now,6).history[0]).toMatchObject({period:'2026-08',opening:20,charges:100,paymentsIncluded:50,closing:70,additionalPaid:20,due:50});
});
it('does not add successive rolling balances due in the same month', () => {
 const a=stmt({period:'2026-08',dueDate:'2026-10-01',totalAmount:100});
 const b=stmt({period:'2026-09',dueDate:'2026-10-20',totalAmount:150});
 expect(buildStatementPaymentReport([a,b],new Map(),now,6).forecast[0].amount).toBe(150);
});
