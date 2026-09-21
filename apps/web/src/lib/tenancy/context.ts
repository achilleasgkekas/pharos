// Compatibility types for existing feature modules. Pharos uses only MONGO_URI.
export type TenantPlan = 'free' | 'shared' | 'dedicated';
export type TenantStatus = 'pending' | 'trialing' | 'active' | 'suspended' | 'canceled';

export type TenantContext = {
  tenantId: string | null;
  slug: string;
  dbName: string;
  plan: TenantPlan;
  status: TenantStatus;
    isDefault: boolean;
    byoKey?: boolean;
};

export const DEFAULT_TENANT: TenantContext = Object.freeze({
  tenantId: null,
  slug: 'default',
  dbName: '',
  plan: 'dedicated',
  status: 'active',
  isDefault: true,
  byoKey: false,
});

export function dbNameFor(ctx: TenantContext): string {
  if (!ctx.isDefault || ctx.dbName || ctx.tenantId) {
    throw new Error('Hosted workspace databases are no longer supported');
  }
  return '';
}
