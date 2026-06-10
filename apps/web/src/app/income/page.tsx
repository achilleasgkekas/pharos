import { getExpenseData } from '../expenses/page';
import { ExpensesClient } from '../expenses/ExpensesClient';

export const dynamic = 'force-dynamic';

export default async function IncomePage() {
  const data = await getExpenseData('income');
  return <ExpensesClient kind="income" {...data} />;
}
