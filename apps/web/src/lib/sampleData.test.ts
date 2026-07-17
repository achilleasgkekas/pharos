import { describe, it, expect } from 'vitest';
import { buildSampleData } from './sampleData';

const NOW = new Date('2026-07-15T12:00:00Z');

describe('buildSampleData', () => {
  it('returns a non-empty set for every collection (en)', () => {
    const d = buildSampleData(NOW, 'en');
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.receipts.length).toBeGreaterThan(0);
    expect(d.expenses.length).toBeGreaterThan(0);
    expect(d.subscriptions.length).toBeGreaterThan(0);
  });

  it('tags every record isSample:true', () => {
    const d = buildSampleData(NOW, 'en');
    for (const group of [d.items, d.receipts, d.expenses, d.subscriptions]) {
      for (const rec of group) expect(rec.isSample).toBe(true);
    }
  });

  it('every date is on or before `now` (or a subscription renewal, which may be future)', () => {
    const d = buildSampleData(NOW, 'en');
    for (const it of d.items) {
      if (it.purchasedAt) expect((it.purchasedAt as Date).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    for (const r of d.receipts) expect((r.date as Date).getTime()).toBeLessThanOrEqual(NOW.getTime());
    for (const e of d.expenses) expect((e.date as Date).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('expense period matches the YYYY-MM of its date', () => {
    const d = buildSampleData(NOW, 'en');
    for (const e of d.expenses) {
      const date = e.date as Date;
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      expect(e.period).toBe(expected);
    }
  });

  it('receipts have no attached file (demo-only, no real binary)', () => {
    const d = buildSampleData(NOW, 'en');
    for (const r of d.receipts) expect(r.filePath).toBe('');
  });

  it('falls back to English content for an unsupported locale', () => {
    const en = buildSampleData(NOW, 'en');
    const fr = buildSampleData(NOW, 'fr');
    expect(fr.items.map((i) => i.title)).toEqual(en.items.map((i) => i.title));
  });

  it('produces a distinct Greek copy for locale=el', () => {
    const en = buildSampleData(NOW, 'en');
    const el = buildSampleData(NOW, 'el');
    expect(el.items[0].title).not.toBe(en.items[0].title);
    expect(el.items.length).toBe(en.items.length);
  });

  it('is deterministic for the same `now`', () => {
    const a = buildSampleData(NOW, 'en');
    const b = buildSampleData(NOW, 'en');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('only uses known default category slugs so icons/colors resolve', () => {
    const KNOWN_ITEM = new Set(['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other']);
    const KNOWN_EXPENSE = new Set(['rent', 'utilities', 'fuel', 'salary', 'insurance', 'telecom', 'groceries', 'transport', 'health', 'tax', 'subscription', 'other']);
    const KNOWN_SUB = new Set(['streaming', 'cloud', 'software', 'gaming', 'news', 'fitness', 'other']);
    const d = buildSampleData(NOW, 'en');
    for (const i of d.items) expect(KNOWN_ITEM.has(i.category as string)).toBe(true);
    for (const e of d.expenses) expect(KNOWN_EXPENSE.has(e.category as string)).toBe(true);
    for (const s of d.subscriptions) expect(KNOWN_SUB.has(s.category as string)).toBe(true);
  });
});
