import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLDER_TEMPLATE,
  DEFAULT_NAME_TEMPLATE,
  TEMPLATE_TOKENS,
  renderStoragePath,
  type StorageTokens,
} from './storagePath';

// renderStoragePath is a pure, dependency-free path builder driven by user templates.
// The most important guarantee it must hold is that no token value can inject extra
// path segments (traversal / escaping the intended folder); the rest is cosmetic
// formatting. Tests below pin the ACTUAL behavior of sanitizeSegment, which maps illegal
// path chars and control chars to spaces (then underscores) but preserves hyphens, so a
// `{date}` keeps its dashes (2026-06-04) while a `{store}` with slashes is flattened.

const base: StorageTokens = {
  kind: 'receipts',
  store: 'Skroutz',
  date: '2026-06-04',
  total: 129.98,
  id: 'a1b2',
  ext: 'pdf',
};

describe('renderStoragePath — defaults', () => {
  it('renders a full path from the default folder + name templates', () => {
    const out = renderStoragePath(DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE, base);
    // {year}/{month} are unsanitized; {date} keeps its dashes; {store}/{id} pass through.
    expect(out).toBe('receipts/2026/06/2026-06-04_Skroutz_a1b2.pdf');
  });

  it('falls back to the default templates when passed empty strings', () => {
    const out = renderStoragePath('', '', base);
    expect(out).toBe('receipts/2026/06/2026-06-04_Skroutz_a1b2.pdf');
  });
});

describe('renderStoragePath — path-injection prevention', () => {
  it('collapses illegal path chars in a store name into one safe segment', () => {
    const out = renderStoragePath('{kind}/{store}', '{id}', { ...base, store: 'a/b:c*?' });
    // slashes/colons/globs become underscores; the store stays a single segment.
    expect(out).toBe('receipts/a_b_c/a1b2.pdf');
    // No traversal or extra depth introduced by the token value.
    expect(out.split('/')).toHaveLength(3);
  });

  it('flattens traversal attempts into a single harmless segment', () => {
    const out = renderStoragePath('{kind}/{store}', '{id}', { ...base, store: '../../etc' });
    // slashes collapse to underscores, so the value can never become real path depth.
    expect(out).toBe('receipts/_.._etc/a1b2.pdf');
    expect(out.split('/')).toHaveLength(3);
    expect(out).not.toContain('/../');
  });

  // The tests above all cover a traversal arriving through a TOKEN VALUE, which sanitizeSegment
  // has always handled. The literal template text was never sanitized at all (#196), so a folder
  // template typed with a stray `../` climbed out of the folder the user configured — and the
  // remote backends have no equivalent of the local `resolveWithinStorage` check to stop it.
  it('drops traversal segments written into the TEMPLATE itself, not just into a token', () => {
    expect(renderStoragePath('../../elsewhere', '{id}', base)).toBe('elsewhere/a1b2.pdf');
    expect(renderStoragePath('{kind}/../../..', '{id}', base)).toBe('receipts/a1b2.pdf');
    expect(renderStoragePath('..', '{id}', base)).toBe('a1b2.pdf');
  });

  it('drops a bare `.` segment too, which would otherwise become a literal folder named "."', () => {
    expect(renderStoragePath('./{kind}/./{year}', '{id}', { ...base, date: '2026-06-04' })).toBe('receipts/2026/a1b2.pdf');
  });

  it('leaves a name that merely CONTAINS dots alone — only whole `.`/`..` segments go', () => {
    expect(renderStoragePath('{kind}/..archive', '{id}', base)).toBe('receipts/..archive/a1b2.pdf');
    expect(renderStoragePath('{kind}/v1.2', '{id}', base)).toBe('receipts/v1.2/a1b2.pdf');
  });

  it('keeps the file name a single segment even if a token holds a slash', () => {
    const out = renderStoragePath('{kind}', '{store}', { ...base, store: 'foo/bar' });
    // store sanitized to foo_bar before it ever reaches the name assembly.
    expect(out).toBe('receipts/foo_bar.pdf');
  });
});

describe('renderStoragePath — empty-token collapse', () => {
  it('drops empty {total} and collapses the separators it leaves behind', () => {
    const out = renderStoragePath('{kind}', '{date}_{total}_{id}', { ...base, total: 0 });
    // total<=0 renders as '', so the double underscore collapses to one; date keeps dashes.
    expect(out).toBe('receipts/2026-06-04_a1b2.pdf');
  });

  it('collapses empty folder segments left by missing tokens', () => {
    const out = renderStoragePath('{kind}/{total}/{year}', '{id}', { ...base, total: 0 });
    // the empty {total} segment is filtered out entirely.
    expect(out).toBe('receipts/2026/a1b2.pdf');
  });

  it('defaults an entirely empty name to the id', () => {
    const out = renderStoragePath('{kind}', '{total}', { ...base, total: 0 });
    expect(out).toBe('receipts/a1b2.pdf');
  });
});

describe('renderStoragePath — date handling', () => {
  it('splits a YYYY-MM-DD date into year/month/day tokens', () => {
    const out = renderStoragePath('{year}/{month}/{day}', '{id}', base);
    expect(out).toBe('2026/06/04/a1b2.pdf');
  });

  it('yields empty year/month/day for a non-ISO date', () => {
    const out = renderStoragePath('{kind}/{year}/{month}', '{id}', { ...base, date: 'June 2026' });
    expect(out).toBe('receipts/a1b2.pdf');
  });
});

describe('renderStoragePath — extension handling', () => {
  it('strips leading dots and lowercases the extension', () => {
    const out = renderStoragePath('{kind}', '{id}', { ...base, ext: '.PDF' });
    expect(out).toBe('receipts/a1b2.pdf');
  });

  it('omits the extension entirely when ext is empty', () => {
    const out = renderStoragePath('{kind}', '{id}', { ...base, ext: '' });
    expect(out).toBe('receipts/a1b2');
  });
});

describe('renderStoragePath — token defaults', () => {
  it('falls back to sensible defaults for missing kind and store', () => {
    const out = renderStoragePath('{kind}/{store}', '{id}', {
      id: 'x9',
      ext: 'jpg',
    } as StorageTokens);
    expect(out).toBe('files/unknown/x9.jpg');
  });

  it('formats a positive total to two decimals', () => {
    const out = renderStoragePath('{kind}', '{total}', { ...base, total: 5 });
    expect(out).toBe('receipts/5.00.pdf');
  });
});

describe('TEMPLATE_TOKENS metadata', () => {
  it('documents each supported token exactly once', () => {
    const tokens = TEMPLATE_TOKENS.map((t) => t.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of ['{kind}', '{store}', '{date}', '{year}', '{month}', '{day}', '{total}', '{id}', '{original}']) {
      expect(tokens).toContain(t);
    }
  });
});
