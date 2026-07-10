'use client';

// Client interactivity for the user-facing Billing settings panel
// ((saas)/account/workspace/billing). Consumes the already-built control-plane routes:
//   /api/saas/billing/checkout  (POST { plan, tenant } → { url }  Stripe Checkout)
//   /api/saas/billing/portal    (POST { tenant }        → { url }  Stripe Billing Portal)
// The page server-renders the current billing summary; the buttons here POST to the action
// routes and, on success, do a FULL navigation to the returned Stripe-hosted URL (never an
// in-app router push — the destination is off-origin). Only ever mounted inside the
// SAAS_MODE-gated (saas) segment. A plain member (canManage false) sees the plans read-only.
import { useState } from 'react';
import { Pill } from './StatusBadge';
import { planCards, seatsLabel, type PlanCard } from './billingView';
import type { PlanKey } from '@/lib/billing/plans';

type Props = {
  tenantSlug: string;
  /** Current plan key of the workspace (drives which card is highlighted). */
  currentPlan: string;
  canManage: boolean;
  billingConfigured: boolean;
  /** A live Stripe subscription exists → show Manage (portal) instead of Subscribe. */
  hasSubscription: boolean;
};

/** Friendlier text for the JSON `{ error }` bodies the action routes return by status. */
function friendlyError(status: number, apiError: string | undefined): string {
  if (status === 503) return 'Billing is not configured on this deployment yet.';
  if (status === 409) return 'No active subscription to manage. Start a plan first.';
  if (status === 502) return 'The billing provider is temporarily unavailable. Try again shortly.';
  if (status === 403) return 'Only owners and admins can change billing.';
  return apiError || 'Something went wrong. Please try again.';
}

export function BillingPanel({
  tenantSlug,
  currentPlan,
  canManage,
  billingConfigured,
  hasSubscription,
}: Props) {
  // busy holds the plan key being checked out, or 'portal' during portal open, else null.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cards = planCards({ currentPlan, canManage, hasSubscription });

  /** POST to an action route and, on success, hand off to the Stripe-hosted URL. */
  async function startBilling(
    path: '/api/saas/billing/checkout' | '/api/saas/billing/portal',
    body: Record<string, unknown>,
    busyKey: string
  ) {
    if (busy) return;
    setBusy(busyKey);
    setError(null);
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setBusy(null);
      setError('Network error. Check your connection and try again.');
      return;
    }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON body — fall through to the status-based message.
    }
    if (!res.ok || typeof data.url !== 'string') {
      setBusy(null);
      setError(friendlyError(res.status, typeof data.error === 'string' ? data.error : undefined));
      return;
    }
    // Success: leave `busy` set (the button stays disabled) and navigate off-origin to Stripe.
    window.location.href = data.url;
  }

  function subscribe(plan: PlanKey) {
    void startBilling('/api/saas/billing/checkout', { plan, tenant: tenantSlug }, plan);
  }

  function manage() {
    void startBilling('/api/saas/billing/portal', { tenant: tenantSlug }, 'portal');
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="status"
          className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </div>
      )}

      {!billingConfigured && (
        <div
          role="status"
          className="rounded-lg border border-[color:var(--color-gold)]/45 bg-[color:var(--color-gold)]/10 px-3 py-2 text-sm text-[color:var(--color-gold)]"
        >
          Billing is not configured on this deployment yet — subscribing is disabled until Stripe
          keys are set.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <PlanCardView
            key={c.key}
            card={c}
            busy={busy}
            disabled={!billingConfigured}
            onSubscribe={() => subscribe(c.key)}
          />
        ))}
      </div>

      {canManage && hasSubscription && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Manage subscription
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">
            Change plan, update your payment method, view invoices, or cancel — all from Stripe&apos;s
            secure billing portal.
          </p>
          <button
            type="button"
            onClick={manage}
            disabled={!billingConfigured || busy !== null}
            className="mt-3 rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-50"
          >
            {busy === 'portal' ? 'Opening…' : 'Open billing portal'}
          </button>
        </section>
      )}

      {!canManage && (
        <p className="text-xs text-[color:var(--color-text-dim)]">
          Only owners and admins can change billing. Ask a workspace owner to manage the
          subscription.
        </p>
      )}
    </div>
  );
}

/** One plan card — feature list + (when applicable) a Subscribe button. */
function PlanCardView({
  card,
  busy,
  disabled,
  onSubscribe,
}: {
  card: PlanCard;
  busy: string | null;
  disabled: boolean;
  onSubscribe: () => void;
}) {
  const isBusy = busy === card.key;
  return (
    <div
      className={
        card.current
          ? 'flex flex-col rounded-2xl border border-[color:var(--color-accent)] bg-[color:var(--color-surface)] p-5'
          : 'flex flex-col rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-[color:var(--color-text)]">{card.name}</span>
        {card.current && <Pill tone="accent">current</Pill>}
      </div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
        {card.priceLabel}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-[color:var(--color-text-dim)]">
        <li>{card.aiLabel}</li>
        <li>{card.storageLabel}</li>
        <li>{seatsLabel(card.maxMembers)}</li>
        {card.customDomain && <li>Custom domain</li>}
      </ul>
      {card.checkoutable && (
        <button
          type="button"
          onClick={onSubscribe}
          disabled={disabled || busy !== null}
          className="mt-4 rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-50"
        >
          {isBusy ? 'Redirecting…' : `Subscribe to ${card.name}`}
        </button>
      )}
    </div>
  );
}
