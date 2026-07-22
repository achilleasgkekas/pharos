import { describe, it, expect } from 'vitest';
import { buildBookmarklet } from './bookmarklet';

describe('buildBookmarklet', () => {
  it('starts with the javascript: scheme', () => {
    expect(buildBookmarklet('https://pharos.example.com')).toMatch(/^javascript:/);
  });

  it('embeds the given origin as the popup target', () => {
    const bm = buildBookmarklet('https://pharos.example.com');
    expect(bm).toContain("'https://pharos.example.com/capture?url='");
  });

  it('strips a trailing slash from the origin', () => {
    const bm = buildBookmarklet('https://pharos.example.com/');
    expect(bm).toContain("'https://pharos.example.com/capture?url='");
    expect(bm).not.toContain('.com//capture');
  });

  it('encodes the current page URL at click time and opens a named popup', () => {
    const bm = buildBookmarklet('http://localhost:3000');
    expect(bm).toContain('encodeURIComponent(location.href)');
    expect(bm).toContain("window.open(");
    expect(bm).toContain("'pharosCapture'");
    expect(bm).toContain('noopener');
  });

  it('works with a subdomain origin (SaaS tenant)', () => {
    const bm = buildBookmarklet('https://acme.pharos.app');
    expect(bm).toContain("'https://acme.pharos.app/capture?url='");
  });
});
