'use client';
import { cur } from "@/lib/money";
import { Package } from 'lucide-react';
import { shortMonth, type InstallmentPlan } from '@/lib/installments';

/**
 * Payoff card for a single installment plan. Shared by statements, items,
 * reports and the dashboard so the same purchase reads identically everywhere.
 */
export function InstallmentPlanCard({
  plan,
  itemTitles,
  compact,
}: {
  plan: InstallmentPlan;
  itemTitles?: string[]; // titles of the linked product(s), if any
  compact?: boolean;
}) {
  const pct =
    plan.totalInstallments > 0
      ? Math.round((plan.paidInstallments / plan.totalInstallments) * 100)
      : 0;
  const linked = (itemTitles ?? []).filter(Boolean);
  const label = linked.length ? linked.join(' + ') : plan.label;

  return (
    <div className="bg-[color:var(--color-surface-2)] rounded-xl p-3 border border-[color:var(--color-border)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold leading-snug line-clamp-2 flex items-center gap-1.5">
          {linked.length > 0 && <Package size={11} className="text-[color:var(--color-accent)] shrink-0" />}
          {label}
        </span>
        <span
          className="text-[10px] text-[color:var(--color-purple)] shrink-0 tabular-nums"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {plan.paidInstallments}/{plan.totalInstallments}
        </span>
      </div>
      <div className="h-1.5 bg-[color:var(--color-surface-3)] rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: plan.done ? 'var(--color-accent)' : 'var(--color-purple)' }}
        />
      </div>
      <div
        className="flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span>{cur()}{plan.perAmount.toFixed(2)}/mo</span>
        {plan.done ? (
          <span className="text-[color:var(--color-accent)]">paid off ✓</span>
        ) : (
          <span>
            {plan.remainingInstallments} left · ends {shortMonth(plan.projectedEndDate)}
          </span>
        )}
      </div>
      {!compact && !plan.done && plan.remainingAmount > 0 && (
        <p
          className="text-[10px] text-[color:var(--color-text-dim)] mt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {cur()}{plan.remainingAmount.toFixed(2)} remaining · {cur()}{plan.totalAmount.toFixed(2)} total
        </p>
      )}
      {/* Completed plans: show the total so the purchase is identifiable at a glance
          (no "remaining" to anchor it like active plans have). */}
      {plan.done && plan.totalAmount > 0 && (
        <p
          className="text-[10px] text-[color:var(--color-text-dim)] mt-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {cur()}{plan.totalAmount.toFixed(2)} total
        </p>
      )}
    </div>
  );
}
