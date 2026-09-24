const fs = require('fs');
const file = 'apps/web/src/app/expenses/ExpensesClient.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "{monthMissingRate > 0 && <p className=\"text-xs text-[color:var(--color-gold)] mt-1\" style={{ fontFamily: 'var(--font-mono)' }}>+ {monthMissingRate} w/o rate</p>}",
  "{monthMissingRate > 0 && <p className=\"text-xs text-[color:var(--color-gold)] mt-1 flex items-center gap-1\" style={{ fontFamily: 'var(--font-mono)' }} title={t('reports.fxMissing', { n: monthMissingRate })}><AlertTriangle size={12} /> {monthMissingRate}</p>}"
);

content = content.replace(
  "{yearMissingRate > 0 && <p className=\"text-xs text-[color:var(--color-gold)] mt-1\" style={{ fontFamily: 'var(--font-mono)' }}>+ {yearMissingRate} w/o rate</p>}",
  "{yearMissingRate > 0 && <p className=\"text-xs text-[color:var(--color-gold)] mt-1 flex items-center gap-1\" style={{ fontFamily: 'var(--font-mono)' }} title={t('reports.fxMissing', { n: yearMissingRate })}><AlertTriangle size={12} /> {yearMissingRate}</p>}"
);

fs.writeFileSync(file, content);
