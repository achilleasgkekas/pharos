'use client';
import { useState } from 'react';
import { Ticket, CreditCard } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { VouchersClient } from './VouchersClient';
import { GiftCardsClient } from './GiftCardsClient';
import { giftCardBalance } from '@/lib/giftcard';
import type { SerializedVoucher, SerializedGiftCard } from '@/types';

// P32 — thin tab wrapper: Coupons (existing vouchers) | Gift cards (new balance
// tracker). Each tab renders its own <main> with its own header/filters below.
export function VouchersShell({ vouchers, giftCards }: { vouchers: SerializedVoucher[]; giftCards: SerializedGiftCard[] }) {
  const [tab, setTab] = useState<'coupons' | 'giftcards'>('coupons');
  const liveCards = giftCards.filter((g) => !g.archived && giftCardBalance(g.initialAmount, g.uses) > 0.009).length;
  const activeVouchers = vouchers.filter((v) => !v.used).length;

  const TabButton = ({ id, icon, label, count }: { id: 'coupons' | 'giftcards'; icon: React.ReactNode; label: string; count: number }) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors',
        tab === id ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {icon} {label}
      {count > 0 && (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', tab === id ? 'bg-black/20' : 'bg-[color:var(--color-surface-2)]')}>{count}</span>
      )}
    </button>
  );

  return (
    <>
      <div className="max-w-[1400px] mx-auto px-4 pt-6">
        <div className="flex gap-2">
          <TabButton id="coupons" icon={<Ticket size={15} />} label="Coupons" count={activeVouchers} />
          <TabButton id="giftcards" icon={<CreditCard size={15} />} label="Gift cards" count={liveCards} />
        </div>
      </div>
      {tab === 'coupons' ? <VouchersClient vouchers={vouchers} /> : <GiftCardsClient giftCards={giftCards} />}
    </>
  );
}
