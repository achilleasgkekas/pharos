const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.tenant.test.ts', 'utf8');

const testCode = `
  it('saveDefaults invalidates the correct tenant cache', async () => {
    // We simulate a server action call: NO ambient tenant at the top level!
    // But withRequestTenant (inside scoped) will temporarily establish it.
    // The bug: invalidateAppSettings is called AFTER withRequestTenant finishes,
    // so it invalidates 'default' instead of 'acme'.
    
    // We need to override the mock of withRequestTenant to actually establish
    // the 'acme' context just for its callback.
    const { withTenant } = await import('@/lib/tenancy/current');
    
    // This is how withRequestTenant is implemented in production (roughly):
    // it figures out the tenant from headers and runs withTenant.
    // Here we hardcode it to use 'acme' when called.
    const reqMock = require('@/lib/tenancy/request');
    reqMock.withRequestTenant = async (fn) => withTenant(acme, fn);
    
    const formData = new FormData();
    await saveDefaults(formData);
    
    // We expect the updateOne to land in 'acme'
    expect(writes.get('acme')).toBeDefined();
    
    // We expect invalidateAppSettings to ALSO happen in 'acme' context
    const defaultWrites = writes.get('default') ?? [];
    const acmeWrites = writes.get('acme') ?? [];
    
    const defaultInvalidate = defaultWrites.some(w => w.op === 'invalidateAppSettings');
    const acmeInvalidate = acmeWrites.some(w => w.op === 'invalidateAppSettings');
    
    expect(defaultInvalidate).toBe(false);
    expect(acmeInvalidate).toBe(true);
  });
`;

code = code.replace(
  `describe('settings write to the CURRENT workspace`,
  `describe('settings write to the CURRENT workspace', () => {\n${testCode}`
);

// We also need to fix the replace I did earlier, because describe line changed
code = code.replace(
  `describe('settings write to the CURRENT workspace', () => {`,
  `describe('settings write to the CURRENT workspace', () => {`
); // no-op just matching

fs.writeFileSync('apps/web/src/app/settings/actions.tenant.test.ts', code);
