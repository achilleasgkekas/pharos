import { connectDB } from '@/lib/db';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { VouchersClient } from './VouchersClient';
import type { SerializedVoucher } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<SerializedVoucher[]> {
  return withRequestTenant(async () => {
    await connectDB();
    const Voucher = await currentModel(VoucherModel);
    const vouchers = await Voucher.find().sort({ used: 1, expiresAt: 1, createdAt: -1 }).lean();
    return JSON.parse(JSON.stringify(vouchers));
  });
}

// Coupons only. Gift cards (P32) and loyalty cards (P20) used to sit here as two more tabs;
// both were removed 2026-09-24 — the owner never used either (0 records of each), and a
// page that is one list does not need a tab bar.
export default async function VouchersPage() {
  return <VouchersClient vouchers={await getData()} />;
}
