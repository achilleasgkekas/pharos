const fs = require('fs');
let code = fs.readFileSync('apps/web/src/lib/appSettings.ts', 'utf8');

const newFn = `/** Clear the settings cache. No arg → only the CURRENT tenant; \`all\` → every tenant. */
export function invalidateAppSettings(all = false, explicitTenantId?: string | null): void {
  if (all) {
    cache.clear();
  } else if (explicitTenantId !== undefined) {
    cache.delete(keyFor({ isDefault: !explicitTenantId, tenantId: explicitTenantId }));
  } else {
    cache.delete(tenantKey());
  }
}`;

code = code.replace(
  /\/\*\* Clear the settings cache[\s\S]*?tenantKey\(\)\);\n\}/,
  newFn
);

fs.writeFileSync('apps/web/src/lib/appSettings.ts', code);
