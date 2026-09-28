// Anthropic Admin API integration for usage and cost reporting (#361).
// Requires an Admin API key (`sk-ant-admin...`).
// Endpoint: https://api.anthropic.com/v1/organizations/cost_report
// Note: Anthropic cost report amounts are returned in CENTS.

export type AnthropicCostBucket = {
  startingAt: string;
  endingAt: string;
  amountCents: number;
  amountDollars: number;
  workspaceId?: string;
  description?: string;
};

export type AnthropicCostReportResult = {
  ok: boolean;
  totalCostDollars: number;
  buckets: AnthropicCostBucket[];
  error?: string;
};

/**
 * Fetch cost report from Anthropic Admin API for a given ISO time range.
 * Converts amount from cents to dollars.
 */
export async function fetchAnthropicCostReport(opts: {
  adminKey: string;
  startingAt: string;
  endingAt?: string;
  bucketWidth?: '1d' | '1h';
}): Promise<AnthropicCostReportResult> {
  const { adminKey, startingAt, endingAt, bucketWidth = '1d' } = opts;
  if (!adminKey) {
    return { ok: false, totalCostDollars: 0, buckets: [], error: 'Admin API key is required' };
  }

  const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
  url.searchParams.set('starting_at', startingAt);
  if (endingAt) {
    url.searchParams.set('ending_at', endingAt);
  }
  url.searchParams.set('bucket_width', bucketWidth);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        totalCostDollars: 0,
        buckets: [],
        error: `Anthropic Admin API HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{
        starting_at: string;
        ending_at: string;
        amount: string | number; // in cents
        workspace_id?: string;
        description?: string;
      }>;
    };

    const buckets: AnthropicCostBucket[] = (data.data || []).map((b) => {
      const cents = Number(b.amount) || 0;
      return {
        startingAt: b.starting_at,
        endingAt: b.ending_at,
        amountCents: cents,
        amountDollars: Math.round(cents) / 100,
        workspaceId: b.workspace_id,
        description: b.description,
      };
    });

    const totalCostDollars = buckets.reduce((sum, b) => sum + b.amountDollars, 0);

    return {
      ok: true,
      totalCostDollars: Math.round(totalCostDollars * 10000) / 10000,
      buckets,
    };
  } catch (err) {
    return {
      ok: false,
      totalCostDollars: 0,
      buckets: [],
      error: (err as Error).message,
    };
  }
}

/**
 * Fetch billed amount by Anthropic for the current month in the given timezone.
 */
export async function getAnthropicMonthlyBilled(
  adminKey: string,
  timeZone: string = 'UTC'
): Promise<{
  ok: boolean;
  billedDollars: number;
  buckets: AnthropicCostBucket[];
  error?: string;
}> {
  if (!adminKey) {
    return { ok: false, billedDollars: 0, buckets: [] };
  }

  // Calculate start of current month
  const now = new Date();
  let startingAt = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(now);
      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      if (year && month) {
        startingAt = `${year}-${month}-01T00:00:00Z`;
      }
    } catch {
      // Fallback to UTC
    }
  }

  const result = await fetchAnthropicCostReport({
    adminKey,
    startingAt,
    bucketWidth: '1d',
  });

  return {
    ok: result.ok,
    billedDollars: result.totalCostDollars,
    buckets: result.buckets,
    error: result.error,
  };
}

/**
 * Calculate remaining credit balance estimate given initial prepaid credits and total spend.
 */
export function estimateCreditBalance(opts: {
  prepaidCredits: number;
  totalSpent: number;
  lowBalanceThreshold?: number; // default $5.00
}): {
  remainingBalance: number;
  lowBalance: boolean;
  pctRemaining: number;
} {
  const { prepaidCredits, totalSpent, lowBalanceThreshold = 5.0 } = opts;
  if (prepaidCredits <= 0) {
    return { remainingBalance: 0, lowBalance: false, pctRemaining: 0 };
  }

  const remaining = Math.max(0, prepaidCredits - totalSpent);
  const pctRemaining = Math.max(0, Math.min(100, Math.round((remaining / prepaidCredits) * 100)));
  const lowBalance = remaining <= lowBalanceThreshold || pctRemaining <= 15;

  return {
    remainingBalance: Math.round(remaining * 100) / 100,
    lowBalance,
    pctRemaining,
  };
}
