import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { SerializedCard, SerializedStatement } from '@/types';
import { LocaleProvider } from '@/components/LocaleProvider';
import { resolveDict } from '@/lib/i18n';

vi.mock('./actions', () => ({}));
vi.mock('./cards', () => ({}));
vi.mock('@/components/useOpenParam', () => ({ useOpenParam: vi.fn() }));

import { StatementsClient } from './StatementsClient';

it('renders corrected linked-card details in the statement list after a card edit', () => {
  const statement = { _id: 's1', cardId: 'c1', card: 'Wrong bank 1111', last4: '1111',
    period: '2026-09', totalAmount: 100, paidAmount: 0, transactions: [], currency: 'EUR' } as unknown as SerializedStatement;
  const card = { _id: 'c1', name: 'Correct Visa', last4: '4321', creditLimit: 1000,
    active: true } as SerializedCard;
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, {
    locale: 'en', currency: 'EUR', dict: resolveDict('en'),
    children: React.createElement(StatementsClient, { statements: [statement], cards: [card], items: [], ollamaUp: false }),
  }));
  expect(html).toContain('Correct Visa 4321');
  expect(html).not.toContain('Wrong bank');
  expect(html).not.toContain('1111');
});
