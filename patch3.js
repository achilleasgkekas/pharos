const fs = require('fs');
const file = 'apps/web/src/app/expenses/actions.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /async function inherited\(rowKind: Kind, vKey: string\) \{\s+const k = `\$\{rowKind\}\|\$\{vKey\}`;\s+if \(\!inheritCache\.has\(k\)\) inheritCache\.set\(k, await inheritFromSeries\(rowKind, vKey, amount\)\);\s+return inheritCache\.get\(k\) \?\? null;\s+\}/,
  `async function inherited(rowKind: Kind, vKey: string, amount: number) {
        const k = \`\${rowKind}|\${vKey}|\${amount}\`;
        if (!inheritCache.has(k)) inheritCache.set(k, await inheritFromSeries(rowKind, vKey, amount));
        return inheritCache.get(k) ?? null;
      }`
);

code = code.replace(
  /const inh = r\.category \? null : await inherited\(r\.kind, r\.vKey\);/,
  'const inh = r.category ? null : await inherited(r.kind, r.vKey, r.amount);'
);

fs.writeFileSync(file, code);
