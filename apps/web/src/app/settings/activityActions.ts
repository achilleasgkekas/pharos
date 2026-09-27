'use server';
import type { Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { currentModel } from '@/lib/tenancy/connection';
import { withRequestTenant } from '@/lib/tenancy/request';
import { loadAttributionNames } from '@/lib/attribution';
import { ACTIVITY_LIMIT, mergeActivity, type ActivityEvent, type ActivityType } from '@/lib/activity';
import { OWNED_STATUSES } from '@/lib/itemStatus';
import { Item } from '@/models/Item';
import { Expense } from '@/models/Expense';
import { Receipt } from '@/models/Receipt';
import { Bill } from '@/models/Bill';
import { Subscription } from '@/models/Subscription';
import { Voucher } from '@/models/Voucher';
import { Document } from '@/models/Document';
import { Task } from '@/models/Task';
import { Goal } from '@/models/Goal';
import { SpecialDate } from '@/models/SpecialDate';
import { Vehicle } from '@/models/Vehicle';
import { VehicleLog } from '@/models/VehicleLog';
import { MeterReading } from '@/models/MeterReading';
import { ShoppingListItem } from '@/models/ShoppingListItem';

type Doc = Record<string, unknown> & { _id: unknown };

/** One attributed collection: how to name a record and where it lives in the app. */
type Source = {
  model: Model<never>;
  fields: string;
  type: (d: Doc) => ActivityType;
  title: (d: Doc) => string;
  /** `?open=` deep links only where the page supports them (useOpenParam). */
  href: (d: Doc) => string;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const open = (path: string, d: Doc) => `${path}?open=${String(d._id)}`;

const SOURCES: Source[] = [
  {
    model: Item as unknown as Model<never>,
    fields: 'title status',
    type: () => 'item',
    title: (d) => str(d.title),
    href: (d) => open((OWNED_STATUSES as readonly string[]).includes(str(d.status)) ? '/items' : '/shopping', d),
  },
  {
    model: Expense as unknown as Model<never>,
    fields: 'vendor category kind',
    type: (d) => (d.kind === 'income' ? 'income' : 'expense'),
    title: (d) => str(d.vendor) || str(d.category),
    href: (d) => open(d.kind === 'income' ? '/income' : '/expenses', d),
  },
  { model: Receipt as unknown as Model<never>, fields: 'store', type: () => 'receipt', title: (d) => str(d.store), href: (d) => open('/receipts', d) },
  { model: Bill as unknown as Model<never>, fields: 'title', type: () => 'bill', title: (d) => str(d.title), href: (d) => open('/bills', d) },
  { model: Subscription as unknown as Model<never>, fields: 'name', type: () => 'subscription', title: (d) => str(d.name), href: (d) => open('/subscriptions', d) },
  { model: Voucher as unknown as Model<never>, fields: 'title', type: () => 'voucher', title: (d) => str(d.title), href: (d) => open('/vouchers', d) },
  { model: Task as unknown as Model<never>, fields: 'title', type: () => 'task', title: (d) => str(d.title), href: (d) => open('/tasks', d) },
  { model: Document as unknown as Model<never>, fields: 'title', type: () => 'document', title: (d) => str(d.title), href: () => '/documents' },
  { model: Goal as unknown as Model<never>, fields: 'title', type: () => 'goal', title: (d) => str(d.title), href: () => '/savings' },
  { model: SpecialDate as unknown as Model<never>, fields: 'name', type: () => 'specialDate', title: (d) => str(d.name), href: () => '/special-dates' },
  { model: Vehicle as unknown as Model<never>, fields: 'name', type: () => 'vehicle', title: (d) => str(d.name), href: () => '/vehicles' },
  { model: VehicleLog as unknown as Model<never>, fields: 'kind description', type: () => 'vehicleLog', title: (d) => str(d.description) || str(d.kind), href: () => '/vehicles' },
  { model: MeterReading as unknown as Model<never>, fields: 'meter value unit', type: () => 'meterReading', title: (d) => `${str(d.meter)} ${d.value ?? ''} ${str(d.unit)}`.trim(), href: () => '/utilities' },
  { model: ShoppingListItem as unknown as Model<never>, fields: 'name', type: () => 'shoppingListItem', title: (d) => str(d.name), href: () => '/shopping-list' },
];

function toEvents(src: Source, docs: Doc[], kind: ActivityEvent['kind']): ActivityEvent[] {
  return docs.map((d) => ({
    kind,
    type: src.type(d),
    id: String(d._id),
    title: src.title(d) || '—',
    userId: String(kind === 'added' ? d.createdBy : d.deletedBy),
    at: new Date((kind === 'added' ? d.createdAt : d.deletedAt) as string).toISOString(),
    href: kind === 'added' && !d.deletedAt ? src.href(d) : null,
  }));
}

/**
 * P89 (#23): the last ~100 things household members added or moved to Trash, newest first.
 * Read-only, so any signed-in role may see it. Empty on a single-user instance, where the
 * Settings tab that shows it is hidden anyway: there is nobody else to be transparent with.
 */
export async function getHouseholdActivity(): Promise<ActivityEvent[]> {
  await requireUser();
  return withRequestTenant(async () => {
    if (!(await loadAttributionNames())) return [];
    await connectDB();
    const lists = await Promise.all(
      SOURCES.map(async (src) => {
        const M = await currentModel(src.model);
        const [added, deleted] = await Promise.all([
          M.find({ createdBy: { $ne: null } })
            .setOptions({ withDeleted: true })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_LIMIT)
            .select(`${src.fields} createdBy createdAt deletedAt`)
            .lean(),
          M.find({ deletedBy: { $ne: null }, deletedAt: { $ne: null } })
            .setOptions({ withDeleted: true })
            .sort({ deletedAt: -1 })
            .limit(ACTIVITY_LIMIT)
            .select(`${src.fields} deletedBy deletedAt`)
            .lean(),
        ]);
        return [...toEvents(src, added as Doc[], 'added'), ...toEvents(src, deleted as Doc[], 'deleted')];
      })
    );
    return mergeActivity(lists);
  });
}
