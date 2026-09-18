const fs = require('fs');
let code = fs.readFileSync('apps/web/src/app/settings/actions.tenant.test.ts', 'utf8');
code = code.replace(/, not the shared default', \(\) => {/, ''); // remove dangling part
fs.writeFileSync('apps/web/src/app/settings/actions.tenant.test.ts', code);
