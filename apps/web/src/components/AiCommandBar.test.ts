import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/locales/en';
import { el } from '@/lib/i18n/locales/el';

describe('AiCommandBar examples', () => {
  it('defines 4 localized example prompts in English', () => {
    expect(en['bar.example1']).toContain('Spotify');
    expect(en['bar.example2']).toContain('expense');
    expect(en['bar.example3']).toContain('shopping list');
    expect(en['bar.example4']).toContain('bills');
  });

  it('defines 4 localized example prompts in Greek', () => {
    expect(el['bar.example1']).toContain('Spotify');
    expect(el['bar.example2']).toContain('έξοδο');
    expect(el['bar.example3']).toContain('λίστα αγορών');
    expect(el['bar.example4']).toContain('λογαριασμούς');
  });
});
