const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.tenant.test.ts', 'utf8');
code = code.replace(/const reqMock = require\('@\/lib\/tenancy\/request'\);/, "const reqMock = await import('@/lib/tenancy/request');");
code = code.replace(/const \{ withTenant \} = require\('@\/lib\/tenancy\/current'\);/, "const { withTenant } = await import('@/lib/tenancy/current');");
fs.writeFileSync('apps/web/src/app/settings/actions.tenant.test.ts', code);
