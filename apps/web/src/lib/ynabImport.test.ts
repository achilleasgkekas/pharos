import { describe, it, expect } from 'vitest';
import { detectYnabColumns, mapYnabRows, parseYnabCsv } from './ynabImport';

describe('detectYnabColumns', () => {
  it('detects the modern nYNAB combined "Category Group/Category" header', () => {
    const m = detectYnabColumns(['Account', 'Flag', 'Date', 'Payee', 'Category Group/Category', 'Category Group', 'Category', 'Memo', 'Outflow', 'Inflow', 'Cleared']);
    expect(m).toEqual({ date: 2, payee: 3, outflow: 8, inflow: 9, category: 4, memo: 7 });
  });

  it('detects the legacy YNAB4 "Master Category"/"Sub Category" split (best-effort: first match)', () => {
    const m = detectYnabColumns(['Account', 'Check Number', 'Date', 'Payee', 'Master Category', 'Sub Category', 'Memo', 'Outflow', 'Inflow', 'Cleared']);
    expect(m).not.toBeNull();
    expect(m?.date).toBe(2);
    expect(m?.payee).toBe(3);
    expect(m?.category).toBe(4); // "Master Category" — first plain (non-"…group…") category-ish column
    expect(m?.memo).toBe(6);
  });

  it('accepts a file with only Outflow (no Inflow column at all)', () => {
    const m = detectYnabColumns(['Date', 'Payee', 'Category', 'Memo', 'Outflow']);
    expect(m).toEqual({ date: 0, payee: 1, outflow: 4, inflow: -1, category: 2, memo: 3 });
  });

  it('returns null for a header missing Payee', () => {
    expect(detectYnabColumns(['Date', 'Description', 'Amount'])).toBeNull();
  });

  it('returns null for a header with neither Outflow nor Inflow', () => {
    expect(detectYnabColumns(['Date', 'Payee', 'Amount', 'Category'])).toBeNull();
  });

  it('returns null for a header missing Date', () => {
    expect(detectYnabColumns(['Payee', 'Outflow', 'Inflow'])).toBeNull();
  });

  it('returns -1 for category/memo when neither is present, without failing detection', () => {
    const m = detectYnabColumns(['Date', 'Payee', 'Outflow', 'Inflow']);
    expect(m).toEqual({ date: 0, payee: 1, outflow: 2, inflow: 3, category: -1, memo: -1 });
  });
});

describe('mapYnabRows', () => {
  const mapping = { date: 0, payee: 1, category: 2, memo: 3, outflow: 4, inflow: 5 };

  it('maps an outflow row to a negative amount', () => {
    const { rows, invalid, excluded } = mapYnabRows([['01/15/2026', 'Whole Foods', 'Groceries', '', '45.00', '']], mapping);
    expect(invalid).toBe(0);
    expect(excluded).toBe(0);
    expect(rows).toEqual([{ date: '2026-01-15', amount: -45, vendor: 'Whole Foods', category: 'Groceries', notes: '' }]);
  });

  it('maps an inflow row to a positive amount', () => {
    const { rows } = mapYnabRows([['01/20/2026', 'Employer', 'Salary', 'Jan paycheck', '', '2500.00']], mapping);
    expect(rows).toEqual([{ date: '2026-01-20', amount: 2500, vendor: 'Employer', category: 'Salary', notes: 'Jan paycheck' }]);
  });

  it('excludes a Transfer row and counts it separately from invalid rows', () => {
    const { rows, excluded, invalid } = mapYnabRows(
      [['01/15/2026', 'Transfer : Savings', '', '', '100.00', '']],
      mapping,
    );
    expect(rows).toEqual([]);
    expect(excluded).toBe(1);
    expect(invalid).toBe(0);
  });

  it('excludes a "Starting Balance" row', () => {
    const { rows, excluded } = mapYnabRows([['01/01/2026', 'Starting Balance', '', '', '', '1000.00']], mapping);
    expect(rows).toEqual([]);
    expect(excluded).toBe(1);
  });

  it('excludes a "Reconciliation Balance Adjustment" row (case-insensitive)', () => {
    const { rows, excluded } = mapYnabRows([['02/01/2026', 'reconciliation balance adjustment', '', '', '5.00', '']], mapping);
    expect(rows).toEqual([]);
    expect(excluded).toBe(1);
  });

  it('marks a row invalid when both Outflow and Inflow are blank/zero', () => {
    const { rows, invalid } = mapYnabRows([['01/15/2026', 'Nobody', '', '', '', '']], mapping);
    expect(rows).toEqual([]);
    expect(invalid).toBe(1);
  });

  it('marks a row invalid when the date does not parse', () => {
    const { rows, invalid } = mapYnabRows([['not-a-date', 'Store', '', '', '10.00', '']], mapping);
    expect(rows).toEqual([]);
    expect(invalid).toBe(1);
  });

  it('marks a row invalid when the payee is blank', () => {
    const { rows, invalid } = mapYnabRows([['01/15/2026', '', '', '', '10.00', '']], mapping);
    expect(rows).toEqual([]);
    expect(invalid).toBe(1);
  });

  it('treats an explicit "0.00" outflow/inflow as absent (falls through to the other column)', () => {
    const { rows } = mapYnabRows([['01/15/2026', 'Store', '', '', '0.00', '12.00']], mapping);
    expect(rows).toEqual([{ date: '2026-01-15', amount: 12, vendor: 'Store', category: '', notes: '' }]);
  });

  it('works with no category/memo columns (mapping index -1)', () => {
    const m = { date: 0, payee: 1, category: -1, memo: -1, outflow: 2, inflow: 3 };
    const { rows } = mapYnabRows([['01/15/2026', 'Store', '10.00', '']], m);
    expect(rows).toEqual([{ date: '2026-01-15', amount: -10, vendor: 'Store', category: '', notes: '' }]);
  });
});

describe('parseYnabCsv', () => {
  it('parses a full CSV end to end', () => {
    const csv = [
      'Account,Flag,Date,Payee,Category Group/Category,Category Group,Category,Memo,Outflow,Inflow,Cleared',
      'Checking,,01/15/2026,Whole Foods,Groceries: Produce,Groceries,Produce,,45.00,,Cleared',
      'Checking,,01/20/2026,Employer,Income: Salary,Income,Salary,Jan paycheck,,2500.00,Cleared',
      'Checking,,01/01/2026,Starting Balance,,,,,,1000.00,Cleared',
    ].join('\n');
    const { mapping, result } = parseYnabCsv(csv);
    expect(mapping).not.toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.excluded).toBe(1);
    expect(result.rows[0]).toMatchObject({ vendor: 'Whole Foods', amount: -45 });
    expect(result.rows[1]).toMatchObject({ vendor: 'Employer', amount: 2500 });
  });

  it('returns a null mapping for a non-YNAB CSV', () => {
    const csv = 'Date,Description,Amount\n2026-01-01,Coffee,-4.50';
    const { mapping, result } = parseYnabCsv(csv);
    expect(mapping).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('returns a null mapping for an empty file', () => {
    const { mapping } = parseYnabCsv('');
    expect(mapping).toBeNull();
  });
});
