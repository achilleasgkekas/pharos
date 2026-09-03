import { describe, it, expect } from 'vitest';
import { assetLabelUrl, assetLabelSubtitle, buildAssetLabelSheet } from './assetLabel';

// P56 — a printed sticker cannot be patched after the fact, so the rules that decide what
// ends up on it are pinned here rather than only exercised through the modal.

describe('assetLabelUrl', () => {
  it('builds the ordinary ?open= deep link off the serving origin', () => {
    expect(assetLabelUrl('https://app.ph-aros.com', 'abc123')).toBe('https://app.ph-aros.com/items?open=abc123');
  });

  it('works off a LAN origin, which is the whole point of not configuring a host', () => {
    expect(assetLabelUrl('http://192.168.1.10:3000', 'abc123')).toBe('http://192.168.1.10:3000/items?open=abc123');
  });

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(assetLabelUrl('https://app.ph-aros.com/', 'abc')).toBe('https://app.ph-aros.com/items?open=abc');
  });

  it('escapes the id instead of trusting it into the query string', () => {
    expect(assetLabelUrl('https://x.test', 'a b&c')).toBe('https://x.test/items?open=a%20b%26c');
  });

  it('returns nothing for a missing id, so the caller renders no tag at all', () => {
    expect(assetLabelUrl('https://x.test', '   ')).toBe('');
  });
});

describe('assetLabelSubtitle', () => {
  it('leads with the serial — on a shelf of identical boxes it is what tells two apart', () => {
    expect(assetLabelSubtitle({ serialNumber: 'SN-9', location: 'Rack 2', category: 'Network' })).toBe(
      'S/N SN-9 · Rack 2 · Network',
    );
  });

  it('skips the fields the item does not have', () => {
    expect(assetLabelSubtitle({ location: 'Garage' })).toBe('Garage');
  });

  it('is empty when the item carries none of them', () => {
    expect(assetLabelSubtitle({})).toBe('');
  });

  it('clips instead of overflowing the tag', () => {
    const s = assetLabelSubtitle({ location: 'x'.repeat(200) });
    expect(s.length).toBeLessThanOrEqual(54);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('buildAssetLabelSheet', () => {
  it('emits one tag per label with its QR bitmap inlined', () => {
    const html = buildAssetLabelSheet([
      { title: 'Switch', subtitle: 'Rack 2', qrDataUrl: 'data:image/png;base64,AAA' },
      { title: 'AP', subtitle: '', qrDataUrl: 'data:image/png;base64,BBB' },
    ]);
    expect(html.match(/class="tag"/g)).toHaveLength(2);
    expect(html).toContain('data:image/png;base64,AAA');
    expect(html).toContain('Switch');
  });

  it('escapes the title — an item name is free text and lands inside markup', () => {
    const html = buildAssetLabelSheet([
      { title: '<script>x</script>', subtitle: 'a & b', qrDataUrl: 'data:image/png;base64,AAA' },
    ]);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('omits the subtitle line entirely when there is nothing to say', () => {
    const html = buildAssetLabelSheet([{ title: 'AP', subtitle: '  ', qrDataUrl: 'data:image/png;base64,BBB' }]);
    expect(html).not.toContain('class="sub"');
  });

  it('clips a long title rather than letting it push the QR off the tag', () => {
    const html = buildAssetLabelSheet([
      { title: 'A'.repeat(200), subtitle: '', qrDataUrl: 'data:image/png;base64,AAA' },
    ]);
    const title = /<div class="title">([^<]*)<\/div>/.exec(html)?.[1] ?? '';
    expect(title.length).toBeLessThanOrEqual(44);
    expect(title.endsWith('…')).toBe(true);
  });

  it('keeps a tag whole across a page break — half a QR scans as nothing', () => {
    expect(buildAssetLabelSheet([])).toContain('page-break-inside: avoid');
  });
});
