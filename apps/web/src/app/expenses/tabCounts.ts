// The number on the "To pay" tab: bills not yet paid and not archived.
import { connectDB } from '@/lib/db';
import { Bill as BillModel } from '@/models/Bill';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';

export async function getExpenseTabCounts(): Promise<{ toPay: number }> {
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    return { toPay: await Bill.countDocuments({ paidAt: null, archived: { $ne: true } }) };
  });
}
