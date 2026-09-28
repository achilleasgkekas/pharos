import { describe, expect, it } from 'vitest';
import {
  buildSubscriptionDetails,
  buildBillDetails,
  buildInstallmentDetails,
  buildRecurringDetails,
  buildGoalDetails,
  buildWarrantyDetails,
  buildVoucherDetails,
} from './details';

describe('Calendar event details builder (#356)', () => {
  it('builds subscription details with all required metadata', () => {
    const sub = {
      _id: 'sub123',
      name: 'Netflix Premium',
      provider: 'Netflix',
      amount: 19.99,
      currency: 'EUR',
      billingCycle: 'monthly',
      startDate: new Date('2024-01-01'),
      trialEndsAt: new Date('2024-01-31'),
      paymentMethod: 'Visa ···· 4242',
      notes: 'Family plan',
      url: 'https://netflix.com',
      space: 'Home',
    };
    const now = new Date('2026-09-28');
    const renewal = new Date('2026-10-01');
    const details = buildSubscriptionDetails(sub, renewal, now, 'EUR');

    expect(details.id).toBe('sub123');
    expect(details.kind).toBe('renewal');
    expect(details.title).toBe('Netflix Premium');
    expect(details.provider).toBe('Netflix');
    expect(details.amount).toBe(19.99);
    expect(details.currency).toBe('EUR');
    expect(details.billingCycle).toBe('monthly');
    expect(details.nextRenewal).toBe('2026-10-01');
    expect(details.daysUntil).toBe(3);
    expect(details.paymentMethod).toBe('Visa ···· 4242');
    expect(details.notes).toBe('Family plan');
    expect(details.url).toBe('https://netflix.com');
    expect(details.space).toBe('Home');
    expect(details.editUrl).toBe('/subscriptions?open=sub123');
  });

  it('builds bill details with partial payments and remaining balance', () => {
    const bill = {
      _id: 'bill1',
      title: 'Electricity July',
      vendor: 'PPC',
      amount: 150,
      currency: 'EUR',
      dueDate: new Date('2026-10-15'),
      paidAt: null,
      payments: [{ date: new Date('2026-09-20'), amount: 50, note: 'Deposit' }],
    };
    const details = buildBillDetails(bill, 100, 'EUR');
    expect(details.id).toBe('bill1');
    expect(details.kind).toBe('payable');
    expect(details.provider).toBe('PPC');
    expect(details.amount).toBe(100);
    expect(details.dueDate).toBe('2026-10-15');
    expect(details.paid).toBe(false);
    expect(details.partialPayments?.length).toBe(1);
    expect(details.partialPayments?.[0].amount).toBe(50);
  });

  it('builds installment plan details', () => {
    const plans = [
      { cardName: 'Mastercard', merchant: 'Apple Store', totalInstallments: 12, remainingInstallments: 4, perAmount: 100 },
    ];
    const details = buildInstallmentDetails(plans, 0);
    expect(details.kind).toBe('installments');
    expect(details.amount).toBe(100);
    expect(details.plans?.[0].planIndex).toBe(9);
    expect(details.plans?.[0].totalInstallments).toBe(12);
  });

  it('builds goal details with progress', () => {
    const goal = { _id: 'g1', title: 'Vacation Fund', targetDate: new Date('2026-12-31') };
    const details = buildGoalDetails(goal, 1000, 450);
    expect(details.kind).toBe('goal');
    expect(details.targetAmount).toBe(1000);
    expect(details.savedAmount).toBe(450);
    expect(details.deadline).toBe('2026-12-31');
  });

  it('builds warranty details', () => {
    const item = { _id: 'i1', title: 'MacBook Pro', store: 'Amazon', purchasedDate: new Date('2025-01-10'), warrantyUntil: new Date('2027-01-10') };
    const details = buildWarrantyDetails(item);
    expect(details.kind).toBe('warranty');
    expect(details.title).toBe('MacBook Pro');
    expect(details.store).toBe('Amazon');
    expect(details.purchaseDate).toBe('2025-01-10');
    expect(details.warrantyEnd).toBe('2027-01-10');
  });

  it('builds voucher details with copyable code', () => {
    const voucher = { _id: 'v1', title: 'Coffee discount', store: 'Starbucks', code: 'FALL2026', discount: '-20%', expiresAt: new Date('2026-10-31') };
    const details = buildVoucherDetails(voucher);
    expect(details.kind).toBe('voucher');
    expect(details.code).toBe('FALL2026');
    expect(details.discount).toBe('-20%');
  });
});
