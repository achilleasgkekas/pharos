import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Task as TaskModel } from '@/models/Task';
import { Statement as StatementModel } from '@/models/Statement';
import { ShoppingListItem as ShoppingListItemModel } from '@/models/ShoppingListItem';
import { currentModel } from '@/lib/tenancy/connection';
import { computeInstallmentPlans } from '@/lib/installments';
import { getAppSettings } from '@/lib/appSettings';
import type { SerializedStatement } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/overview → headline counts + installments owed (for a dashboard overview). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const Receipt = await currentModel(ReceiptModel);
    const Expense = await currentModel(ExpenseModel);
    const Subscription = await currentModel(SubscriptionModel);
    const Task = await currentModel(TaskModel);
    const Statement = await currentModel(StatementModel);
    const ShoppingListItem = await currentModel(ShoppingListItemModel);
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
