import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Expense } from '@/models/Expense';
import { Subscription } from '@/models/Subscription';
import { Task } from '@/models/Task';
import { Statement } from '@/models/Statement';
import { ShoppingListItem } from '@/models/ShoppingListItem';
import { computeInstallmentPlans } from '@/lib/installments';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedStatement } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/overview → headline counts + installments owed (for a mobile dashboard). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const s = await getAppSettings();
    const [items, shoppingList, receipts, expenses, subscriptions, openTasks, statements] = await Promise.all([
      Item.countDocuments(),
      ShoppingListItem.countDocuments({ checked: false }),
      Receipt.countDocuments(),
      Expense.countDocuments(),
      Subscription.countDocuments({ active: true }),
      Task.countDocuments({ status: { $ne: 'done' } }),
      Statement.find().lean(),
    ]);
    const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter((p) => !p.done);
    return NextResponse.json({
      counts: { items, shoppingList, receipts, expenses, subscriptions, openTasks },
      installmentsOwed: Math.round(plans.reduce((sum, p) => sum + p.remainingAmount, 0)),
      activeInstallmentPlans: plans.length,
      currency: s.currency,
    });
  });
}
