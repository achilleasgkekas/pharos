const fs = require('fs');
const file = 'apps/web/src/app/bills/actions.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import { resolveFx } from '@/lib/fx';",
  "import { resolveFx, needsFxRate } from '@/lib/fx';"
);

// updateBill
content = content.replace(
  "    const after = await Bill.findById(id).lean();\n    if (after && !after.paidAt && billIsSettledByPayments(after.amount, after.payments)) {",
  "    const after = await Bill.findById(id).lean();\n    const baseCurr = (await getAppSettings()).currency;\n    if (after && !after.paidAt && !needsFxRate(after, baseCurr) && billIsSettledByPayments(after.amount, after.payments)) {"
);

// logBillPayment
content = content.replace(
  "    const after = await Bill.findById(id).lean();\n    const settled = !!after && billIsSettledByPayments(after.amount, after.payments);",
  "    const after = await Bill.findById(id).lean();\n    const baseCurr = (await getAppSettings()).currency;\n    const settled = !!after && !needsFxRate(after, baseCurr) && billIsSettledByPayments(after.amount, after.payments);"
);

// removeBillPayment
content = content.replace(
  "    // thing that distinguishes the two ways a bill gets a `paidAt`: an automatic settlement, which\n    // this function is allowed to roll back, and a deliberate \"Mark paid\" click, which it is not —\n    // removing a stray instalment must never quietly un-pay a bill the user said was paid.\n    const wasSettledByPayments = billIsSettledByPayments(bill.amount, bill.payments);\n\n    await Bill.updateOne({ _id: id }, { $pull: { payments: { _id: paymentId } } });\n\n    // The guard used to be `after.payments.length > 0`, which reached for the same distinction and\n    // missed the one case that matters most: removing the LAST payment, i.e. undoing a settlement\n    // made by a single instalment that covered the whole bill. The count dropped to 0, the\n    // condition failed, and the bill stayed marked paid with nothing paid against it — the exact\n    // opposite of what this function's own comment promises (#203).\n    const after = await Bill.findById(id).lean();\n    if (after?.paidAt && wasSettledByPayments && !billIsSettledByPayments(after.amount, after.payments)) {",
  "    // thing that distinguishes the two ways a bill gets a `paidAt`: an automatic settlement, which\n    // this function is allowed to roll back, and a deliberate \"Mark paid\" click, which it is not —\n    // removing a stray instalment must never quietly un-pay a bill the user said was paid.\n    const baseCurr = (await getAppSettings()).currency;\n    const wasSettledByPayments = !needsFxRate(bill, baseCurr) && billIsSettledByPayments(bill.amount, bill.payments);\n\n    await Bill.updateOne({ _id: id }, { $pull: { payments: { _id: paymentId } } });\n\n    // The guard used to be `after.payments.length > 0`, which reached for the same distinction and\n    // missed the one case that matters most: removing the LAST payment, i.e. undoing a settlement\n    // made by a single instalment that covered the whole bill. The count dropped to 0, the\n    // condition failed, and the bill stayed marked paid with nothing paid against it — the exact\n    // opposite of what this function's own comment promises (#203).\n    const after = await Bill.findById(id).lean();\n    if (after?.paidAt && wasSettledByPayments && (!after || needsFxRate(after, baseCurr) || !billIsSettledByPayments(after.amount, after.payments))) {"
);

fs.writeFileSync(file, content);
