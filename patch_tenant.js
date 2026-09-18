const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.tenant.test.ts', 'utf8');
code = code.replace(
  'invalidateAppSettings: () => {},',
  `invalidateAppSettings: () => {
    // Capture the ambient tenant at the time invalidateAppSettings is called
    const { currentTenant } = require('@/lib/tenancy/current');
    log(currentTenant().slug || 'default', 'invalidateAppSettings', {});
  },`
);
code = code.replace(
  `import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from './actions';`,
  `import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash, saveDefaults } from './actions';`
);
// Make withRequestTenant actually drop the context!
// Wait, currently it's async (fn) => fn(), which PRESERVES the context from withTenant(acme, () => ...)
// Wait, if it preserves the context, the test will NOT fail!
// Because withTenant(acme, ...) wraps the WHOLE TEST in the acme context.
