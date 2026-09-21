import { describe, it, expect } from 'vitest';
import {
  buildCardUtilization,
  utilizationLevel,
  UTILIZATION_WARN,
  UTILIZATION_HIGH,
} from './cardUtilization';

const card = (over: Partial<Parameters<typeof buildCardUtilization>[0][number]> = {}) => ({
  _id: 'c1',
  name: 'Mastercard',
  last4: '7791',
  creditLimit: 3000,
  ...over,
});

const stmt = (over: Partial<Parameters<typeof buildCardUtilization>[1][number]> = {}) => ({
  card: 'Mastercard 7791',
  cardId: 'c1',
  period: '2026-08',
  totalAmount: 600,
  paidAmount: 0,
  ...over,
});

describe('utilizationLevel', () => {
  it('classifies against the two fixed thresholds', () => {
    expect(utilizationLevel(0)).toBe('ok');
    expect(utilizationLevel(UTILIZATION_WARN - 1)).toBe('ok');
    expect(utilizationLevel(UTILIZATION_WARN)).toBe('warn');
    expect(utilizationLevel(UTILIZATION_HIGH - 1)).toBe('warn');
    expect(utilizationLevel(UTILIZATION_HIGH)).toBe('high');
    expect(utilizationLevel(140)).toBe('high');
  });
});

describe('buildCardUtilization', () => {
  it('divides the latest statement balance by the limit', () => {
    const { byCardId } = buildCardUtilization([card()], [stmt()]);
    const u = byCardId.get('c1')!;
    expect(u.outstanding).toBe(600);
    expect(u.creditLimit).toBe(3000);
    expect(u.pct).toBe(20);
    expect(u.level).toBe('ok');
  });

  it('subtracts what has been paid on that statement', () => {
    const { byCardId } = buildCardUtilization(
      [card()],
      [stmt({ totalAmount: 1500, paidAmount: 900 })],
    );
    expect(byCardId.get('c1')!.outstanding).toBe(600);
    expect(byCardId.get('c1')!.pct).toBe(20);
  });

  it('uses only the LATEST statement, never the sum of periods', () => {
    // Each statement total IS the balance at that moment; summing would triple it.
    const { byCardId } = buildCardUtilization(
      [card()],
      [
        stmt({ period: '2026-06', totalAmount: 900 }),
        stmt({ period: '2026-08', totalAmount: 2400 }),
        stmt({ period: '2026-07', totalAmount: 1200 }),
      ],
    );
    expect(byCardId.get('c1')!.outstanding).toBe(2400);
    expect(byCardId.get('c1')!.pct).toBe(80);
    expect(byCardId.get('c1')!.level).toBe('warn');
  });

  it('flags a card that is effectively full', () => {
    const { byCardId } = buildCardUtilization([card()], [stmt({ totalAmount: 2900 })]);
    expect(byCardId.get('c1')!.pct).toBe(97);
    expect(byCardId.get('c1')!.level).toBe('high');
  });

  it('reports over 100% when the balance exceeds the limit', () => {
    const { byCardId } = buildCardUtilization([card()], [stmt({ totalAmount: 3600 })]);
    expect(byCardId.get('c1')!.pct).toBe(120);
    expect(byCardId.get('c1')!.level).toBe('high');
  });

  it('clamps a credit balance to 0% instead of going negative', () => {
    const { byCardId } = buildCardUtilization(
      [card()],
      [stmt({ totalAmount: 400, paidAmount: 700 })],
    );
    expect(byCardId.get('c1')!.outstanding).toBe(0);
    expect(byCardId.get('c1')!.pct).toBe(0);
  });

  it('skips cards without a limit, rather than inventing a denominator', () => {
    const { byCardId, byLabel } = buildCardUtilization(
      [card({ creditLimit: 0 }), card({ _id: 'c2', name: 'Visa', last4: '1111' })],
      [stmt(), stmt({ card: 'Visa 1111', cardId: 'c2', totalAmount: 300 })],
    );
    expect(byCardId.has('c1')).toBe(false);
    expect(byCardId.get('c2')!.pct).toBe(10);
    expect(byLabel.has('Mastercard 7791')).toBe(false);
  });

  it('treats a missing limit field the same as no limit', () => {
    const { byCardId } = buildCardUtilization([card({ creditLimit: undefined })], [stmt()]);
    expect(byCardId.size).toBe(0);
  });

  it('omits unknown usage when no statement exists', () => {
    expect(buildCardUtilization([card()], []).byCardId.size).toBe(0);
  });

  it('matches by label when the statement carries no cardId', () => {
    const { byCardId } = buildCardUtilization(
      [card()],
      [stmt({ cardId: null, totalAmount: 1500 })],
    );
    expect(byCardId.get('c1')!.pct).toBe(50);
  });

  it('indexes every unambiguous label variant of the same card', () => {
    const { byLabel } = buildCardUtilization([card()], [stmt()]);
    // buildCardLabel form, bare name, and name+last4 all point at the one card.
    expect(byLabel.get('Mastercard 7791')?.cardId).toBe('c1');
    expect(byLabel.get('Mastercard')?.cardId).toBe('c1');
  });

  it('drops an ambiguous label instead of attributing it to the first card', () => {
    const cards = [
      card({ _id: 'c1', name: 'Visa', last4: '1111' }),
      card({ _id: 'c2', name: 'Visa', last4: '2222' }),
    ];
    const { byLabel, byCardId } = buildCardUtilization(cards, [
      stmt({ card: 'Visa 1111', cardId: null, totalAmount: 300 }),
      stmt({ card: 'Visa 2222', cardId: null, totalAmount: 1500 }),
    ]);
    // Bare "Visa" is shared, so it resolves to neither.
    expect(byLabel.has('Visa')).toBe(false);
    // The distinguishing labels still work, and each card kept its own balance.
    expect(byLabel.get('Visa 1111')!.cardId).toBe('c1');
    expect(byCardId.get('c1')!.pct).toBe(10);
    expect(byCardId.get('c2')!.pct).toBe(50);
  });

  it('does not borrow a shared label to fill a card that has no statement', () => {
    const cards = [
      card({ _id: 'c1', name: 'Visa', last4: '1111' }),
      card({ _id: 'c2', name: 'Visa', last4: '2222' }),
    ];
    const { byCardId } = buildCardUtilization(cards, [
      stmt({ card: 'Visa', cardId: null, totalAmount: 2700 }),
    ]);
    expect(byCardId.size).toBe(0);
  });

  it('prefers the cardId link over a label that says otherwise', () => {
    const { byCardId } = buildCardUtilization(
      [card()],
      [
        stmt({ card: 'Renamed card', cardId: 'c1', period: '2026-08', totalAmount: 1200 }),
        stmt({ card: 'Mastercard 7791', cardId: null, period: '2026-09', totalAmount: 3000 }),
      ],
    );
    expect(byCardId.get('c1')!.outstanding).toBe(1200);
  });
});
