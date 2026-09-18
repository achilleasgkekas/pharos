const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.tenant.test.ts', 'utf8');

const testCode = `
  it('saveDefaults invalidates the correct tenant cache (bug #162)', async () => {
    // we must mock withRequestTenant to actually run with acme to simulate a server action context
    const reqMock = require('@/lib/tenancy/request');
    const { withTenant } = require('@/lib/tenancy/current');
    
    // Backup the old mock
    const oldWithRequestTenant = reqMock.withRequestTenant;
    
    // Simulate that softRequestTenant resolves to acme
    reqMock.softRequestTenant = async () => acme;
    reqMock.withRequestTenant = async (fn) => withTenant(acme, fn);
    
    const formData = new FormData();
    await saveDefaults(formData);
    
    // We expect the updateOne to land in 'acme'
    expect(writes.get('acme')).toBeDefined();
    
    // Restore the mocks
    reqMock.withRequestTenant = oldWithRequestTenant;
  });
`;

code = code.replace(
  `import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash } from './actions';`,
  `import { setAiEnabled, saveBudgets, getTrash, restoreFromTrash, purgeTrashEntry, emptyTrash, saveDefaults } from './actions';`
);

code = code.replace(
  `describe('settings write to the CURRENT workspace, not the shared default', () => {`,
  `describe('settings write to the CURRENT workspace, not the shared default', () => {${testCode}`
);

fs.writeFileSync('apps/web/src/app/settings/actions.tenant.test.ts', code);
