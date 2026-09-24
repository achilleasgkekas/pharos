const fs = require('fs');
const file = 'apps/web/src/app/bills/actions.test.ts';
let content = fs.readFileSync(file, 'utf8');

const target = "  it('the settling call never double-books an expense for the final instalment', async () => {";
const replacement = `  it('a foreign bill without an exchange rate is not auto-settled by payments', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'AWS', amount: 100, currency: 'USD', origAmount: 100, fxRate: 0, paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 100, currency: 'USD', origAmount: 100, fxRate: 0, paidAt: null, payments: [{ amount: 100 }] });
    const res = await logBillPayment('b1', { amount: 100, date: '05/07/2026' });
    expect(res).toEqual({ ok: true, settled: false });
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('the settling call never double-books an expense for the final instalment', async () => {`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
