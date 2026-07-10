import { connectDB } from '@/lib/db';
import { Voucher } from '@/models/Voucher';
import { GiftCard } from '@/models/GiftCard';
import { VouchersShell } from './VouchersShell';
import type { SerializedVoucher, SerializedGiftCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ vouchers: SerializedVoucher[]; giftCards: SerializedGiftCard[] }> {
  await connectDB();
  const [vouchers, giftCards] = await Promise.all([
    Voucher.find().sort({ used: 1, expiresAt: 1, createdAt: -1 }).lean(),
    GiftCard.find().sort({ archived: 1, expiresAt: 1, createdAt: -1 }).lean(),
  ]);
  return JSON.parse(JSON.stringify({ vouchers, giftCards }));
}

export default async function VouchersPage() {
  const { vouchers, giftCards } = await getData();
  return <VouchersShell vouchers={vouchers} giftCards={giftCards} />;
}
