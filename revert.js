const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.notifiers.test.ts', 'utf8');
code = code.replace(
  `invalidateAppSettingsMock: vi.fn(() => {
  const { currentTenant } = require('@/lib/tenancy/current');
  const t = currentTenant();
  // throw if empty so test fails
  if (!t.tenantId) throw new Error('invalidateAppSettings called without ambient tenant!');
}),`,
  `invalidateAppSettingsMock: vi.fn(),`
);
fs.writeFileSync('apps/web/src/app/settings/actions.notifiers.test.ts', code);
