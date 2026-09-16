import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider, useMoney } from './LocaleProvider';
import { resolveDict, type Locale } from '@/lib/i18n';

function Amounts() {
  const money = useMoney();
  return React.createElement('span', null, money(1234.5), '|', money(12.5, 'USD'));
}

function render(locale: Locale, currency: string) {
  return renderToStaticMarkup(
    React.createElement(LocaleProvider, { locale, currency, dict: resolveDict(locale), children: React.createElement(Amounts) }),
  );
}

describe('money preferences in the render tree', () => {
  it('uses the saved currency and active locale, including foreign amounts', () => {
    expect(render('el', 'EUR')).toBe('<span>1.234,50\u00a0€|12,50\u00a0$</span>');
  });

  it('keeps independent renders isolated and follows a changed locale', () => {
    const greek = render('el', 'EUR');
    expect(render('en', 'GBP')).toBe('<span>£1,234.50|$12.50</span>');
    expect(render('el', 'EUR')).toBe(greek);
  });
});
