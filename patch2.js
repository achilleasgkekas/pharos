const fs = require('fs');
const file = 'apps/web/src/app/expenses/actions.ts';
let code = fs.readFileSync(file, 'utf8');

// move import to top
code = code.replace(/import \{ randomUUID \} from 'node:crypto';\n\n/, '');
if (!code.includes("import { randomUUID }")) {
  code = "import { randomUUID } from 'node:crypto';\n" + code;
}

// fix inheritFromSeries signature
code = code.replace(
  /const inherited = await inheritFromSeries\(kind, vKey\);/g,
  'const inherited = await inheritFromSeries(kind, vKey, parsed?.amount);'
);

code = code.replace(
  /const inherited = await inheritFromSeries\(d\.kind, vendorKey\(d\.vendor\)\);/g,
  'const inherited = await inheritFromSeries(d.kind, vendorKey(d.vendor), d.amount);'
);

code = code.replace(
  /if \(\!inheritCache\.has\(k\)\) inheritCache\.set\(k, await inheritFromSeries\(rowKind, vKey\)\);/g,
  'if (!inheritCache.has(k)) inheritCache.set(k, await inheritFromSeries(rowKind, vKey, amount));'
);
// wait, we need to pass amount to inheritCache in csv
// let's look at importExpensesCsv
fs.writeFileSync(file, code);
