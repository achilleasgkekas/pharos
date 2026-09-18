import { describe, it, expect } from 'vitest';
import { Expense } from './Expense';

describe('Expense model', () => {
  it('has a unique compound index on (kind, vendorKey, date, recurring, aiModel)', () => {
    // This unique index prevents race conditions from creating duplicate auto-recurring expenses
    // during concurrent generateDueRecurring calls. The MongoDB unique index enforces atomicity.
    const indexes = Expense.schema.indexes();
    const hasUniqueIndex = indexes.some(idx => {
      const fields = idx[0] as Record<string, number>;
      const options = idx[1] as { unique?: boolean };
      
      return fields.kind === 1 && 
             fields.vendorKey === 1 && 
             fields.date === 1 && 
             fields.recurring === 1 && 
             fields.aiModel === 1 &&
             options?.unique === true;
    });
    
    expect(hasUniqueIndex).toBe(true);
  });
});
