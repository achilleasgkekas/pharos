import { connectDB } from '@/lib/db';
import { Voucher } from '@/models/Voucher';
import { VouchersClient } from './VouchersClient';
import type { SerializedVoucher } from '@/types';

export const dynamic = 'force-dynamic';

async function getVouchers(): Promise<SerializedVoucher[]> {
  await connectDB();
  const vouchers = await Voucher.find().sort({ used: 1, expiresAt: 1, createdAt: -1 }).lean();
  return JSON.parse(JSON.stringify(vouchers));
}

export default async function VouchersPage() {
  const vouchers = await getVouchers();
  return <VouchersClient vouchers={vouchers} />;
}
