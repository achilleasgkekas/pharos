import { describe, expect, it } from 'vitest';
import { expenseSaveBlocker, PERIOD_RE, monthOfDate, periodFollowsDate, periodForUpdate } from './expensePeriod';

// #355: moving an expense's date to another month kept its old period, so it went on counting in
// the old month (reproduced: date 2026-10-03 saved with period 2026-09).

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('periodForUpdate', () => {
  it('moves a period that only mirrored the old date', () => {
    expect(periodForUpdate('2026-09', day('2026-10-03'), { date: day('2026-09-28'), period: '2026-09' })).toBe('2026-10');
  });

  it('keeps a period set to another month on purpose (a September bill paid in October)', () => {
    expect(periodForUpdate('2026-09', day('2026-10-05'), { date: day('2026-10-02'), period: '2026-09' })).toBe('2026-09');
  });

  it('keeps a period the user changed in this edit', () => {
    expect(periodForUpdate('2026-08', day('2026-10-03'), { date: day('2026-09-28'), period: '2026-09' })).toBe('2026-08');
  });

  it('derives the period when none is sent', () => {
    expect(periodForUpdate('', day('2026-10-03'), null)).toBe('2026-10');
  });

  it('keeps the sent period when the record cannot be read', () => {
    expect(periodForUpdate('2026-09', day('2026-10-03'), null)).toBe('2026-09');
  });
});

describe('periodFollowsDate / PERIOD_RE / monthOfDate', () => {
  it('links an empty period or one equal to the date month', () => {
    expect(periodFollowsDate('', '2026-09-28')).toBe(true);
    expect(periodFollowsDate('2026-09', '2026-09-28')).toBe(true);
    expect(periodFollowsDate('2026-08', '2026-09-28')).toBe(false);
  });

  it('accepts only empty or a real YYYY-MM', () => {
    for (const ok of ['', '2026-09', '2026-12', '2026-01']) expect(PERIOD_RE.test(ok), ok).toBe(true);
    for (const bad of ['09/2026', '2026-9', '2026-13', '2026-00', '26-09', '2026-09-01']) expect(PERIOD_RE.test(bad), bad).toBe(false);
  });

  it('reads the month in UTC', () => {
    expect(monthOfDate(day('2026-10-01'))).toBe('2026-10');
  });
});

// #403 / #404: the save buttons are not a native submit, so this is what keeps a bad entry back.
describe('expenseSaveBlocker', () => {
  const t = (k: string) => `[${k}]`;
  it('passes a real date and a blank or real period', () => {
    expect(expenseSaveBlocker({ date: '2026-09-30', period: '' }, '', t)).toBe('');
    expect(expenseSaveBlocker({ date: '2026-09-30', period: '2026-08' }, '', t)).toBe('');
  });
  it('blocks a date the field flagged, even though it emitted no value', () => {
    expect(expenseSaveBlocker({ date: '', period: '' }, 'Enter a valid date', t)).toBe('Enter a valid date');
  });
  it('blocks an empty date and an impossible period', () => {
    expect(expenseSaveBlocker({ date: '', period: '' }, '', t)).toBe('[date.invalid]');
    expect(expenseSaveBlocker({ date: '2026-09-30', period: '2026-99' }, '', t)).toBe('[ex.periodInvalid]');
  });
});
