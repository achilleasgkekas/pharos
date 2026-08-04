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

/**
 * Redeem an activation code.
 *
 * Self-serve payment is closed on purpose right now (Stripe checkout answers 503 without
 * keys), so this is the only route to a paid plan: a code handed out personally. The button
 * below it, "Subscribe", still exists for the day payment opens and simply fails cleanly
 * until then — the two are deliberately separate so neither pretends to be the other.
 */
function ActivationCodeCard({ tenantSlug, onActivated }: { tenantSlug?: string; onActivated: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function redeem() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/saas/billing/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), ...(tenantSlug ? { tenant: tenantSlug } : {}) }),
      });
      let data: { plan?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON → fall back to the status */
      }
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not activate. Please check the code.' });
        return;
      }
      setMsg({ kind: 'ok', text: `Activated: ${data.plan} plan.` });
      setCode('');
      onActivated();
    } catch {
      setMsg({ kind: 'err', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <p className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        Activation code
      </p>
      <p className="mt-1 text-xs text-[color:var(--color-text-dim)]">
        Paid plans are activated by code while we are in private beta.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && redeem()}
          placeholder="YOUR-CODE"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-sm uppercase tracking-wider text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
        />
        <button
          type="button"
          onClick={redeem}
          disabled={busy || !code.trim()}
          className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 text-xs ${msg.kind === 'ok' ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
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

      {canManage && (
        <ActivationCodeCard tenantSlug={tenantSlug} onActivated={() => window.location.reload()} />
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
