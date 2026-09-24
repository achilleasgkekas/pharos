const fs = require('fs');
const file = 'apps/web/src/app/bills/actions.test.ts';
let content = fs.readFileSync(file, 'utf8');

const target = "  it('rolls back an automatic settlement when the remaining instalments no longer cover the bill', async () => {";
const replacement = `  it('never rolls back a settlement for a foreign bill without a rate, because it could never auto-settle', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, currency: 'USD', origAmount: 300, fxRate: 0, paidAt: new Date(), payments: [{ amount: 300 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, currency: 'USD', origAmount: 300, fxRate: 0, paidAt: new Date(), payments: [] });
    await removeBillPayment('b1', 'p1');
    expect(billUpdateOne).toHaveBeenCalledTimes(1); // pull only
  });

  it('rolls back an automatic settlement when the remaining instalments no longer cover the bill', async () => {`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
