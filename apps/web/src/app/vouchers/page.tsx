import { connectDB } from '@/lib/db';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { LoyaltyCard as LoyaltyCardModel } from '@/models/LoyaltyCard';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { VouchersShell } from './VouchersShell';
import type { SerializedVoucher, SerializedGiftCard, SerializedLoyaltyCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ vouchers: SerializedVoucher[]; giftCards: SerializedGiftCard[]; loyaltyCards: SerializedLoyaltyCard[] }> {
  // The three sibling action files already write through this seam; reading outside it would
  // show the default tenant's rows in SaaS mode. Self-hosted: same default connection as before.
  return withRequestTenant(async () => {
    await connectDB();
    const [Voucher, GiftCard, LoyaltyCard] = await Promise.all([
      currentModel(VoucherModel),
      currentModel(GiftCardModel),
      currentModel(LoyaltyCardModel),
    ]);
    const [vouchers, giftCards, loyaltyCards] = await Promise.all([
      Voucher.find().sort({ used: 1, expiresAt: 1, createdAt: -1 }).lean(),
      GiftCard.find().sort({ archived: 1, expiresAt: 1, createdAt: -1 }).lean(),
      LoyaltyCard.find().sort({ archived: 1, createdAt: -1 }).lean(),
    ]);
    return JSON.parse(JSON.stringify({ vouchers, giftCards, loyaltyCards }));
  });
}

export default async function VouchersPage() {
  const { vouchers, giftCards, loyaltyCards } = await getData();
  return <VouchersShell vouchers={vouchers} giftCards={giftCards} loyaltyCards={loyaltyCards} />;
}
