// Server-only glue between the (client-safe) money module and the tenant store.
//
// `lib/money.ts` is imported on the CLIENT too (CurrencyInit), so it must not import the
// node-only tenant AsyncLocalStorage. This module — which is only ever reached from
// server code — injects a tenant-key resolver into money.ts so that, under an established
// SaaS tenant context, `cur()`/`setCurrencySymbol` isolate the symbol per tenant. On the
// client this module is never imported, so money.ts keeps its plain module-variable path
// and self-hosted behaviour is byte-for-byte unchanged.
import { bindCurrencyTenantResolver } from '../money';
import { currentTenant } from './current';

// Register once at import time. The resolver returns null for the default/self-hosted
// tenant (→ money.ts uses its module var, unchanged) and the tenant id otherwise.
bindCurrencyTenantResolver(() => {
  const ctx = currentTenant();
  return ctx.isDefault || !ctx.tenantId ? null : ctx.tenantId;
});
